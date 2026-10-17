<!--
  @component
  Figma `Git Status`: one tracked repository's review requests, name and
  current branch.
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
  .git-status {
    display: flex;
    flex: 1 0 0;
    gap: 8px;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    padding: 7px 0;
    overflow: hidden;
  }
</style>
