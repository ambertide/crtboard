<!--
  @component
  Figma `Button`: Default or Delete colour, Normal or Compact style, and a
  pressed state that is shown while held or while `pressed` is set.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";

  interface Props extends Omit<HTMLButtonAttributes, "color" | "style"> {
    color?: "default" | "delete";
    variant?: "normal" | "compact";
    pressed?: boolean;
    /** Stretch to the parent's width, as the "Add Repeated event" button does. */
    fill?: boolean;
    textSize?: "small" | "large";
    children: Snippet;
  }

  let {
    color = "default",
    variant = "normal",
    pressed = false,
    fill = false,
    textSize = "small",
    type = "button",
    children,
    ...rest
  }: Props = $props();
</script>

<button
  {type}
  class="button {color} {variant}"
  class:pressed
  class:fill
  class:body-small={textSize === "small"}
  class:body-large={textSize === "large"}
  {...rest}
>
  {@render children()}
</button>

<style>
  .button {
    display: inline-flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    margin: 0;
    border: 0;
    border-radius: 0;
    color: var(--white);
    white-space: nowrap;
    cursor: pointer;
    box-shadow: 3px 3px 0 var(--gray-950);
  }

  .default {
    background: var(--gray-900);
  }

  .delete {
    background: var(--gray-500);
  }

  .normal {
    min-width: 79px;
    padding: 4px 16px;
  }

  .compact {
    width: 22px;
    height: 22px;
    padding: 2px;
    color: var(--gray-50);
  }

  .fill {
    width: 100%;
  }

  .pressed,
  .button:active:not(:disabled) {
    box-shadow: 1px 1px 0 var(--gray-950);
  }

  .button:disabled {
    cursor: default;
  }
</style>
