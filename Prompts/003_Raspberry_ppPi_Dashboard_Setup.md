# Rationale

You must create a small software that displays the screen in raspberry pi, it must start on launch.

## Basic design

* It must display the CRT test image provided in assets (monochrome)
* It must run on the analog display output of raspbery pi
* Make incremental commits and ask for approval after each commit

## Details

* Use systemd for process management
* Write all the scripts that you will inject to raspberry pi into the gateway folder
* Scripts being injected should also have a deploy scripts, so:
	* Every folder a script to be deployed to rpi
	* Every folder should have a deploy.sh

## Limitations

* For now, assume that the analog display simply works
* Make sure the ssh connections will not run this program as that will break stuff
* If possible, prefer writing the software in Go
* Do not hardcode the raspberry pi's username and ip, read them from env vars for deploys

