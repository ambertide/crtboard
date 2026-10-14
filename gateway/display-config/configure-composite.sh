#!/usr/bin/env bash
# Runs on the Pi as root. Turns on the composite (analog) output in PAL
# 720x576 50 Hz for the CRT. Safe to run again: it only edits what differs.
# The original boot files are kept once as *.bak-crtboard.
#
# Exits 0 when nothing changed and 10 when the boot files were changed and the
# Pi needs a reboot.
set -euo pipefail

boot="${BOOT_DIR:-/boot/firmware}"
video="video=Composite-1:720x576@50ie,tv_mode=PAL"
config="$boot/config.txt"
cmdline="$boot/cmdline.txt"

for f in "$config" "$cmdline"; do
  [ -f "$f" ] || { echo "Missing $f" >&2; exit 1; }
  [ -f "$f.bak-crtboard" ] || cp "$f" "$f.bak-crtboard"
done

before="$(cat "$config" "$cmdline")"

# The KMS driver only creates the Composite-1 connector with this parameter.
if ! grep -qE '^dtoverlay=vc4-kms-v3d.*,composite' "$config"; then
  if ! grep -qE '^dtoverlay=vc4-kms-v3d' "$config"; then
    echo "No dtoverlay=vc4-kms-v3d line in $config" >&2
    exit 1
  fi
  sed -i -E 's/^(dtoverlay=vc4-kms-v3d[^#[:space:]]*)/\1,composite/' "$config"
fi

# A Pi 4 keeps the analog output off unless this is set.
if ! grep -qE '^enable_tvout=1' "$config"; then
  printf '\n[all]\nenable_tvout=1\n' >>"$config"
fi

# cmdline.txt is a single line; replace any earlier composite mode.
line="$(head -n1 "$cmdline" | sed -E 's/ *video=Composite-1:[^ ]*//')"
printf '%s %s' "$line" "$video" >"$cmdline"

if [ "$before" = "$(cat "$config" "$cmdline")" ]; then
  echo "Composite output already set to PAL"
  exit 0
fi
echo "Composite output set to PAL; reboot to apply"
exit 10
