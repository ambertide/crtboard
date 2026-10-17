<!--
  @component
  Figma `Repeated Event Row`: an event's name and crontab expression, with
  buttons to preview it on the CRT and to delete it.
-->
<script lang="ts">
  import Icon from "../../lib/icons/Icon.svelte";
  import Button from "../../lib/ui/Button.svelte";
  import Input from "../../lib/ui/Input.svelte";
  import { parseCron } from "./cron";
  import { repeatingEvents, type RepeatingEvent } from "./repeating-events.svelte";

  let { event }: { event: RepeatingEvent } = $props();

  const invalid = $derived(event.cron.trim() !== "" && parseCron(event.cron) === null);
  const previewing = $derived(repeatingEvents.preview?.id === event.id);
</script>

<li class="repeated-event-row">
  <Input bind:value={event.name} placeholder="Event Name" aria-label="Event name" />
  <Input
    bind:value={event.cron}
    placeholder="* * 6 * *"
    aria-label="Crontab expression for {event.name || 'this event'}"
    aria-invalid={invalid}
    spellcheck={false}
  />
  <div class="buttons">
    <Button
      variant="compact"
      pressed={previewing}
      aria-pressed={previewing}
      aria-label="Preview {event.name || 'this event'} on the CRT"
      onclick={() => repeatingEvents.togglePreview(event.id)}
    >
      <Icon name="eye" size={18} />
    </Button>
    <Button
      color="delete"
      variant="compact"
      aria-label="Delete {event.name || 'this event'}"
      onclick={() => repeatingEvents.remove(event.id)}
    >
      <Icon name="trash-can" size={18} />
    </Button>
  </div>
</li>

<style>
  .repeated-event-row {
    display: flex;
    flex-shrink: 0;
    gap: 8px;
    align-items: center;
    padding: 4px;
    overflow: hidden;
  }

  .buttons {
    display: flex;
    flex-shrink: 0;
    gap: 4px;
    width: 52px;
    height: 22px;
  }
</style>
