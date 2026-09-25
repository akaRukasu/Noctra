#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$PROJECT_DIR/.env"
SERVICE_NAME="noctra"
SERVICE_FILE="$HOME/.config/systemd/user/${SERVICE_NAME}.service"
NGINX_FILE="$HOME/.apps/nginx/proxy.d/${SERVICE_NAME}.conf"
LOG_DIR="$PROJECT_DIR/logs"

fail() {
  printf 'Erreur : %s\n' "$1" >&2
  exit 1
}

[[ -f "$ENV_FILE" ]] || fail "le fichier .env est absent dans $PROJECT_DIR"
command -v node >/dev/null 2>&1 || fail "Node.js est introuvable dans le terminal Ultra.cc"
command -v systemctl >/dev/null 2>&1 || fail "systemctl est introuvable"
command -v app-nginx >/dev/null 2>&1 || fail "app-nginx est introuvable"

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
(( NODE_MAJOR >= 20 )) || fail "Noctra nécessite Node.js 20 ou plus récent"

read_env() {
  local key="$1"
  sed -nE "s/^[[:space:]]*${key}[[:space:]]*=[[:space:]]*['\"]?([^'\"]*)['\"]?[[:space:]]*$/\\1/p" "$ENV_FILE" | tail -n 1
}

PORT="$(read_env PORT)"
BASE_URL="$(read_env BASE_URL)"
HOST_VALUE="$(read_env HOST)"
HOST_VALUE="${HOST_VALUE:-127.0.0.1}"

[[ "$PORT" =~ ^[0-9]{5}$ ]] || fail "PORT doit être un port Ultra.cc à 5 chiffres autorisé pour ton slot"
[[ "$BASE_URL" =~ ^/[A-Za-z0-9._~-]+$ ]] || fail "BASE_URL doit ressembler à /noctra"
[[ "$HOST_VALUE" == "127.0.0.1" ]] || fail "HOST doit rester 127.0.0.1 derrière le proxy Ultra.cc"

mkdir -p "$(dirname "$SERVICE_FILE")" "$(dirname "$NGINX_FILE")" "$LOG_DIR"
NODE_BIN="$(command -v node)"

cat > "$SERVICE_FILE" <<SERVICE
[Unit]
Description=Noctra Media Client
After=network-online.target

[Service]
Type=exec
WorkingDirectory=$PROJECT_DIR
ExecStart=$NODE_BIN $PROJECT_DIR/server.mjs
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production
StandardOutput=append:$LOG_DIR/noctra.log
StandardError=append:$LOG_DIR/noctra-error.log

[Install]
WantedBy=default.target
SERVICE

cat > "$NGINX_FILE" <<NGINX
location = $BASE_URL {
    return 301 $BASE_URL/;
}

location $BASE_URL/ {
    proxy_pass              http://127.0.0.1:$PORT;
    proxy_http_version      1.1;
    proxy_set_header        Host                 \$host;
    proxy_set_header        X-Forwarded-Host     \$http_host;
    proxy_set_header        X-Forwarded-Proto    \$scheme;
    proxy_set_header        X-Forwarded-Prefix   $BASE_URL;
    proxy_set_header        X-Real-IP            \$remote_addr;
    proxy_buffering         off;
}
NGINX

systemctl --user daemon-reload
systemctl --user enable --now "$SERVICE_NAME.service"
app-nginx restart

printf '\nNoctra est installé.\n'
printf 'Service : systemctl --user status %s.service\n' "$SERVICE_NAME"
printf 'Test local : curl http://127.0.0.1:%s%s/health\n' "$PORT" "$BASE_URL"
printf 'URL publique : https://TON-DOMAINE-ULTRA%s/client/index.html\n' "$BASE_URL"
printf '\nUne copie de la configuration Nginx reste dans %s.\n' "$NGINX_FILE"
