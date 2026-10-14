#!/usr/bin/env bash
# Installs the USB serial gadget on the Pi and reboots it if the boot config
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
remote_dir="/tmp/usb-gadget-deploy"

echo "Copying to $target"
ssh "${ssh_opts[@]}" "$target" "rm -rf $remote_dir && mkdir -p $remote_dir"
scp -q -o BatchMode=yes -P "$PI_PORT" \
  "$here/install.sh" "$here/crtboard-gadget.sh" "$here/crtboard-gadget.service" \
  "$target:$remote_dir/"

echo "Installing"
status=0
ssh "${ssh_opts[@]}" "$target" "cd $remote_dir && sudo -n bash install.sh; s=\$?; rm -rf $remote_dir; exit \$s" || status=$?

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
