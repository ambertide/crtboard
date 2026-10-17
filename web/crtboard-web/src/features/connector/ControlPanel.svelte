<!--
  @component
  Figma `Control Panel`: the connector settings once `crtboardd` answers
  (Connection=True), otherwise a prompt to start it and retry, optionally on
  another port.
-->
<script lang="ts">
  import Button from "../../lib/ui/Button.svelte";
  import Input from "../../lib/ui/Input.svelte";
  import RepeatedEvents from "../repeating-events/RepeatedEvents.svelte";
  import UploadFile from "../upload/UploadFile.svelte";
  import BoardSelector from "./BoardSelector.svelte";
  import { connector } from "./connector.svelte";
  import RepositorySelected from "./RepositorySelected.svelte";

  let port = $state(String(connector.settings.value.port));
  const portValid = $derived(/^\d+$/.test(port.trim()) && Number(port) > 0 && Number(port) < 65536);

  function reconnect(event: SubmitEvent) {
    event.preventDefault();
    if (!portValid) return;
    connector.settings.value.port = Number(port);
    connector.connect();
  }
</script>

<section class="control-panel" aria-labelledby="control-panel-title">
  {#if connector.status === "connected"}
    <header class="header">
      <h1 id="control-panel-title" class="title header-m">Connector Settings</h1>
      <div class="actions">
        <UploadFile />
        <Input
          bind:value={connector.settings.value.teamName}
          width={256}
          placeholder="Team Name"
          aria-label="Team name"
        />
      </div>
    </header>
    <div class="settings">
      <RepositorySelected />
      <RepeatedEvents />
      <BoardSelector />
    </div>
  {:else}
    <h1 id="control-panel-title" class="title header-m">Connector Settings</h1>
    <div class="disconnected">
      <p class="body-small" role="status">
        Local server must be running in order to get data to pass onto the CRT Monitor,<br />
        however this dashboard is unable to find your server, please make sure<br />
        it is running correctly.
      </p>
      <form class="retry" onsubmit={reconnect}>
        <Input
          bind:value={port}
          width={67}
          placeholder="Port"
          inputmode="numeric"
          aria-label="crtboardd port"
          aria-invalid={!portValid}
        />
        <Button
          type="submit"
          pressed={connector.status === "connecting"}
          disabled={connector.status === "connecting"}
        >
          Try Again
        </Button>
      </form>
    </div>
  {/if}
</section>

<style>
  .control-panel {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    gap: 16px;
    align-items: flex-start;
    width: 740px;
    padding: 8px;
    overflow: hidden;
    background: var(--gray-800);
    box-shadow: 8px 8px 0 var(--gray-950);
  }

  .title {
    color: var(--white);
    white-space: nowrap;
  }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 5px 0;
  }

  .actions {
    display: flex;
    flex-shrink: 0;
    gap: 16px;
    align-items: center;
  }

  .settings {
    display: flex;
    gap: 8px;
    align-items: flex-start;
    justify-content: space-between;
    width: 100%;
    overflow: hidden;
  }

  .disconnected {
    display: flex;
    flex-direction: column;
    gap: 8px;
    align-items: center;
    justify-content: center;
    width: 100%;
    overflow: hidden;
  }

  .retry {
    display: flex;
    flex-shrink: 0;
    gap: 8px;
    align-items: center;
  }

  .disconnected p {
    color: var(--white);
    white-space: nowrap;
  }
</style>
