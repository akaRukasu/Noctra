#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${NOCTRA_APP_DIR:-$HOME/apps/noctra}"
SERVICE_NAME="${NOCTRA_SERVICE_NAME:-noctra.service}"
SOURCE="${1:-}"
KEEP_ARCHIVE="${NOCTRA_KEEP_ARCHIVE:-0}"
TMP_ROOT=""
DOWNLOADED_ARCHIVE=""
BACKUP_DIR=""
SWAPPED=0

log() { printf '\033[1;36m[Noctra]\033[0m %s\n' "$*"; }
fail() { printf '\033[1;31m[Erreur]\033[0m %s\n' "$*" >&2; exit 1; }

cleanup() {
  [[ -n "$TMP_ROOT" && -d "$TMP_ROOT" ]] && rm -rf "$TMP_ROOT"
  if [[ -n "$DOWNLOADED_ARCHIVE" && "$KEEP_ARCHIVE" != "1" ]]; then
    rm -f "$DOWNLOADED_ARCHIVE"
  fi
}

rollback() {
  local status=$?
  if (( status != 0 )) && (( SWAPPED == 1 )) && [[ -n "$BACKUP_DIR" && -d "$BACKUP_DIR" ]]; then
    printf '\n\033[1;33m[Noctra]\033[0m Échec détecté, restauration automatique de la version précédente…\n' >&2
    systemctl --user stop "$SERVICE_NAME" >/dev/null 2>&1 || true
    [[ -d "$APP_DIR" ]] && mv "$APP_DIR" "${APP_DIR}-failed-$(date +%Y%m%d-%H%M%S)"
    mv "$BACKUP_DIR" "$APP_DIR"
    systemctl --user start "$SERVICE_NAME" >/dev/null 2>&1 || true
  fi
  cleanup
  exit "$status"
}
trap rollback EXIT

[[ -n "$SOURCE" ]] || fail "utilisation : noctra-update <archive.zip|URL-HTTPS>"
command -v unzip >/dev/null 2>&1 || fail "unzip est introuvable."
command -v node >/dev/null 2>&1 || fail "Node.js est introuvable."
command -v systemctl >/dev/null 2>&1 || fail "systemctl est introuvable."
[[ -d "$APP_DIR" ]] || fail "installation Noctra introuvable dans $APP_DIR"
[[ -f "$APP_DIR/.env" ]] || fail "configuration $APP_DIR/.env introuvable"

TMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/noctra-update.XXXXXX")"
ARCHIVE="$SOURCE"
if [[ "$SOURCE" =~ ^https:// ]]; then
  command -v curl >/dev/null 2>&1 || fail "curl est requis pour télécharger une URL."
  DOWNLOADED_ARCHIVE="$TMP_ROOT/noctra-release.zip"
  log "Téléchargement de la nouvelle version…"
  curl --fail --location --retry 3 --connect-timeout 15 --output "$DOWNLOADED_ARCHIVE" "$SOURCE"
  ARCHIVE="$DOWNLOADED_ARCHIVE"
elif [[ "$SOURCE" == ~/* ]]; then
  ARCHIVE="$HOME/${SOURCE#~/}"
else
  ARCHIVE="$(realpath "$SOURCE" 2>/dev/null || true)"
fi

[[ -f "$ARCHIVE" ]] || fail "archive introuvable : $SOURCE"
unzip -tq "$ARCHIVE" >/dev/null || fail "l'archive ZIP est invalide ou incomplète"

STAGE="$TMP_ROOT/stage"
mkdir -p "$STAGE"
log "Extraction et vérification…"
unzip -q "$ARCHIVE" -d "$STAGE"

NEW_DIR="$(find "$STAGE" -mindepth 1 -maxdepth 3 -type f -name server.mjs -printf '%h\n' | head -n 1)"
[[ -n "$NEW_DIR" && -f "$NEW_DIR/package.json" ]] || fail "structure de version Noctra non reconnue"
node --check "$NEW_DIR/server.mjs" >/dev/null
node --check "$NEW_DIR/public/noctra-shell.js" >/dev/null

NEW_VERSION="$(node -e "const p=require(process.argv[1]);process.stdout.write(String(p.version||''))" "$NEW_DIR/package.json")"
[[ "$NEW_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "numéro de version invalide dans package.json"
CURRENT_VERSION="$(node -e "try{const p=require(process.argv[1]);process.stdout.write(String(p.version||'inconnue'))}catch{}" "$APP_DIR/package.json")"
log "Mise à jour $CURRENT_VERSION → $NEW_VERSION"

cp "$APP_DIR/.env" "$NEW_DIR/.env"
chmod 600 "$NEW_DIR/.env"

# V90 : cette release personnelle peut embarquer une clé TMDB v3 à installer
# uniquement côté serveur. Elle est fusionnée dans .env puis supprimée du
# dossier applicatif avant le démarrage, donc elle n'est jamais servie au client.
RELEASE_TMDB_KEY_FILE="$NEW_DIR/ultra/.release-tmdb-key"
if [[ -f "$RELEASE_TMDB_KEY_FILE" ]]; then
  RELEASE_TMDB_KEY="$(tr -d '\r\n' < "$RELEASE_TMDB_KEY_FILE")"
  if [[ "$RELEASE_TMDB_KEY" =~ ^[a-fA-F0-9]{32}$ ]]; then
    if grep -qE '^[[:space:]]*TMDB_API_KEY[[:space:]]*=' "$NEW_DIR/.env"; then
      sed -i -E "s|^[[:space:]]*TMDB_API_KEY[[:space:]]*=.*$|TMDB_API_KEY=${RELEASE_TMDB_KEY}|" "$NEW_DIR/.env"
    elif ! grep -qE '^[[:space:]]*TMDB_BEARER_TOKEN[[:space:]]*=[[:space:]]*[^[:space:]]+' "$NEW_DIR/.env"; then
      printf '\nTMDB_API_KEY=%s\n' "$RELEASE_TMDB_KEY" >> "$NEW_DIR/.env"
    fi
  fi
  rm -f "$RELEASE_TMDB_KEY_FILE"
fi
mkdir -p "$NEW_DIR/runtime"
if [[ -d "$APP_DIR/runtime" ]]; then
  cp -a "$APP_DIR/runtime/." "$NEW_DIR/runtime/"
fi
[[ -d "$APP_DIR/logs" ]] && cp -a "$APP_DIR/logs" "$NEW_DIR/logs" 2>/dev/null || true

BACKUP_DIR="$HOME/apps/noctra-backup-$(date +%Y%m%d-%H%M%S)-v${CURRENT_VERSION}"
log "Arrêt du service et création de la sauvegarde…"
systemctl --user stop "$SERVICE_NAME"
mv "$APP_DIR" "$BACKUP_DIR"
mv "$NEW_DIR" "$APP_DIR"
SWAPPED=1

# 200.0.165 : reglage memoire WebAssembly du service. Sans lui, sur un service
# a memoire virtuelle limitee, toutes les requetes de Noctra echouent
# (« fetch failed », « Cannot allocate Wasm memory »). Ajoute dans un fichier
# complementaire du service (le service lui-meme n'est pas reecrit) ; un
# NODE_OPTIONS deja present est complete (copie gardee : .avant-wasm).
ensure_wasm_setting() {
  local unit="$HOME/.config/systemd/user/$SERVICE_NAME"
  [[ -f "$unit" ]] || return 0
  local node_bin
  node_bin="$(sed -nE 's/^ExecStart=([^[:space:]]+).*/\1/p' "$unit" | head -n 1)"
  [[ -x "$node_bin" ]] || node_bin="$(command -v node || true)"
  [[ -n "$node_bin" ]] || return 0
  "$node_bin" -e "process.exit(process.allowedNodeEnvironmentFlags.has('--disable-wasm-trap-handler')?0:1)" >/dev/null 2>&1 || return 0
  local dropdir="$unit.d" file
  if grep -qs -- '--disable-wasm-trap-handler' "$unit" "$dropdir"/*.conf; then return 0; fi
  if grep -qsE '^Environment="?NODE_OPTIONS=' "$unit" "$dropdir"/*.conf; then
    for file in "$unit" "$dropdir"/*.conf; do
      [[ -f "$file" ]] && grep -qE '^Environment="?NODE_OPTIONS=' "$file" || continue
      cp -p "$file" "$file.avant-wasm" 2>/dev/null || true
      sed -i -E 's/^(Environment="?NODE_OPTIONS=)/\1--disable-wasm-trap-handler /' "$file" || true
    done
  else
    mkdir -p "$dropdir"
    printf '[Service]\nEnvironment=NODE_OPTIONS=--disable-wasm-trap-handler\n' > "$dropdir/noctra-memoire-wasm.conf"
  fi
  log "Service : reglage memoire WebAssembly ajoute (NODE_OPTIONS=--disable-wasm-trap-handler)."
}
ensure_wasm_setting || true
systemctl --user daemon-reload
systemctl --user start "$SERVICE_NAME"

read_env() {
  local key="$1"
  sed -nE "s/^[[:space:]]*${key}[[:space:]]*=[[:space:]]*['\"]?([^'\"]*)['\"]?[[:space:]]*$/\\1/p" "$APP_DIR/.env" | tail -n 1
}
PORT="$(read_env PORT)"
BASE_URL="$(read_env BASE_URL)"
PORT="${PORT:-3000}"
BASE_URL="${BASE_URL%/}"

log "Vérification du service…"
HEALTH_URL="http://127.0.0.1:${PORT}${BASE_URL}/health"
HEALTH_OK=0
LAST_HEALTH=""
for _ in {1..25}; do
  LAST_HEALTH="$(curl --silent --fail --max-time 3 "$HEALTH_URL" 2>/dev/null || true)"
  if grep -q '"status":"ok"' <<<"$LAST_HEALTH" && grep -q "\"version\":\"${NEW_VERSION}\"" <<<"$LAST_HEALTH"; then
    HEALTH_OK=1
    break
  fi
  sleep 1
done
(( HEALTH_OK == 1 )) || fail "le service répond mais n'exécute pas Noctra $NEW_VERSION : ${LAST_HEALTH:-aucune réponse}. Vérifie qu'aucun ancien processus Node n'occupe encore le port."

INSTALLED_VERSION="$(node -e "const p=require(process.argv[1]);process.stdout.write(String(p.version||''))" "$APP_DIR/package.json")"
[[ "$INSTALLED_VERSION" == "$NEW_VERSION" ]] || fail "le dossier installé annonce $INSTALLED_VERSION au lieu de $NEW_VERSION"

SWAPPED=0
log "Mise à jour réellement active : Noctra $NEW_VERSION."
log "Sauvegarde conservée : $BACKUP_DIR"
if [[ "$KEEP_ARCHIVE" != "1" && "$SOURCE" != https://* ]]; then
  rm -f "$ARCHIVE" 2>/dev/null || true
fi
trap - EXIT
cleanup
