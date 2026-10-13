---
name: camera
description: Take a picture from the user's camera with the camera_take_picture tool. Use when the user asks you to look at them, at something they hold up, or at anything in view of their camera.
---

# Camera

The Camera plugin shows a live feed from the user's camera in a
sidebar panel in every open BB window. The feed is always on. You see nothing from
it until you call `camera_take_picture`.

## Taking a picture

Call `camera_take_picture` (no parameters). It returns one JPEG still, at most
1280 px on the longest edge, plus a text line with its size and time.

- Every call shows the user an indicator: the camera panel flashes and a red
  "Agent took a picture" badge appears. Take a picture only when the user asked
  you to or the task clearly needs it.
- To check something again (for example after the user moves an object), call
  the tool again. Each call is a fresh frame.

## Failures

Pictures come from the camera helper the user runs in Terminal. Without the
helper, the tool asks open BB windows for a frame and gives up after
10 seconds. The error text explains which source failed. Common causes:

- The camera helper is not running. The error includes the exact
  `python3 …/camera_helper.py` command; give it to the user. The BB macOS
  desktop app cannot use the camera without the helper.
- No BB window is open, so nothing can supply a frame.
- The user denied camera access, or another app holds the camera. The camera panel
  shows the reason and a Retry button.

Report the error to the user and ask them to fix it. Do not retry in a loop.
