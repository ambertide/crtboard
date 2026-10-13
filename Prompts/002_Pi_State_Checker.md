# Pi State Checker

Add to the BB ide using bb-plugin authoring a panel that shows the state of the raspberry pi
at a given IP and with the username.

## Design

* The panel should show a picture of the connected raspberry pi model after first connection even
  after the connection drops
* You should hold a open ssh connection and inform the connection is alive as long as the connection
  last
* When the connection drops you should try with exponential backoff to reconect
* If you are connected show the memory and CPU use of the device

