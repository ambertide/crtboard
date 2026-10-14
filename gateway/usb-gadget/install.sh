#!/usr/bin/env bash
# Runs on the Pi as root from the directory deploy.sh copied the files to.
# Puts the USB-C port in device mode and installs the gadget service. Safe to
# run again. The original config.txt is kept once as config.txt.bak-crtboard.
#
# Exits 0 when the boot config was already set and 10 when it changed and the
# Pi needs a reboot.
set -euo pipefail

config="${BOOT_DIR:-/boot/firmware}/config.txt"

install -m 755 crtboard-gadget.sh /usr/local/sbin/crtboard-gadget
install -m 644 crtboard-gadget.service /etc/systemd/system/crtboard-gadget.service
systemctl daemon-reload
systemctl enable crtboard-gadget.service

[ -f "$config.bak-crtboard" ] || cp "$config" "$config.bak-crtboard"

# The dwc2 controller drives the USB-C port; peripheral makes it a device.
if grep -qE '^dtoverlay=dwc2,dr_mode=peripheral' "$config"; then
  # Bind now in case the controller is already up.
  systemctl restart crtboard-gadget.service || true
  echo "USB-C device mode already set"
  exit 0
fi
printf '\n[all]\ndtoverlay=dwc2,dr_mode=peripheral\n' >>"$config"
echo "USB-C device mode set; reboot to apply"
exit 10
