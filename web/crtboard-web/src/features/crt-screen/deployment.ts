/** Variants of the Figma `Normal Subheader` component. */
export type DeploymentAdvice = "go" | "avoid" | "do-not-deploy";

export const DEPLOYMENT_LABELS: Record<DeploymentAdvice, string> = {
  go: "Deployment Ready",
  avoid: "Avoid Deployment",
  "do-not-deploy": "Do Not Deploy",
};

/** Deploy freely early in the week, carefully on Fridays, and not at all on weekends. */
export function deploymentAdvice(now: Date): DeploymentAdvice {
  const day = now.getDay();
  if (day === 0 || day === 6) return "do-not-deploy";
  if (day === 5) return "avoid";
  return "go";
}
