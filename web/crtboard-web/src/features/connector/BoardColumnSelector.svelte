<!--
  @component
  Figma `Board Column Selector`: matches one of the CRT's four columns to a
  column of the chosen board; dimmed while unmatched.
-->
<script lang="ts">
  import Icon from "../../lib/icons/Icon.svelte";
  import type { IconName } from "../../lib/icons/icons";
  import TextSelect from "../../lib/ui/TextSelect.svelte";
  import type { ColumnKind } from "./types";

  interface Props {
    kind: ColumnKind;
    value: string | null;
    columns: string[];
    onchange: (column: string | null) => void;
  }

  let { kind, value, columns, onchange }: Props = $props();

  const KINDS: Record<ColumnKind, { icon: IconName; label: string }> = {
    TO_DO: { icon: "calendar", label: "To Do" },
    BLOCKED: { icon: "roadblock", label: "Blocked" },
    IN_PROGRESS: { icon: "hourglass", label: "In Progress" },
    DONE: { icon: "done", label: "Done" },
  };

  const column = $derived(KINDS[kind]);
  const options = $derived([
    { value: "", label: `${column.label} Not Selected` },
    ...columns.map((name) => ({ value: name, label: name })),
  ]);
</script>

<li class="board-column-selector" class:selected={value !== null}>
  <Icon name={column.icon} />
  <TextSelect
    value={value ?? ""}
    {options}
    aria-label="{column.label} column"
    onchange={(event) => onchange(event.currentTarget.value || null)}
  />
</li>

<style>
  .board-column-selector {
    display: flex;
    flex-shrink: 0;
    gap: 4px;
    align-items: center;
    width: 100%;
    padding: 4px;
    overflow: hidden;
    color: var(--gray-50);
    opacity: 0.7;
  }

  .selected {
    opacity: 1;
  }
</style>
