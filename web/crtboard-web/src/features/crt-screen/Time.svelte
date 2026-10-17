<!--
  @component
  Figma `Time`: the wall clock in the CRT header. It never flashes.
-->
<script lang="ts">
  let { time }: { time: string } = $props();
</script>

<time class="time body-small" datetime={time}>{time}</time>

<style>
  .time {
    flex-shrink: 0;
    color: var(--gray-50);
    text-align: center;
    white-space: nowrap;
  }
</style>
