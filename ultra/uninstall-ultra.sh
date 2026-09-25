#!/usr/bin/env bash
set -euo pipefail
systemctl --user disable --now noctra.service 2>/dev/null || true
rm -f "$HOME/.config/systemd/user/noctra.service"
rm -f "$HOME/.apps/nginx/proxy.d/noctra.conf"
systemctl --user daemon-reload
app-nginx restart
printf 'Le service et le proxy Noctra ont été retirés. Les fichiers du projet sont conservés.\n'
