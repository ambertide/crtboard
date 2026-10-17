<!--
  @component
  Figma `Project Name`: the repository name, centred in its row.
-->
<script lang="ts">
  let { name }: { name: string } = $props();
</script>

<h3 class="project-name header-xs">{name}</h3>

<style>
  .project-name {
    min-width: 0;
    max-width: 240px;
    height: 24px;
    overflow: hidden;
    color: var(--gray-50);
    text-align: center;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
