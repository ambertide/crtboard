# crtboard-web

The CRTBOARD web UI described in [docs/System.md](../../docs/System.md): a
WYSIWYG preview of the CRT dashboard on top, connector settings below. It is a
static Svelte app, published to GitHub Pages at `<pages url>/crtboard-web/`.

## Develop

```sh
npm install
npm run mock     # stand-in crtboardd on http://localhost:7777
npm run dev      # the app, talking to localhost:7777
```

`npm run mock` is a stand-in; the real daemon is
[crtboardd](../../daemon/README.md) (`crtboardctl start`), on the same port.

`npm run check` type-checks, `npm test` runs the unit tests and
`npm run build` writes the static bundle to `dist/`.

The daemon port defaults to 7777; open the app with `?port=<port>` to use
another one (it is remembered). `curl -X POST localhost:7777/mock/mutate`
makes the mock change something right away, to watch the dashboard flash.

## How it works

- **Screen.** The dashboard is ordinary Svelte DOM (`features/crt-screen`),
  kept off-screen and rasterised into a 720×576 canvas through an SVG
  `foreignObject` whenever it changes. Fonts and icons are inlined as data
  URLs so the canvas stays readable.
- **Preview.** The canvas is drawn through
  [gingerbeardman/webgl-crt-shader](https://github.com/gingerbeardman/webgl-crt-shader)
  (vendored in `features/crt-preview/shader`, MIT).
- **Broadcast.** After "Broadcast" the user picks the Pi in the WebSerial
  dialog. The canvas is then encoded with `canvas.toBlob` 25 times a second
  and sent with `crt-display`'s `FRAME` command
  ([protocol](../../gateway/crt-display/README.md#uploading-images)).
- **Daemon.** `GET /resources/available`, then `POST`/`PUT`/`DELETE` on
  `/resources/{git,asana}/tracked[/id]` as choices change, and
  `CRTBOARD_EVENT_SUM` server-sent events from `/events`. Missing those events
  for 15 seconds counts as a lost connection.
- **Storage.** Tracked repositories, board, column matches, team name and
  repeating events live in localStorage.

## Behaviour

- Until the Pi is connected the preview shows the dimmed PM5540 test card
  with the connection warning. Without `crtboardd`, the Pi gets the test card.
- Uploading an image shows the test card for 3 seconds, then the image until
  Stop, then the test card again before the dashboard returns.
- Status priority: repeating event, Review Requested, Pull Request Created,
  Merged, Task Created, Nominal. They are raised when, between two
  `CRTBOARD_EVENT_SUM` events, a tracked repository's `reviewRequested`,
  `PRs` or `todaysMergedPRs` rises, or the To Do column (still matched to the
  same Asana column) gains tasks. A raised status stays, flashing, for 5
  minutes.
- A repeating event appears 10 minutes before it starts, flashing, with a
  `t - 08M 06S` style countdown, and stays steady for 10 minutes after.
- When Nominal returns, or the deployment advice, a review-request count, a
  branch or a task count changes, it flashes gray-50/gray-400, a second
  each, for six seconds. The clock and the countdown never flash.
- The deployment advice under Nominal follows [Prompts/011_Deploys.md](../../Prompts/011_Deploys.md):
  Ready Monday to Thursday 06:00–16:30; Avoid 04:00–06:00 and 16:30–20:30 on
  those days and Friday 04:00–12:00; Do Not Deploy otherwise.
- `crtboardd` must answer from `http://localhost:<port>` with CORS headers.
  For the GitHub Pages copy, Chrome also sends a Private Network Access
  preflight, which needs `Access-Control-Allow-Private-Network: true` (the
  mock does this).
