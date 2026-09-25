#!/usr/bin/env bash
set -euo pipefail
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$HOME/bin"
install -m 0755 "$PROJECT_DIR/ultra/update-noctra.sh" "$HOME/bin/noctra-update"
case ":$PATH:" in
  *":$HOME/bin:"*) ;;
  *)
    printf '\nexport PATH="$HOME/bin:$PATH"\n' >> "$HOME/.bashrc"
    export PATH="$HOME/bin:$PATH"
    ;;
esac
printf 'Commande installée : %s\n' "$HOME/bin/noctra-update"
printf 'Utilisation : noctra-update ~/noctra-media-client-vXX.zip\n'
