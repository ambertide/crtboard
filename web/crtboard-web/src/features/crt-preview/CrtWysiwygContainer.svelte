<!--
  @component
  Figma `CRT WSYIWYG Container`: the screen canvas drawn through the CRT
  shader. `screen` is the live DOM the canvas is rasterised from; it stays in
  the page, off-screen, so assistive technology can still read it.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { SCREEN_HEIGHT, SCREEN_WIDTH, type ScreenSource } from "./screen-source";
  import { startCrtRenderer } from "./shader/crt-renderer";

  let { source, overlay, screen }: { source: ScreenSource; overlay?: Snippet; screen?: Snippet } = $props();

  let canvas: HTMLCanvasElement;
  const scale = Math.min(window.devicePixelRatio || 1, 2);

  $effect(() => startCrtRenderer(canvas, source.canvas));
</script>

<section class="crt-wysiwyg-container" aria-label="CRT preview">
  <div class="content">
    <canvas
      bind:this={canvas}
      width={SCREEN_WIDTH * scale}
      height={SCREEN_HEIGHT * scale}
      style:width="{SCREEN_WIDTH}px"
      style:height="{SCREEN_HEIGHT}px"
      aria-hidden="true"
    ></canvas>
    {#if overlay}
      <div class="overlay">{@render overlay()}</div>
    {/if}
  </div>
  {#if screen}
    <div class="screen">{@render screen()}</div>
  {/if}
</section>

<style>
  .crt-wysiwyg-container {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 740px;
    height: 596px;
    padding: 10px;
    overflow: hidden;
    background: var(--gray-800);
  }

  .content {
    position: relative;
    width: 720px;
    height: 576px;
    overflow: hidden;
  }

  canvas {
    display: block;
  }

  .overlay {
    position: absolute;
    inset: 0;
  }

  .screen {
    position: fixed;
    top: 0;
    left: -10000px;
    pointer-events: none;
  }
</style>
