<!--
  @component
  Figma `Input`, a native text input. The placeholder variant is the native
  placeholder at 40% opacity.
-->
<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";

  interface Props extends Omit<HTMLInputAttributes, "value"> {
    value: string;
    width?: number;
  }

  let { value = $bindable(), width = 128, type = "text", ...rest }: Props = $props();
</script>

<input {type} class="input body-small" style:width="{width}px" bind:value {...rest} />

<style>
  .input {
    flex-shrink: 0;
    margin: 0;
    padding: 0 5px;
    border: 0;
    border-radius: 0;
    background: var(--gray-50);
    color: var(--gray-950);
    box-shadow: 3px 3px 0 var(--gray-400);
  }

  .input::placeholder {
    color: var(--gray-950);
    opacity: 0.4;
  }
</style>
