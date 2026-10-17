/**
 * Ever shorter forms of a branch name, longest first: path segments collapse
 * to their first letter one at a time from the left, so
 * `feature/tokenizer/add-ld` becomes `f/tokenizer/add-ld`, then `f/t/add-ld`.
 * The last segment is never collapsed.
 */
export function branchCandidates(branch: string): string[] {
  const segments = branch.split("/");
  const candidates = [branch];
  for (let i = 0; i < segments.length - 1; i++) {
    if (segments[i].length <= 1) continue;
    segments[i] = segments[i][0];
    candidates.push(segments.join("/"));
  }
  return candidates;
}
