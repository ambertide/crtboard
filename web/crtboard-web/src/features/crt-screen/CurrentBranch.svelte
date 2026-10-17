<!--
  @component
  Figma `Current Branch`: the branch checked out in the repository. When it
  does not fit, its path segments shrink to their initials from the left; only
  then is the last segment cut short.
-->
<script lang="ts">
  import Icon from "../../lib/icons/Icon.svelte";
  import { branchCandidates } from "./branch";
  import { FLASH_COLORS, type FlashPhase } from "./flash";

  let { branch, flash = null }: { branch: string; flash?: FlashPhase | null } = $props();

  let name: HTMLElement;
  let measure: HTMLElement;
  let available = $state(0);
  let shown = $state("");

  $effect(() => {
    const observer = new ResizeObserver(() => (available = name.clientWidth));
    observer.observe(name);
    return () => observer.disconnect();
  });

  $effect(() => {
    const candidates = branchCandidates(branch);
    shown = candidates.at(-1)!;
    for (const candidate of candidates) {
      measure.textContent = candidate;
      if (measure.offsetWidth <= available) {
        shown = candidate;
        break;
      }
    }
  });
</script>

<p class="current-branch body-small" style:color={flash ? FLASH_COLORS[flash] : undefined}>
  <span class="name" bind:this={name}>{shown}</span>
  <Icon name="git-branch" />
  <span class="measure" bind:this={measure} aria-hidden="true"></span>
</p>

<style>
  .current-branch {
    position: relative;
    display: flex;
    gap: 8px;
    align-items: center;
    justify-content: flex-end;
    min-width: 0;
    color: var(--gray-50);
  }

  .name {
    flex: 1 1 0;
    min-width: 0;
    overflow: hidden;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .measure {
    position: absolute;
    visibility: hidden;
    white-space: nowrap;
  }
</style>
