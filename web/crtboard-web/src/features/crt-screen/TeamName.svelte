<!--
  @component
  Figma `Some Example Team`: the team name typed into the connector settings.
-->
<script lang="ts">
  let { name }: { name: string } = $props();
</script>

<p class="team-name body-small">{name}</p>

<style>
  .team-name {
    max-width: 360px;
    overflow: hidden;
    color: var(--gray-50);
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
