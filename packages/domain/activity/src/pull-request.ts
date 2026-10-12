/** Where a pull request stands now. */
export type PullRequestState = "open" | "merged" | "closed";

/** A pull request, as far as the activity view needs it. */
export interface PullRequest {
  /** GitHub's node id; the same pull request has the same id in any search. */
  readonly id: string;
  readonly title: string;
  /** The pull request's page on GitHub. */
  readonly url: string;
  /** `owner/name`. */
  readonly repository: string;
  /** The author's login; `ghost` for a deleted account, as on GitHub. */
  readonly author: string;
  readonly state: PullRequestState;
  readonly createdAt: Date;
  /** `null` unless merged. */
  readonly mergedAt: Date | null;
  readonly additions: number;
  readonly deletions: number;
}
