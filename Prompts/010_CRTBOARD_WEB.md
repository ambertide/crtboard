# CRTBoard Web

## Overview

* You are required to built the `crtboard-web` project as described
  in the `docs/System.md` file, `crt-display` is already built, however
  you may have to modify it.
* You are not to built the system described in `crtboardd` you will
  mock its data for testing.
* You will implement this figma file https://www.figma.com/design/dIQ4siV5mHwcaijzxy1lPo/
  if you are unable to get data for a component do not try to design
  it yourself, you MUST stop until you get the proper design 
  information

## Rules

* You must use semantic html elements when able
* For selects and inputs, you must use native HTML elements
  do not modify the dropdowns or make design choices other than
  ones given in figma, other than simple decisions such as truncating
  on long lines when space is not able.
* Use https://github.com/gingerbeardman/webgl-crt-shader shader for
  the CRT look.
* Draw the CRT screen to a canvas element, from which you will take
  screenshots and send to Raspberry Pi 4B
* You must use Svelte and properly break down your components
  * For folder structure, use feature-based foldering
  * Every figma component must be its own components
  * Avoid excessive commenting, components may have short explonations
    as JSDocs to explain their context
  * Avoid out of context comments, do not make comments that do not
    make sense in the context of the file but makes sense in the
    context of your chain of thought
* For Asana Pickers, scroll must be inside the column picker
* For Buttons a pressed variant is provided
* In Connector There is an Upload button, when this button is Pressed,
  user is shown a image picker, the image they have chosen is then
  shown in the CRT television until they press stop
* Before the Image is shown flash Phillips Test Image for a few seconds
  and likewise after we cancel, before going to dashboard
* User will be shown the WebSerial picker after they select broadcast
* This is not in the figma file but when the Status, Substatus PR
  counts, branch names, or task counts change the that portion of the
  screen should flash between gray-400 and gray-50 before settling
  on whatever is the correct font color for it.
  * t- countdown does not flash as that would be too distracting
  neither does the clock, when an item flashes it should lfash with its
  symbol if there is a symbol, the flashes should be 1s gray-50 1s
  gray-400
* Repeating events should flash until they arive, afterwards they stay
  on the screen for 10 more minutes without flashing at gray-50,
* Review Requested > PR Opened in terms of status importance
