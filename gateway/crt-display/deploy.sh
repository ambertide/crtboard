#!/usr/bin/env bash
# Builds crt-display for the Pi and installs it as a systemd service.
#
# Usage: PI_USER=<user> PI_HOST=<host or ip> [PI_PORT=22] ./deploy.sh
# Needs passwordless sudo on the Pi.
set -euo pipefail

: "${PI_USER:?Set PI_USER to the Raspberry Pi username}"
: "${PI_HOST:?Set PI_HOST to the Raspberry Pi hostname or IP}"
PI_PORT="${PI_PORT:-22}"

here="$(cd "$(dirname "$0")" && pwd)"
image="$here/../../assets/PM5540.png"
ssh_opts=(-o BatchMode=yes -o ConnectTimeout=10 -p "$PI_PORT")
target="$PI_USER@$PI_HOST"

build="$(mktemp -d)"
trap 'rm -rf "$build"' EXIT

arch="$(ssh "${ssh_opts[@]}" "$target" uname -m)"
case "$arch" in
  aarch64) export GOARCH=arm64 ;;
  armv7l) export GOARCH=arm GOARM=7 ;;
  armv6l) export GOARCH=arm GOARM=6 ;;
  *) echo "Unsupported Pi architecture: $arch" >&2; exit 1 ;;
esac

echo "Building for $arch"
(cd "$here" && GOOS=linux CGO_ENABLED=0 go build -trimpath -o "$build/crt-display" .)

echo "Copying to $target"
remote_dir="/tmp/crt-display-deploy"
ssh "${ssh_opts[@]}" "$target" "rm -rf $remote_dir && mkdir -p $remote_dir"
scp -q -o BatchMode=yes -P "$PI_PORT" \
  "$build/crt-display" "$image" "$here/crt-display.service" "$target:$remote_dir/"

echo "Installing service"
ssh "${ssh_opts[@]}" "$target" "set -e
  sudo -n install -m 755 $remote_dir/crt-display /usr/local/bin/crt-display
  sudo -n install -D -m 644 $remote_dir/PM5540.png /usr/local/share/crt-display/test.png
  sudo -n install -m 644 $remote_dir/crt-display.service /etc/systemd/system/crt-display.service
  rm -rf $remote_dir
  sudo -n systemctl daemon-reload
  sudo -n systemctl enable crt-display.service
  sudo -n systemctl restart crt-display.service
  systemctl --no-pager --lines=5 status crt-display.service"
