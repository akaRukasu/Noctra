#!/usr/bin/env bash
# Noctra — déploiement automatique depuis GitHub (côté seedbox).
#
# Vérifie périodiquement la branche de production du dépôt. Quand un nouveau
# commit y est publié (après vérification), l'archive de ce commit est
# téléchargée puis installée avec `noctra-update` : .env conservé, sauvegarde,
# contrôle /health de la nouvelle version et retour arrière automatique.
#
# Le jeton GitHub (lecture seule) reste sur la seedbox, dans
# ~/.config/noctra/github-token (droits 600). Il n'est jamais affiché.
set -Eeuo pipefail

REPO="${NOCTRA_REPO:-akaRukasu/Noctra}"
BRANCH="${NOCTRA_DEPLOY_BRANCH:-production}"
CONFIG_DIR="${NOCTRA_CONFIG_DIR:-$HOME/.config/noctra}"
TOKEN_FILE="$CONFIG_DIR/github-token"
STATE_FILE="$CONFIG_DIR/deployed-commit"
LOG_FILE="${NOCTRA_AUTOUPDATE_LOG:-$HOME/apps/noctra-autoupdate.log}"
UPDATER="${NOCTRA_UPDATER:-$HOME/bin/noctra-update}"
KEEP_BACKUPS="${NOCTRA_KEEP_BACKUPS:-3}"
API="${NOCTRA_GITHUB_API:-https://api.github.com}/repos/$REPO"

# Node.js installé avec NVM n'est pas dans le PATH des services systemd.
if ! command -v node >/dev/null 2>&1 && [[ -d "$HOME/.nvm/versions/node" ]]; then
  NODE_BIN="$(find "$HOME/.nvm/versions/node" -mindepth 3 -maxdepth 3 -type f -path '*/bin/node' -perm -u+x 2>/dev/null | sort -V | tail -n 1)"
  [[ -n "$NODE_BIN" ]] && export PATH="$(dirname "$NODE_BIN"):$PATH"
fi

mkdir -p "$CONFIG_DIR" "$(dirname "$LOG_FILE")"
log() { printf '%s [Noctra auto] %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$*" >> "$LOG_FILE"; }

# Une seule exécution à la fois.
exec 9>"$CONFIG_DIR/autoupdate.lock"
flock -n 9 || exit 0

[[ -f "$TOKEN_FILE" ]] || { log "Jeton absent : $TOKEN_FILE"; exit 1; }
[[ -x "$UPDATER" ]] || { log "noctra-update introuvable : $UPDATER (lancer ultra/install-updater.sh)"; exit 1; }
TOKEN="$(tr -d '\r\n ' < "$TOKEN_FILE")"

github() {
  curl --silent --show-error --fail --location --retry 2 --connect-timeout 15 --max-time "${2:-30}" \
    -H "Authorization: Bearer $TOKEN" -H "X-GitHub-Api-Version: 2022-11-28" "${@:3}" "$1"
}

COMMIT_JSON="$(github "$API/commits/$BRANCH" 30 -H 'Accept: application/vnd.github+json')" \
  || { log "GitHub injoignable ou branche $BRANCH absente"; exit 1; }
COMMIT="$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{process.stdout.write(String(JSON.parse(s).sha||""))})' <<<"$COMMIT_JSON")"
[[ "$COMMIT" =~ ^[0-9a-f]{40}$ ]] || { log "Réponse GitHub inattendue"; exit 1; }

DEPLOYED="$(cat "$STATE_FILE" 2>/dev/null || true)"
[[ "$COMMIT" == "$DEPLOYED" ]] && exit 0

log "Nouveau commit $BRANCH : ${COMMIT:0:12} (installé : ${DEPLOYED:0:12})"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/noctra-auto.XXXXXX")"
trap 'rm -rf "$TMP"' EXIT
ARCHIVE="$TMP/noctra-$COMMIT.zip"
github "$API/zipball/$COMMIT" 300 -H 'Accept: application/vnd.github+json' --output "$ARCHIVE" \
  || { log "Téléchargement de l'archive impossible"; exit 1; }

if NOCTRA_KEEP_ARCHIVE=1 "$UPDATER" "$ARCHIVE" >> "$LOG_FILE" 2>&1; then
  printf '%s\n' "$COMMIT" > "$STATE_FILE"
  log "Déployé : ${COMMIT:0:12}"
  # Conserver seulement les sauvegardes les plus récentes.
  mapfile -t BACKUPS < <(ls -1dt "$HOME"/apps/noctra-backup-* 2>/dev/null || true)
  for old in "${BACKUPS[@]:$KEEP_BACKUPS}"; do rm -rf -- "$old"; log "Ancienne sauvegarde supprimée : $(basename "$old")"; done
else
  # noctra-update a déjà restauré la version précédente. Le commit est noté
  # pour ne pas relancer en boucle une version défaillante.
  printf '%s\n' "$COMMIT" > "$STATE_FILE"
  log "ÉCHEC du déploiement ${COMMIT:0:12} : version précédente restaurée (voir ci-dessus)"
  exit 1
fi
