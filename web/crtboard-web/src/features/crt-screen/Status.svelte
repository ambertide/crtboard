<!--
  @component
  Figma `Status`: the headline in the middle of the CRT. Nominal is dimmed;
  every other status, including repeating events, is bright.
-->
<script lang="ts">
  import { FLASH_COLORS, type FlashPhase } from "./flash";

  let { label, dimmed = false, flash = null }: { label: string; dimmed?: boolean; flash?: FlashPhase | null } =
    $props();
</script>

<div class="status">
  <h2 class="label header-xl" class:dimmed style:color={flash ? FLASH_COLORS[flash] : undefined}>{label}</h2>
</div>

<style>
  .status {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    padding: 4px;
  }

  .label {
    max-width: 660px;
    overflow: hidden;
    color: var(--gray-50);
    text-align: center;
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .dimmed {
    color: var(--gray-400);
  }
</style>
