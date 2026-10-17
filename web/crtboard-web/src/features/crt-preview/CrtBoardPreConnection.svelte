<!--
  @component
  Figma `CRTBoard PreConnection`: lays the warning over the dimmed test card.
  The test card itself is painted on the screen canvas so it gets the CRT
  shader; this component only places the interactive warning above it.
-->
<script lang="ts">
  import type { Snippet } from "svelte";

  let { children }: { children: Snippet } = $props();
</script>

<div class="pre-connection">
  {@render children()}
</div>

<style>
  .pre-connection {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 720px;
    height: 576px;
    padding: 139px 58px;
    overflow: hidden;
  }
</style>
