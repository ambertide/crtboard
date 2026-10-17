<!--
  @component
  Figma `Repository Selected`: the two repository pickers.
-->
<script lang="ts">
  import { connector } from "./connector.svelte";
  import SingleRepositorySelector from "./SingleRepositorySelector.svelte";

  const repos = $derived(connector.available.gitRepos.map((repo) => repo.name));
  const chosen = $derived(connector.settings.value.repos.map((repo) => repo?.name ?? null));
</script>

<fieldset class="repository-selected">
  <legend class="visually-hidden">Repositories</legend>
  {#each chosen as value, slot (slot)}
    <SingleRepositorySelector
      {slot}
      {value}
      {repos}
      taken={chosen.filter((name, other) => name !== null && other !== slot) as string[]}
      onchange={(name) => connector.setRepo(slot, name)}
    />
  {/each}
</fieldset>

<style>
  .repository-selected {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    gap: 10px;
    align-items: flex-start;
    min-width: 0;
    margin: 0;
    padding: 0;
    overflow: hidden;
    border: 0;
  }
</style>
