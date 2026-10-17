<!--
  @component
  Figma `Board Selector Header`: picks the Asana board; dimmed while none is
  chosen.
-->
<script lang="ts">
  import Icon from "../../lib/icons/Icon.svelte";
  import TextSelect from "../../lib/ui/TextSelect.svelte";

  interface Props {
    value: string | null;
    boards: string[];
    onchange: (name: string | null) => void;
  }

  let { value, boards, onchange }: Props = $props();

  const options = $derived([
    { value: "", label: "No Board" },
    ...boards.map((name) => ({ value: name, label: name })),
  ]);
</script>

<div class="board-selector-header" class:selected={value !== null}>
  <Icon name="clipboard" />
  <TextSelect
    value={value ?? ""}
    {options}
    aria-label="Asana board"
    onchange={(event) => onchange(event.currentTarget.value || null)}
  />
</div>

<style>
  .board-selector-header {
    display: flex;
    flex-shrink: 0;
    gap: 4px;
    align-items: center;
    max-width: 100%;
    padding: 4px;
    overflow: hidden;
    color: var(--gray-50);
    opacity: 0.7;
  }

  .selected {
    opacity: 1;
  }
</style>
