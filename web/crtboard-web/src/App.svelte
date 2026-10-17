<script lang="ts">
  import { onMount } from "svelte";
  import { broadcast } from "./features/broadcast/broadcast.svelte";
  import ControlPanel from "./features/connector/ControlPanel.svelte";
  import { connector } from "./features/connector/connector.svelte";
  import CrtBoardPreConnection from "./features/crt-preview/CrtBoardPreConnection.svelte";
  import CrtboardWarning from "./features/crt-preview/CrtboardWarning.svelte";
  import CrtWysiwygContainer from "./features/crt-preview/CrtWysiwygContainer.svelte";
  import { ScreenSource, type ScreenMode } from "./features/crt-preview/screen-source";
  import CrtWindow from "./features/crt-screen/CrtWindow.svelte";
  import { dashboard } from "./features/crt-screen/dashboard.svelte";
  import { upload } from "./features/upload/upload.svelte";

  const source = new ScreenSource();
  let dashboardElement = $state<HTMLElement>();

  /** What the CRT shows; the test card stands in whenever there is nothing else. */
  const mode: ScreenMode = $derived.by(() => {
    if (broadcast.status !== "live") return { kind: "pre-connection" };
    if (upload.phase === "showing" && upload.image) return { kind: "image", image: upload.image };
    if (upload.phase !== "idle") return { kind: "test-card" };
    if (connector.status !== "connected" || !dashboardElement) return { kind: "test-card" };
    return { kind: "dashboard", element: dashboardElement };
  });

  $effect(() => source.setMode(mode));

  onMount(() => {
    connector.connect();
  });
</script>

<main class="browser">
  <CrtWysiwygContainer {source} overlay={broadcast.status === "live" ? undefined : warning} screen={crtScreen} />
  <ControlPanel />
</main>

{#snippet warning()}
  <CrtBoardPreConnection>
    <CrtboardWarning
      type={broadcast.status === "unsupported" ? "web-serial-error" : "before-connect"}
      connecting={broadcast.status === "connecting"}
      onbroadcast={() => broadcast.start(source.canvas)}
    />
  </CrtBoardPreConnection>
{/snippet}

{#snippet crtScreen()}
  {#if connector.status === "connected"}
    <CrtWindow
      bind:element={dashboardElement}
      tasks={dashboard.tasks}
      teamName={dashboard.teamName}
      time={dashboard.time}
      center={dashboard.center}
      repos={dashboard.repos}
    />
  {/if}
{/snippet}

<style>
  .browser {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 10px;
    overflow: auto;
    background: var(--gray-300);
  }
</style>
