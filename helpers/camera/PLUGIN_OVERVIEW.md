Keep a live camera feed on screen and let your agents see through it when you
ask them to.

## What you get

- A live camera feed in a panel at the bottom-left of the sidebar. The
  Camera icon in the sidebar footer hides or shows it.
- A `camera_take_picture` agent tool that returns a still from the feed.
- An indicator on every capture: the feed flashes, its border turns red, and
  an "Agent took a picture" badge appears for a few seconds. A hidden panel
  reopens so you always see it.

## How it works

On macOS the BB desktop app cannot use the camera, so the plugin ships a small
helper (`helper/camera_helper.py`) that you run in Terminal. It captures with
ffmpeg and serves frames only on this machine, behind a random token. BB in a
web browser can use its own camera instead. A picture goes back to the
requesting agent's thread only, and the plugin does not store pictures.
