<!--
  @component
  An `at-icons:*` glyph from the Figma file. It is painted with the current
  text colour so icons can flash together with their labels.
-->
<script lang="ts">
  import { icons, type IconName } from "./icons";

  let { name, size = 20 }: { name: IconName; size?: number } = $props();

  const icon = $derived(icons[name]);
</script>

<span class="icon" style:width="{size}px" style:height="{size}px" aria-hidden="true">
  <span
    class="glyph"
    style:inset={icon.inset}
    style:mask-image="url(&quot;{icon.url}&quot;)"
    style:-webkit-mask-image="url(&quot;{icon.url}&quot;)"
  ></span>
</span>

<style>
  .icon {
    position: relative;
    display: block;
    flex-shrink: 0;
  }

  .glyph {
    position: absolute;
    background-color: currentColor;
    mask-size: 100% 100%;
    mask-repeat: no-repeat;
    -webkit-mask-size: 100% 100%;
    -webkit-mask-repeat: no-repeat;
  }
</style>
