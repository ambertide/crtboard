Watch a Raspberry Pi from the BB sidebar.

## What you get

- A Raspberry Pi panel at the bottom-left of the sidebar (the CPU icon in the
  sidebar footer opens it).
- A drawing of the connected board model. It stays, greyed out, after the
  connection drops.
- A live connection indicator with uptime and a heartbeat every 2 seconds.
- CPU and memory use while connected.
- Automatic reconnects with exponential backoff (1 s up to 60 s), plus a
  Retry now button.

## How it works

The BB server keeps one `ssh` session open to the Pi with your existing SSH
keys (`BatchMode`, so it never prompts). The Pi only runs a read-only shell
loop that prints `/proc/stat` and `/proc/meminfo`; nothing is installed there.
Set the host, username, and port under Settings → Installed plugins → Pi State.
