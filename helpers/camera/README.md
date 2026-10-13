# bb-plugin-camera

A BB plugin that keeps a live camera feed on screen and lets agents take
pictures from it.

- `helper/camera_helper.py` — a camera helper you run yourself. It captures
  with ffmpeg and serves the latest JPEG on `127.0.0.1` behind a random token
  written to `~/.bb-camera/helper.json` (mode 600).
- `server.ts` — proxies helper frames to the camera panel at `GET http/frame`, and
  registers the `camera_take_picture` agent tool. The tool takes a frame from
  the helper; without one it asks open BB windows for a frame over realtime.
  Either way it publishes `capture-taken`.
- `app.tsx` — the live feed in a panel at the bottom of the left sidebar
  (an `experimental_sidebarFooter` disclosure, opened at startup). It shows
  the helper feed, or opens the window's own camera when no helper is
  running. A headless `experimental_appOverlay` listens for `capture-taken`,
  reopens the panel if it was closed, and the panel flashes the indicator.
- `skills/camera/SKILL.md` — tells agents when and how to use the tool.

## Develop

```
npm install --include=dev
bb plugin install .
bb plugin dev
```

The agent tool set is fixed when a provider session starts. Start a new thread
after installing so the agent sees `camera_take_picture`.

## Camera helper (needed for the macOS desktop app)

The BB desktop app is signed without the camera entitlement, so macOS gives it,
and every process it starts, a camera that never delivers frames. Run the
helper from Terminal instead; macOS asks once whether Terminal may use the
camera.

```
brew install ffmpeg          # if needed
python3 helper/camera_helper.py            # first camera, port 8765
python3 helper/camera_helper.py --list     # list cameras
python3 helper/camera_helper.py --device Brio --size 1920x1080
```

Keep it running; the camera panel picks it up within a few seconds and switches back
to its own camera when it stops. BB in a web browser needs no helper.
