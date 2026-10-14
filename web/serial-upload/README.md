# serial-upload

Plain test page that connects to the Pi over USB serial with WebSerial and
sends an image for `crt-display` to show on the CRT.

WebSerial needs Chrome or Edge and a secure context, so serve the page from
localhost rather than opening the file:

```sh
python3 -m http.server -d web/serial-upload 8000
```

Then open <http://localhost:8000>, click **Connect** and pick "CRT Board". The
page checks the link with `PING`, then **Upload** sends the chosen PNG, JPEG
or GIF (up to 16 MiB). The Pi needs [`usb-gadget`](../../gateway/usb-gadget/README.md)
and [`crt-display`](../../gateway/crt-display/README.md) deployed.
