#!/usr/bin/env bash
# Runs on the Pi at boot. Presents the USB-C port to the connected computer as
# a USB serial (CDC ACM) device; the Pi side is /dev/ttyGS0.
set -euo pipefail

gadget=/sys/kernel/config/usb_gadget/crtboard

modprobe libcomposite

# Already bound by an earlier run.
if [ -s "$gadget/UDC" ]; then
  exit 0
fi

mkdir -p "$gadget"
cd "$gadget"

# Linux Foundation multifunction composite gadget IDs.
echo 0x1d6b >idVendor
echo 0x0104 >idProduct
echo 0x0100 >bcdDevice
echo 0x0200 >bcdUSB

mkdir -p strings/0x409
tr -d '\0' </proc/device-tree/serial-number >strings/0x409/serialnumber
echo crtboard >strings/0x409/manufacturer
echo "CRT Board" >strings/0x409/product

mkdir -p configs/c.1/strings/0x409
echo "Serial" >configs/c.1/strings/0x409/configuration
echo 250 >configs/c.1/MaxPower

mkdir -p functions/acm.usb0
[ -e configs/c.1/acm.usb0 ] || ln -s functions/acm.usb0 configs/c.1/

udc="$(ls /sys/class/udc | head -n1)"
if [ -z "$udc" ]; then
  echo "No USB device controller; is dtoverlay=dwc2,dr_mode=peripheral set?" >&2
  exit 1
fi
echo "$udc" >UDC
