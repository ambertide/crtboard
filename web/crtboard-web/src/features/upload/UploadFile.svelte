<!--
  @component
  Figma `Upload File`: picks an image to show on the CRT (Upload) and takes
  it off again (Stop).
-->
<script lang="ts">
  import Icon from "../../lib/icons/Icon.svelte";
  import Button from "../../lib/ui/Button.svelte";
  import { upload } from "./upload.svelte";

  let input: HTMLInputElement;

  const active = $derived(upload.phase === "intro" || upload.phase === "showing");

  function choose(event: Event & { currentTarget: HTMLInputElement }) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) upload.play(file);
  }
</script>

<div class="upload-file">
  {#if active}
    <Button color="delete" variant="compact" aria-label="Stop showing the image" onclick={() => upload.stop()}>
      <Icon name="file-cross" size={18} />
    </Button>
  {:else}
    <Button
      variant="compact"
      aria-label="Show an image on the CRT"
      pressed={upload.phase === "outro"}
      disabled={upload.phase === "outro"}
      onclick={() => input.click()}
    >
      <Icon name="file-arrow-up" size={18} />
    </Button>
  {/if}
  <input bind:this={input} type="file" accept="image/*" hidden onchange={choose} />
</div>

<style>
  .upload-file {
    display: flex;
    flex-shrink: 0;
    align-items: flex-start;
  }
</style>
