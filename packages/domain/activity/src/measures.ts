import { isWithin, type Period } from "./period";
import type { PullRequest } from "./pull-request";

/** What a pull request counts as in the view: opened, or merged. */
export type Measure = "opened" | "merged";

export const measures: readonly Measure[] = ["opened", "merged"];

/**
 * When the pull request counts for `measure`: its creation for opened, its
 * merge for merged (`null` when it is not merged).
 */
export function measureTime(pr: PullRequest, measure: Measure): Date | null {
  return measure === "opened" ? pr.createdAt : pr.mergedAt;
}

/** Opened: created within the period, whatever its state now. */
export function wasOpened(pr: PullRequest, period: Period): boolean {
  return isWithin(pr.createdAt, period);
}

/** Merged: merged within the period, even if created before it. */
export function wasMerged(pr: PullRequest, period: Period): boolean {
  return pr.mergedAt !== null && isWithin(pr.mergedAt, period);
}

/**
 * The pull request's latest event in the period: its merge if it was merged
 * in the period, else its creation.
 */
export function latestEventIn(pr: PullRequest, period: Period): Date {
  return pr.mergedAt !== null && wasMerged(pr, period)
    ? pr.mergedAt
    : pr.createdAt;
}

/**
 * Merges search results into one list of the pull requests opened or merged
 * in the period, each once (by `id`: a pull request opened and merged in the
 * period comes back from both searches), newest first by
 * {@link latestEventIn}. Pull requests neither opened nor merged in the
 * period are left out.
 */
export function mergeSearchResults(
  results: readonly (readonly PullRequest[])[],
  period: Period,
): PullRequest[] {
  const byId = new Map<string, PullRequest>();
  for (const result of results) {
    for (const pr of result) {
      if (wasOpened(pr, period) || wasMerged(pr, period)) {
        byId.set(pr.id, pr);
      }
    }
  }
  return [...byId.values()].sort(
    (a, b) =>
      latestEventIn(b, period).getTime() - latestEventIn(a, period).getTime(),
  );
}
