#!/usr/bin/env bash
# Installe le déploiement automatique Noctra sur la seedbox (une seule fois).
#   bash ultra/install-autoupdate.sh
# Demande le jeton GitHub en saisie masquée, puis active un minuteur
# systemd utilisateur qui vérifie la branche de production toutes les 5 min.
set -Eeuo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONFIG_DIR="$HOME/.config/noctra"
UNIT_DIR="$HOME/.config/systemd/user"

bash "$PROJECT_DIR/ultra/install-updater.sh" >/dev/null
install -m 0755 "$PROJECT_DIR/ultra/noctra-autoupdate.sh" "$HOME/bin/noctra-autoupdate"
mkdir -p "$CONFIG_DIR" "$UNIT_DIR"
chmod 700 "$CONFIG_DIR"

if [[ ! -s "$CONFIG_DIR/github-token" ]]; then
  printf 'Jeton GitHub (lecture seule, dépôt Noctra) : '
  read -rs TOKEN; printf '\n'
  [[ -n "$TOKEN" ]] || { echo "Jeton vide, abandon."; exit 1; }
  umask 077; printf '%s\n' "$TOKEN" > "$CONFIG_DIR/github-token"; unset TOKEN
fi
chmod 600 "$CONFIG_DIR/github-token"

# Au premier passage, le dernier commit de production est installé.
touch "$CONFIG_DIR/deployed-commit"

cat > "$UNIT_DIR/noctra-autoupdate.service" <<EOF
[Unit]
Description=Noctra : déploiement automatique depuis GitHub

[Service]
Type=oneshot
Environment=PATH=$HOME/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=$HOME/bin/noctra-autoupdate
EOF

cat > "$UNIT_DIR/noctra-autoupdate.timer" <<'EOF'
[Unit]
Description=Noctra : vérification des mises à jour toutes les 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
RandomizedDelaySec=30s
Persistent=true

[Install]
WantedBy=timers.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now noctra-autoupdate.timer
echo "Déploiement automatique actif. Journal : ~/apps/noctra-autoupdate.log"
echo "Forcer une vérification : systemctl --user start noctra-autoupdate.service"
echo "Désactiver : systemctl --user disable --now noctra-autoupdate.timer"
