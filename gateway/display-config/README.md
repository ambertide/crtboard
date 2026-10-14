# display-config

Turns on the Raspberry Pi's composite output for the CRT, which is PAL
(720x576, 50 Hz). `crt-display` draws to the framebuffer this creates.

## Deploy

```sh
PI_USER=<user> PI_HOST=<host or ip> ./gateway/display-config/deploy.sh
```

`PI_PORT` is optional and defaults to 22. Set `PI_NO_REBOOT=1` to apply the
change on the next boot instead of rebooting now. The Pi needs passwordless
sudo.

## What it changes

`configure-composite.sh` runs on the Pi and edits only what differs, so it is
safe to run again. The Pi reboots only when something changed.

- `/boot/firmware/config.txt`: adds `,composite` to `dtoverlay=vc4-kms-v3d` and
  sets `enable_tvout=1`, which a Pi 4 needs for the analog output.
- `/boot/firmware/cmdline.txt`: sets `video=Composite-1:720x576@50ie,tv_mode=PAL`.

The first run keeps the original files as `config.txt.bak-crtboard` and
`cmdline.txt.bak-crtboard`. To undo, copy them back and reboot.
