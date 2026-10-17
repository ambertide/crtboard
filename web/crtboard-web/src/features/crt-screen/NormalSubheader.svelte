<!--
  @component
  Figma `Normal Subheader`: whether it is a good time to deploy.
-->
<script lang="ts">
  import { DEPLOYMENT_LABELS, type DeploymentAdvice } from "./deployment";
  import { FLASH_COLORS, type FlashPhase } from "./flash";

  let { advice, flash = null }: { advice: DeploymentAdvice; flash?: FlashPhase | null } = $props();
</script>

<p class="normal-subheader header-l" style:color={flash ? FLASH_COLORS[flash] : undefined}>
  {DEPLOYMENT_LABELS[advice]}
</p>

<style>
  .normal-subheader {
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 49px;
    color: var(--gray-400);
    text-align: center;
    white-space: nowrap;
  }
</style>
