<!--
  @component
  Figma `Time Based Subheader`: countdown to a repeating event, as
  `t - 08M 06S`. It never flashes.
-->
<script lang="ts">
  let { remainingMs }: { remainingMs: number } = $props();

  const text = $derived.by(() => {
    const seconds = Math.ceil(remainingMs / 1000);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `t - ${pad(Math.floor(seconds / 60))}M ${pad(seconds % 60)}S`;
  });
</script>

<p class="time-based-subheader header-l">{text}</p>

<style>
  .time-based-subheader {
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 56px;
    color: var(--white);
    text-align: center;
    white-space: nowrap;
  }
</style>
