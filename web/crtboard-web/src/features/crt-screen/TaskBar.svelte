<!--
  @component
  Figma `Task Bar`: the task counts of the tracked board's four columns.
-->
<script lang="ts">
  import type { TaskCount } from "./dashboard.svelte";
  import TaskCounts from "./TaskCounts.svelte";

  let { tasks }: { tasks: TaskCount[] } = $props();
</script>

<ul class="task-bar" aria-label="Tasks">
  {#each tasks as task (task.kind)}
    <TaskCounts kind={task.kind} count={task.count} flash={task.flash} />
  {/each}
</ul>

<style>
  .task-bar {
    display: flex;
    flex-shrink: 0;
    gap: 4px;
    align-items: flex-start;
    padding: 4px;
    overflow: hidden;
  }
</style>
