# crt-display

Shows the monochrome CRT test pattern (`assets/test.png`) on the Raspberry Pi's
analog output. It runs as the `crt-display` systemd service and starts on boot.

## Deploy

```sh
PI_USER=<user> PI_HOST=<host or ip> ./gateway/crt-display/deploy.sh
```

`PI_PORT` is optional and defaults to 22. The Pi needs passwordless sudo.

## Analog output

The renderer draws to `/dev/fb0`, which only exists once a display output is
enabled. The CRT is PAL (720x576, 50 Hz); deploy
[`display-config`](../display-config/README.md) to turn on the composite
output. Until the framebuffer exists the service logs
`open /dev/fb0: no such file or directory` and retries every 10 seconds.

## Notes

- The program refuses to run from an SSH session so a login cannot take over
  the display. Use `sudo systemctl restart crt-display`, or pass `-force`.
- The service stops the login prompt on `tty1` and switches the console there to
  graphics mode so kernel messages do not draw over the pattern.
- Logs: `journalctl -u crt-display`.
