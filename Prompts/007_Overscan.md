# Find the Correct Overscan

## Context

In a previous run we have detected that the specific device we are running the CRTBOARD on has
a overscan problem causing the test image to be cut off on the horizontal and vertical parts

## Task

Find the correct overscan values for this device and then after I approve, commit them with the
Task-Resolved-With trailer to the commit, for this task only you can commit to the master branch

## Methadology

* Attempt to send progressively modified overscan values for the image in the go program
* Using the PM5540 pattern find when the pattern fits perfectly to the device
* Use the connected webcam to resolve

