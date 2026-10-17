<!--
  @component
  A native select whose closed state reads like the label text in the Figma
  selectors; the option list is left to the browser.
-->
<script lang="ts">
  import type { HTMLSelectAttributes } from "svelte/elements";

  interface Option {
    value: string;
    label: string;
    disabled?: boolean;
  }

  interface Props extends Omit<HTMLSelectAttributes, "value"> {
    value: string;
    options: Option[];
  }

  let { value = $bindable(), options, ...rest }: Props = $props();
</script>

<select class="select body-small" bind:value {...rest}>
  {#each options as option (option.value)}
    <option value={option.value} disabled={option.disabled}>{option.label}</option>
  {/each}
</select>

<style>
  .select {
    min-width: 0;
    max-width: 100%;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--gray-50);
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
    appearance: none;
  }

  .select:disabled {
    cursor: default;
  }

  option {
    color: CanvasText;
    background: Canvas;
  }
</style>
