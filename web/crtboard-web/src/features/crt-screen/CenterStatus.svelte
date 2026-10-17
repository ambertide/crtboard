<!--
  @component
  Figma `Center Status`: the status with the deployment advice (Normal) or
  with a countdown to a repeating event (Time).
-->
<script lang="ts">
  import type { CenterView } from "./dashboard.svelte";
  import NormalSubheader from "./NormalSubheader.svelte";
  import Status from "./Status.svelte";
  import { STATUS_LABELS } from "./status";
  import TimeBasedSubheader from "./TimeBasedSubheader.svelte";

  let { view }: { view: CenterView } = $props();
</script>

<section class="center-status" aria-live="polite">
  {#if view.kind === "normal"}
    <Status label={STATUS_LABELS[view.status]} dimmed={view.status === "nominal"} flash={view.statusFlash} />
    <NormalSubheader advice={view.advice} flash={view.adviceFlash} />
  {:else}
    <Status label={view.name} flash={view.statusFlash} />
    <TimeBasedSubheader remainingMs={view.remainingMs} />
  {/if}
</section>

<style>
  .center-status {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    gap: 4px;
    align-items: center;
    justify-content: center;
    max-width: 100%;
    overflow: hidden;
  }
</style>
