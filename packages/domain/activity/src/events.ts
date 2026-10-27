import type {
  Activity,
  Member,
  OrganizationActivity,
  PullRequest,
} from "./activity";
import { isWithin, type Period } from "./period";

/**
 * What the view counts: a pull request opened, a push to one by a member,
 * or a pull request merged.
 */
export type EventKind = "opened" | "pushed" | "merged";

/** One counted event, with the pull request it happened to. */
export interface CountedEvent {
  readonly kind: EventKind;
  readonly pullRequest: PullRequest;
  /** The account that did it. */
  readonly actorId: string;
  readonly at: Date;
}

/**
 * The events the view counts in the period, in time order:
 *
 * - every pull request opened, and every one merged, whoever opened it, a
 *   bot's included, so that the merges add up to what landed;
 * - every push by a member who is a person. A bot's pushes, such as
 *   Dependabot rebasing its own branch, and pushes by anyone outside the
 *   organization are not counted: they are not the members' work.
 *
 * Activities of a pull request the response does not carry are left out.
 */
export function countedEvents(
  activity: OrganizationActivity,
  period: Period,
): CountedEvent[] {
  const pullRequests = new Map(activity.pullRequests.map((pr) => [pr.id, pr]));
  const people = new Set(
    activity.members.filter(isPerson).map((member) => member.id),
  );
  const events: CountedEvent[] = [];
  for (const entry of activity.activities) {
    const kind = countedKind(entry, people);
    const pullRequest = pullRequests.get(entry.pullRequestId);
    if (
      kind !== undefined &&
      pullRequest !== undefined &&
      isWithin(entry.occurredAt, period)
    ) {
      events.push({
        kind,
        pullRequest,
        actorId: entry.actorId,
        at: entry.occurredAt,
      });
    }
  }
  return events.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Whether the account is a person's rather than a bot's. */
export function isPerson(member: Member): boolean {
  return member.type === "User";
}

function countedKind(
  entry: Activity,
  people: ReadonlySet<string>,
): CountedEvent["kind"] | undefined {
  switch (entry.kind) {
    case "opened":
    case "merged":
      return entry.kind;
    case "pushed":
      return people.has(entry.actorId) ? "pushed" : undefined;
    default:
      return undefined;
  }
}
