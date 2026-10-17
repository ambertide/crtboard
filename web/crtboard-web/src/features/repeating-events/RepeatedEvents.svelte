<!--
  @component
  Figma `Repeated Events`: the list of repeating events (Filled) or a hint on
  how to add one (Empty). The list scrolls within itself.
-->
<script lang="ts">
  import Button from "../../lib/ui/Button.svelte";
  import RepeatedEventRow from "./RepeatedEventRow.svelte";
  import { repeatingEvents } from "./repeating-events.svelte";
</script>

<section class="repeated-events" class:empty={repeatingEvents.items.length === 0} aria-label="Repeating events">
  {#if repeatingEvents.items.length === 0}
    <p class="body-small">No repeating events added yet, you can add a repeating event with a crontab expression</p>
  {:else}
    <ul class="rows">
      {#each repeatingEvents.items as event (event.id)}
        <RepeatedEventRow {event} />
      {/each}
    </ul>
  {/if}
  <Button fill onclick={() => repeatingEvents.add()}>Add Repeated event</Button>
</section>

<style>
  .repeated-events {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    gap: 10px;
    align-items: flex-start;
    justify-content: center;
    padding: 4px 0;
    overflow: hidden;
  }

  .empty {
    width: 324px;
  }

  p {
    width: 100%;
    color: var(--gray-50);
  }

  /* Two rows tall, as in the Filled variant; more rows scroll here instead of growing the panel. */
  .rows {
    display: flex;
    flex-direction: column;
    gap: 2px;
    align-items: flex-start;
    max-height: 64px;
    overflow-y: auto;
  }
</style>
