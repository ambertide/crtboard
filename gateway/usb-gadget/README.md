# usb-gadget

Makes the Raspberry Pi 4's USB-C port a USB serial device, so a computer
plugged into it sees a serial port ("CRT Board", `/dev/cu.usbmodem*` on macOS)
and the Pi sees `/dev/ttyGS0`. `crt-display` receives uploaded images on it.

## Deploy

```sh
PI_USER=<user> PI_HOST=<host or ip> ./gateway/usb-gadget/deploy.sh
```

`PI_PORT` is optional and defaults to 22. Set `PI_NO_REBOOT=1` to apply the
boot change on the next boot instead of rebooting now. The Pi needs
passwordless sudo.

## What it changes

- `/boot/firmware/config.txt`: adds `dtoverlay=dwc2,dr_mode=peripheral`, which
  puts the USB-C port's controller in device mode. The original is kept once as
  `config.txt.bak-crtboard`. The Pi reboots only when this line was added.
- `/usr/local/sbin/crtboard-gadget` and `crtboard-gadget.service`: at boot,
  create a CDC ACM gadget through configfs (Linux Foundation IDs
  `1d6b:0104`) and bind it to the controller.

The USB-C port also powers the Pi, so the computer must supply enough power
or the Pi needs power some other way (for example through the GPIO header).
