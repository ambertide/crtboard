Watch a Raspberry Pi from the BB sidebar.

## What you get

- A Raspberry Pi card in the bottom-right corner of the window, visible next
  to the Camera panel. Click its header, or the CPU icon in the sidebar
  footer, to collapse it to a small pill with the Pi's hostname and CPU use.
- A drawing of the connected board model. It stays, greyed out, after the
  connection drops.
- A live connection indicator with uptime and a heartbeat every 2 seconds.
- CPU and memory use while connected.
- Restart and Shut down buttons (each asks for a second click). They run
  `sudo -n systemctl reboot` / `poweroff`, so the SSH user needs passwordless
  sudo.
- Automatic reconnects with exponential backoff (1 s up to 60 s), plus a
  Retry now button.

## How it works

The BB server keeps one `ssh` session open to the Pi with your existing SSH
keys (`BatchMode`, so it never prompts). Apart from the power buttons, the Pi only runs a read-only shell
loop that prints `/proc/stat` and `/proc/meminfo`; nothing is installed there.
Set the host, username, and port under Settings → Installed plugins → Pi State.
