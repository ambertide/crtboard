# crt-display

Shows the Philips PM5540 PAL test pattern (`assets/PM5540.png`) in monochrome
on the Raspberry Pi's analog output. It runs as the `crt-display` systemd
service and starts on boot.

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

## Overscan

The CRT hides the edges of the frame, and this set shows the picture right of
centre. The service passes `-overscan 64,10,44,4` (left, top, right, bottom
pixels), so images are fitted into the visible 612x562 area and the margins
are left black. The values were found by showing the PM5540 pattern and
growing each margin until its outer border sat flush with the glass. Without
the flag the whole 720x576 frame is used.

## Uploading images

The service listens on `/dev/ttyGS0`, the USB serial port that
[`usb-gadget`](../usb-gadget/README.md) creates, and shows the latest uploaded
image in place of the test pattern. Uploads are saved to `/tmp/crt-display`,
which is cleared on reboot, and the test pattern shows again after a restart.
[`web/serial-upload`](../../web/serial-upload/README.md) is a test page that
uploads from the browser.

The protocol is line based, with one reply line per command:

| Send | Reply |
| --- | --- |
| `PING` | `PONG crt-display` |
| `IMG <bytes>` | `READY`; then send exactly `<bytes>` bytes of a PNG, JPEG or GIF and get `OK <width>x<height>` |
| `FRAME <bytes>` | Same as `IMG`, for one frame of a live stream: the image is shown but not saved to disk |

[`crtboard-web`](../../web/crtboard-web/README.md) streams its dashboard with
`FRAME` at 25 frames per second, waiting for each `OK` before sending the next.

Failures are answered with `ERR <reason>`. Uploads are limited to 16 MiB and
the body must arrive within 30 seconds.

## Notes

- The program refuses to run from an SSH session so a login cannot take over
  the display. Use `sudo systemctl restart crt-display`, or pass `-force`.
- The service stops the login prompt on `tty1` and switches the console there to
  graphics mode so kernel messages do not draw over the pattern.
- Logs: `journalctl -u crt-display`.
