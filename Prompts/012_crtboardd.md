# Implement `crtboardd`

## General

Implement `crtboardd`, as explained in the
`System.md` file and matching the mocks and data types already
used by `crtboard-web`

## Implementation Details

Write two software, both using `Python`:

* `crtboardd` is the background process running with `fastapi` to speak
  with the web ui.
* `crtboardctl` is the command line interaface used to:
  * start
  * stop
  * and see logs of
  the running `crtboardd` process

## Rules

* There can only be one `crtboardd` process runing on the system at any
  given time.
* `crtboardd` must not depend on `launchd`, `systemd`, `init.d` or any
  other system level daemon controller.

## Testing

* Unit tests that mocks `github` and `asana` APIs, but
  only the parts we need, as well as with fake `git` repositories.

## Deployment

* You should build and deploy a wheel that contains the whole project,
  ie: `crtboardctl` and `crtboardd` into a Python wheel so it can
  be installed.
