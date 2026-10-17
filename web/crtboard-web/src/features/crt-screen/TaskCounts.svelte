<!--
  @component
  Figma `Task Counts`: one board column's icon and task count, dimmed when the
  column is empty.
-->
<script lang="ts">
  import Icon from "../../lib/icons/Icon.svelte";
  import type { IconName } from "../../lib/icons/icons";
  import type { ColumnKind } from "../connector/types";
  import { FLASH_COLORS, type FlashPhase } from "./flash";

  let { kind, count, flash = null }: { kind: ColumnKind; count: number; flash?: FlashPhase | null } = $props();

  const COLUMNS: Record<ColumnKind, { icon: IconName; label: string }> = {
    TO_DO: { icon: "calendar", label: "To Do" },
    BLOCKED: { icon: "roadblock", label: "Blocked" },
    IN_PROGRESS: { icon: "hourglass", label: "In Progress" },
    DONE: { icon: "done", label: "Done" },
  };

  const column = $derived(COLUMNS[kind]);
</script>

<li class="task-counts" class:active={count > 0} style:color={flash ? FLASH_COLORS[flash] : undefined}>
  <Icon name={column.icon} />
  <span class="visually-hidden">{column.label}:</span>
  <span class="count body-small">{count}</span>
</li>

<style>
  .task-counts {
    display: flex;
    flex-shrink: 0;
    gap: 4px;
    align-items: center;
    color: var(--gray-400);
  }

  .active {
    color: var(--gray-50);
  }

  .count {
    display: flex;
    flex-direction: column;
    justify-content: center;
    min-width: 20px;
    height: 20px;
  }
</style>
