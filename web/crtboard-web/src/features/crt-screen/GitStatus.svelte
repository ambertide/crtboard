<!--
  @component
  Figma `Git Status`: one tracked repository's review requests, name and
  current branch, with the name centred on the row.
-->
<script lang="ts">
  import CurrentBranch from "./CurrentBranch.svelte";
  import type { RepoRow } from "./dashboard.svelte";
  import ProjectName from "./ProjectName.svelte";
  import ReviewRequests from "./ReviewRequests.svelte";

  let { repo }: { repo: RepoRow } = $props();
</script>

<div class="git-status">
  <ReviewRequests count={repo.reviewRequested} flash={repo.reviewFlash} />
  <ProjectName name={repo.name} />
  <CurrentBranch branch={repo.branch} flash={repo.branchFlash} />
</div>

<style>
  /* Equal side columns keep the project name centred on the row. */
  .git-status {
    display: grid;
    flex: 1 0 0;
    grid-template-columns: minmax(0, 1fr) minmax(0, max-content) minmax(0, 1fr);
    gap: 8px;
    align-items: center;
    min-width: 0;
    padding: 7px 0;
    overflow: hidden;
  }
</style>
