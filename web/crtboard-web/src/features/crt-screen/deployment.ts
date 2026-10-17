/** Variants of the Figma `Normal Subheader` component. */
export type DeploymentAdvice = "go" | "avoid" | "do-not-deploy";

export const DEPLOYMENT_LABELS: Record<DeploymentAdvice, string> = {
  go: "Deployment Ready",
  avoid: "Avoid Deployment",
  "do-not-deploy": "Do Not Deploy",
};

const FRIDAY = 5;
const at = (hours: number, minutes = 0) => hours * 60 + minutes;

/**
 * Deployment advice by local time (Prompts/011_Deploys.md):
 * - Ready: Monday to Thursday, 06:00–16:30.
 * - Avoid: Monday to Thursday, 04:00–06:00 and 16:30–20:30; Friday 04:00–12:00.
 * - Do not deploy: weekdays 20:30 to 04:00 the next day, Friday from 12:00,
 *   and weekends.
 */
export function deploymentAdvice(now: Date): DeploymentAdvice {
  const day = now.getDay();
  const minute = at(now.getHours(), now.getMinutes());
  if (day === 0 || day === 6) return "do-not-deploy";
  if (minute < at(4)) return "do-not-deploy";
  if (day === FRIDAY) return minute < at(12) ? "avoid" : "do-not-deploy";
  if (minute < at(6)) return "avoid";
  if (minute < at(16, 30)) return "go";
  if (minute < at(20, 30)) return "avoid";
  return "do-not-deploy";
}
