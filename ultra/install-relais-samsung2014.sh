#!/usr/bin/env bash
# Relais Noctra pour les Samsung Smart TV 2014 (UE40H6400…), installé sur la seedbox.
#
# Ces téléviseurs refusent le certificat HTTPS actuel du serveur. Ce relais écoute
# en HTTP sur un port de la seedbox et transmet tout, en HTTPS, au serveur Noctra
# et à Jellyfin de cette même seedbox. La seedbox étant toujours allumée, il ne
# faut aucun appareil chez vous.
#
# Usage :  bash ultra/install-relais-samsung2014.sh [PORT] [--autoriser IP_DE_LA_BOX]
#          bash ultra/install-relais-samsung2014.sh --desinstaller
#
# Le port doit appartenir à la plage de votre slot Ultra.cc (commande « app-ports free »).
# Les échanges téléviseur ↔ seedbox ne sont pas chiffrés : --autoriser limite l'accès
# à l'adresse publique de votre box (https://ifconfig.me depuis un appareil de la maison).
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env"
SERVICE_NAME="noctra-relais-tv"
SERVICE_FILE="$HOME/.config/systemd/user/${SERVICE_NAME}.service"
LOG_DIR="$PROJECT_DIR/logs"
RELAY="$PROJECT_DIR/apps/samsung-orsay/serveur/noctra-samsung2014.mjs"

fail() { printf 'Erreur : %s\n' "$1" >&2; exit 1; }

if [[ "${1:-}" == "--desinstaller" ]]; then
  systemctl --user disable --now "$SERVICE_NAME.service" 2>/dev/null || true
  rm -f "$SERVICE_FILE"
  systemctl --user daemon-reload
  printf 'Relais Samsung 2014 désinstallé.\n'
  exit 0
fi

command -v node >/dev/null 2>&1 || fail "Node.js est introuvable"
[[ -f "$RELAY" ]] || fail "relais introuvable ($RELAY) : mettez Noctra à jour (200.0.148 ou plus récent)"
[[ -f "$ENV_FILE" ]] || fail "le fichier .env est absent dans $PROJECT_DIR"

read_env() {
  local key="$1"
  sed -nE "s/^[[:space:]]*${key}[[:space:]]*=[[:space:]]*['\"]?([^'\"]*)['\"]?[[:space:]]*$/\\1/p" "$ENV_FILE" | tail -n 1
}
NOCTRA_PORT="$(read_env PORT)"
BASE_URL="$(read_env BASE_URL)"
BASE_URL="${BASE_URL:-/noctra}"

PORT=""
ALLOW=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --autoriser) ALLOW="${2:-}"; shift 2 ;;
    [0-9]*) PORT="$1"; shift ;;
    *) fail "option inconnue : $1" ;;
  esac
done

# Port libre de la plage du slot (outil Ultra.cc), différent de celui de Noctra.
if [[ -z "$PORT" ]] && command -v app-ports >/dev/null 2>&1; then
  PORT="$(app-ports free 2>/dev/null | grep -oE '\b[0-9]{4,5}\b' | grep -v "^${NOCTRA_PORT}$" | head -n 1 || true)"
fi
[[ "$PORT" =~ ^[0-9]{4,5}$ ]] || fail "indiquez un port libre de votre slot : bash ultra/install-relais-samsung2014.sh PORT (liste : app-ports free)"
[[ "$PORT" != "$NOCTRA_PORT" ]] || fail "ce port est déjà celui de Noctra : choisissez-en un autre (app-ports free)"

# Adresse publique HTTPS du serveur : utilisateur.serveur.usbx.me (comme le navigateur).
SHORT_HOST="$(hostname -s 2>/dev/null || hostname)"
SERVER_URL="${NOCTRA_SERVEUR:-https://$(whoami).${SHORT_HOST}.usbx.me${BASE_URL}}"
# Adresse publique : celle du nom du serveur (hostname -I donne une adresse interne, 172.x).
PUBLIC_IP="$(getent hosts "${SHORT_HOST}.usbx.me" 2>/dev/null | awk '{print $1}' | head -n 1 || true)"

mkdir -p "$(dirname "$SERVICE_FILE")" "$LOG_DIR"
NODE_BIN="$(command -v node)"
ARGS="relais --public --port $PORT --serveur $SERVER_URL"
[[ -n "$ALLOW" ]] && ARGS="$ARGS --autoriser $ALLOW"

cat > "$SERVICE_FILE" <<SERVICE
[Unit]
Description=Relais Noctra pour Samsung Smart TV 2014
After=network-online.target

[Service]
Type=exec
WorkingDirectory=$PROJECT_DIR
ExecStart=$NODE_BIN $RELAY $ARGS
Restart=always
RestartSec=5
StandardOutput=append:$LOG_DIR/relais-tv.log
StandardError=append:$LOG_DIR/relais-tv-error.log

[Install]
WantedBy=default.target
SERVICE

systemctl --user daemon-reload
systemctl --user enable "$SERVICE_NAME.service" >/dev/null
systemctl --user restart "$SERVICE_NAME.service"
sleep 3

printf '\nRelais Samsung 2014 installé (port %s, serveur %s).\n' "$PORT" "$SERVER_URL"
if curl -fsS "http://127.0.0.1:$PORT$BASE_URL/health" >/dev/null 2>&1; then
  printf 'Test sur la seedbox : OK (le relais joint le serveur Noctra).\n'
else
  printf 'Attention : le relais ne répond pas encore. Journal : tail -n 30 %s/relais-tv-error.log %s/relais-tv.log\n' "$LOG_DIR" "$LOG_DIR"
fi
printf '\n1. Vérifiez depuis un téléphone EN 4G (Wi-Fi coupé), dans le navigateur :\n'
printf '     http://%s.usbx.me:%s%s/health\n' "$SHORT_HOST" "$PORT" "$BASE_URL"
printf '   Un texte contenant "Noctra" doit s'"'"'afficher. Sinon, ce port n'"'"'est pas ouvert sur Internet : essayez un autre port de « app-ports free ».\n'
printf '2. Sur le téléviseur, Noctra › « Utiliser un relais local », saisissez :\n'
[[ -n "$PUBLIC_IP" ]] && printf '     %s:%s\n' "$PUBLIC_IP" "$PORT"
printf '     (ou %s.usbx.me:%s)\n' "$SHORT_HOST" "$PORT"
[[ -z "$ALLOW" ]] && printf '\nConseil : limitez l'"'"'accès à votre box : bash ultra/install-relais-samsung2014.sh %s --autoriser <IP publique de la box>\n' "$PORT"
printf 'Service : systemctl --user status %s · désinstallation : bash ultra/install-relais-samsung2014.sh --desinstaller\n' "$SERVICE_NAME"
