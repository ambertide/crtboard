<!--
  @component
  Figma `Review Requests`: how many of a repository's PRs are waiting on a
  review from the tracked users; dimmed when there are none.
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
  <span>{text}</span>
</p>

<style>
  .review-requests {
    display: flex;
    flex-shrink: 0;
    gap: 8px;
    align-items: center;
    overflow: hidden;
    color: var(--gray-400);
    white-space: nowrap;
  }

  .existing {
    color: var(--gray-50);
  }
</style>
