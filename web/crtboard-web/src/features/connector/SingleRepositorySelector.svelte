<!--
  @component
  Figma `Single Repository Selector`: picks the repository shown in one of
  the CRT's two branch rows; dimmed while empty.
-->
<script lang="ts">
  import Icon from "../../lib/icons/Icon.svelte";
  import TextSelect from "../../lib/ui/TextSelect.svelte";

  interface Props {
    slot: number;
    value: string | null;
    repos: string[];
    /** Repositories already shown in the other row. */
    taken: string[];
    onchange: (name: string | null) => void;
  }

  let { slot, value, repos, taken, onchange }: Props = $props();

  const options = $derived([
    { value: "", label: "No Repository" },
    ...repos.map((name) => ({ value: name, label: name, disabled: taken.includes(name) })),
  ]);
</script>

<div class="single-repository-selector" class:selected={value !== null}>
  <Icon name={value === null ? "git-fork-slash" : "git-fork"} />
  <TextSelect
    value={value ?? ""}
    {options}
    aria-label="Repository {slot + 1}"
    onchange={(event) => onchange(event.currentTarget.value || null)}
  />
</div>

<style>
  .single-repository-selector {
    display: flex;
    flex-shrink: 0;
    gap: 4px;
    align-items: center;
    max-width: 220px;
    overflow: hidden;
    color: var(--gray-50);
    opacity: 0.7;
  }

  .selected {
    opacity: 1;
  }
</style>
