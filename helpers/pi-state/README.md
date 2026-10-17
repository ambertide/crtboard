# bb-plugin-pi-state

A BB plugin that shows the state of a Raspberry Pi in a sidebar panel.

- `server.ts` — a background service holds one `ssh` session to the Pi
  (`BatchMode`, `ServerAliveInterval=5`, `StrictHostKeyChecking=accept-new`).
  The remote side runs a small sh loop that prints the board model and
  hostname once, then a `/proc/stat` and `/proc/meminfo` sample every 2 s,
  along with the USB OTG state: the device controller bound in
  `/sys/kernel/config/usb_gadget`, its `/sys/class/udc/<udc>/state`, and
  `systemctl is-active crt-display`. The panel shows WebSerial as ready only
  when a gadget is bound, the state is `configured` (a computer enumerated
  it), and crt-display is running.
  The session counts as alive while lines keep arriving; after 15 s of
  silence, or when ssh exits, it reconnects with exponential backoff
  (1 s doubling to 60 s, ±20% jitter, reset after a successful connection).
  The last device seen per target is stored in `bb.storage.kv`.
- The `power` RPC runs `sudo -n systemctl reboot|poweroff` over a separate
  ssh exec (passwordless sudo required) and records it in the state until
  the next successful connection.
- `state.ts` — the zod schema of the state the server publishes on the
  `pi-state` realtime channel and returns from the `get_state` RPC.
- `app.tsx` — a floating card in the bottom-right corner (an
  `experimental_appOverlay`) that collapses to a status pill. The CPU icon in
  the sidebar footer (an `experimental_sidebarFooter` action) toggles it too.
- `board.tsx` — SVG drawings of the board families (Pi 5, 4, 3, 3 A+,
  Zero, 400/500, Compute Module), picked from the reported model string.

## Settings

| Key        | Default         |
| ---------- | --------------- |
| `host`     | `192.168.68.79` |
| `username` | `crt`           |
| `port`     | `22`            |

```
bb plugin config pi-state set host 192.168.68.79
bb plugin config pi-state set username crt
```

Authentication uses the SSH keys of the user running BB (`~/.ssh` or
`SSH_AUTH_SOCK`). Check access first with `ssh crt@192.168.68.79 true`.

## Develop

```
npm install --include=dev
bb plugin install .
bb plugin dev
bb plugin logs pi-state -f
```

The card floats instead of using a sidebar-footer disclosure because BB keeps
only one disclosure open at a time; this way it shows next to the Camera
panel.
