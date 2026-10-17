<!--
  @component
  Figma `CRT Window`: the 720×576 PAL frame sent to the Raspberry Pi. Strokes
  are drawn as inset shadows because Figma's inside strokes take no space.
-->
<script lang="ts">
  import CenterStatus from "./CenterStatus.svelte";
  import type { CenterView, RepoRow, TaskCount } from "./dashboard.svelte";
  import GitStatus from "./GitStatus.svelte";
  import TaskBar from "./TaskBar.svelte";
  import TeamName from "./TeamName.svelte";
  import Time from "./Time.svelte";

  interface Props {
    tasks: TaskCount[];
    teamName: string;
    time: string;
    center: CenterView;
    repos: RepoRow[];
    element?: HTMLElement;
  }

  let { tasks, teamName, time, center, repos, element = $bindable() }: Props = $props();
</script>

<article class="crt-window tokens" aria-label="CRT dashboard" bind:this={element}>
  <div class="outer-border stroke">
    <div class="inner-body stroke">
      <header class="header stroke">
        <TaskBar {tasks} />
        <div class="identity">
          {#if teamName}
            <TeamName name={teamName} />
            <span class="separator body-small" aria-hidden="true">·</span>
          {/if}
          <Time {time} />
        </div>
      </header>
      <div class="body stroke">
        <CenterStatus view={center} />
      </div>
      {#if repos.length}
        <ul class="branches" aria-label="Repositories">
          {#each repos as repo (repo.name)}
            <li class="branch stroke"><GitStatus {repo} /></li>
          {/each}
        </ul>
      {/if}
    </div>
  </div>
</article>

<style>
  .crt-window {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 720px;
    height: 576px;
    padding: 18px;
    background: var(--gray-950);
  }

  .stroke {
    box-shadow: inset 0 0 0 2px var(--gray-50);
  }

  .outer-border {
    display: flex;
    flex-direction: column;
    width: 100%;
    padding: 4px;
    overflow: hidden;
  }

  .inner-body {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 532px;
    overflow: hidden;
  }

  .header {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    height: 36px;
    padding: 0 8px;
    overflow: hidden;
  }

  .identity {
    display: flex;
    gap: 4px;
    align-items: center;
    min-width: 0;
  }

  .separator {
    color: var(--gray-400);
  }

  .body {
    display: flex;
    flex: 1 0 0;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-height: 1px;
    overflow: hidden;
  }

  .branches {
    display: contents;
  }

  .branch {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 36px;
    padding: 0 8px;
    overflow: hidden;
  }
</style>
