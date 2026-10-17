<!--
  @component
  Figma `Board Selector`: the Asana board and, once one is chosen, its column
  matches. The column list scrolls inside its own box.
-->
<script lang="ts">
  import BoardColumnSelector from "./BoardColumnSelector.svelte";
  import BoardSelectorHeader from "./BoardSelectorHeader.svelte";
  import { connector } from "./connector.svelte";
  import { COLUMN_KINDS } from "./types";

  const board = $derived(connector.settings.value.board);
  const columns = $derived(
    connector.available.asanaBoards.find((b) => b.name === board?.name)?.availableColumns ?? [],
  );
</script>

<fieldset class="board-selector" class:selected={board !== null}>
  <legend class="visually-hidden">Asana board</legend>
  <BoardSelectorHeader
    value={board?.name ?? null}
    boards={connector.available.asanaBoards.map((b) => b.name)}
    onchange={(name) => connector.setBoard(name)}
  />
  {#if board}
    <ul class="columns" aria-label="Board columns">
      {#each COLUMN_KINDS as kind (kind)}
        <BoardColumnSelector
          {kind}
          value={board.columns[kind]}
          {columns}
          onchange={(column) => connector.setColumn(kind, column)}
        />
      {/each}
    </ul>
  {/if}
</fieldset>

<style>
  .board-selector {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    align-items: flex-start;
    min-width: 0;
    margin: 0;
    padding: 0;
    overflow: hidden;
    border: 0;
  }

  .selected {
    width: 210px;
  }

  .columns {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
    height: 80px;
    padding-left: 32px;
    overflow-y: auto;
  }
</style>
