<!--
  @component
  Figma `Current Branch`: the branch checked out in the repository, truncated
  when it does not fit.
-->
<script lang="ts">
  import Icon from "../../lib/icons/Icon.svelte";
  import { FLASH_COLORS, type FlashPhase } from "./flash";

  let { branch, flash = null }: { branch: string; flash?: FlashPhase | null } = $props();
</script>

<p class="current-branch body-small" style:color={flash ? FLASH_COLORS[flash] : undefined}>
  <span class="name">{branch}</span>
  <Icon name="git-branch" />
</p>

<style>
  .current-branch {
    display: flex;
    flex-shrink: 1;
    gap: 8px;
    align-items: center;
    min-width: 0;
    max-width: 50%;
    color: var(--gray-50);
  }

  .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
