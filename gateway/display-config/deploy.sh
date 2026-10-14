#!/usr/bin/env bash
# Applies the PAL composite boot settings on the Pi and reboots it if they
# changed.
#
# Usage: PI_USER=<user> PI_HOST=<host or ip> [PI_PORT=22] [PI_NO_REBOOT=1] ./deploy.sh
# Needs passwordless sudo on the Pi.
set -euo pipefail

: "${PI_USER:?Set PI_USER to the Raspberry Pi username}"
: "${PI_HOST:?Set PI_HOST to the Raspberry Pi hostname or IP}"
PI_PORT="${PI_PORT:-22}"

here="$(cd "$(dirname "$0")" && pwd)"
ssh_opts=(-o BatchMode=yes -o ConnectTimeout=10 -p "$PI_PORT")
target="$PI_USER@$PI_HOST"

echo "Configuring $target"
status=0
ssh "${ssh_opts[@]}" "$target" "sudo -n bash -s" <"$here/configure-composite.sh" || status=$?

case "$status" in
  0) ;;
  10)
    if [ "${PI_NO_REBOOT:-}" = 1 ]; then
      echo "Skipping reboot; the change applies on the next boot"
    else
      echo "Rebooting $target"
      ssh "${ssh_opts[@]}" "$target" "sudo -n systemctl reboot" || true
    fi
    ;;
  *) exit "$status" ;;
esac
