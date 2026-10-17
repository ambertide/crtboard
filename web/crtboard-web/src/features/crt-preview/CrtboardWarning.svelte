<!--
  @component
  Figma `CRTBOARD Warning`: asks the user to plug in the Raspberry Pi and
  press Broadcast, or explains that the browser has no WebSerial.
-->
<script lang="ts">
  import Button from "../../lib/ui/Button.svelte";

  interface Props {
    type: "before-connect" | "web-serial-error";
    /** True while the WebSerial picker or the Pi handshake is in progress. */
    connecting?: boolean;
    onbroadcast?: () => void;
  }

  let { type, connecting = false, onbroadcast }: Props = $props();
</script>

<div class="warning" role="status">
  {#if type === "before-connect"}
    <h2 class="title header-l">CRTBOARD IS NOT CONNECTED</h2>
    <p class="body-large">
      Connect your Raspberry Pi 4 Model B deployed with CRTBOARD firmware to your computer through its USB Type C
      port to this computer then press “Broadcast” to select the Raspberry Pi
    </p>
    <Button color="delete" textSize="large" pressed={connecting} disabled={connecting} onclick={onbroadcast}>
      Broadcast
    </Button>
  {:else}
    <h2 class="title header-l">CRTBOARD CAN NOT CONNECT</h2>
    <p class="body-large">
      Your browser does not support WebSerial, which is required for CRTBOARD to be driven from your browser,
      currently, WebSerial is only supported on Chromium based browsers.
    </p>
  {/if}
</div>

<style>
  .warning {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 8px 16px;
    overflow: hidden;
    color: var(--gray-50);
    background: var(--gray-700);
    box-shadow: 8px 8px 0 var(--gray-50);
  }

  .title,
  p {
    width: 100%;
  }
</style>
