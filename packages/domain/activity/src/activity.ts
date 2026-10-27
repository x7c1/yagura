// The activity of an organization's members, as the Yagura API serves it
// (docs/design/activity-api.md), with its times read as dates.

/** Whether an account is a person's or a bot's, such as Dependabot's. */
export type AccountType = "User" | "Bot";

/**
 * An account the activity names: a current member of the organization, or
 * a bot that opened one of the pull requests.
 */
export interface Member {
  readonly id: string;
  readonly login: string;
  readonly type: AccountType;
}

/** The repository a pull request belongs to. */
export interface Repository {
  readonly id: string;
  /** The login of the account that owns the repository. */
  readonly ownerLogin: string;
  readonly name: string;
}

/** Where a pull request stands now, as GitHub reports it. */
export type PullRequestState = "open" | "closed";

/** A pull request that had activity in the requested range. */
export interface PullRequest {
  readonly id: string;
  readonly repository: Repository;
  readonly number: number;
  readonly title: string;
  readonly state: PullRequestState;
  readonly draft: boolean;
  readonly additions: number;
  readonly deletions: number;
  /** The id of the account that opened it. */
  readonly authorId: string;
  readonly createdAt: Date;
}

/** What happened to a pull request. */
export type ActivityKind =
  | "opened"
  | "pushed"
  | "ready_for_review"
  | "converted_to_draft"
  | "merged"
  | "closed";

export const activityKinds: readonly ActivityKind[] = [
  "opened",
  "pushed",
  "ready_for_review",
  "converted_to_draft",
  "merged",
  "closed",
];

/** One thing that happened to a pull request, and who did it when. */
export interface Activity {
  readonly kind: ActivityKind;
  readonly pullRequestId: string;
  /** The account that did it; not necessarily one of the members. */
  readonly actorId: string;
  readonly occurredAt: Date;
}

/** The activity of an organization's members over a range of time. */
export interface OrganizationActivity {
  /**
   * The organization's current members, in login order, then the bots that
   * opened one of the pull requests.
   */
  readonly members: readonly Member[];
  /** In the order of their first activity in the range. */
  readonly pullRequests: readonly PullRequest[];
  /** In time order. */
  readonly activities: readonly Activity[];
}

/** The pull request's page on GitHub. */
export function pullRequestUrl(pr: PullRequest): string {
  const { ownerLogin, name } = pr.repository;
  return `https://github.com/${ownerLogin}/${name}/pull/${pr.number}`;
}
