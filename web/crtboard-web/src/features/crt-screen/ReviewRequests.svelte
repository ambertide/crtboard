<!--
  @component
  Figma `Review Requests`: how many of a repository's PRs, opened by or
  awaiting review from the tracked users, are still waiting to be merged;
  dimmed when there are none.
-->
<script lang="ts">
  import Icon from "../../lib/icons/Icon.svelte";
  import { FLASH_COLORS, type FlashPhase } from "./flash";

  let { count, flash = null }: { count: number; flash?: FlashPhase | null } = $props();

  const text = $derived(
    count === 0 ? "No PRs Waiting Merge" : `${count} ${count === 1 ? "PR" : "PRs"} Waiting for Merge`,
  );
</script>

<p class="review-requests body-small" class:existing={count > 0} style:color={flash ? FLASH_COLORS[flash] : undefined}>
  <Icon name="git-merge" />
  <span class="text">{text}</span>
</p>

<style>
  .review-requests {
    display: flex;
    gap: 8px;
    align-items: center;
    justify-self: start;
    min-width: 0;
    max-width: 100%;
    color: var(--gray-400);
    white-space: nowrap;
  }

  .text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .existing {
    color: var(--gray-50);
  }
</style>
