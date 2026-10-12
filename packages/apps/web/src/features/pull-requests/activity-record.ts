import type { JsonValue } from "@yagura/browser";
import type {
  FetchedDay,
  MemberActivity,
  PullRequest,
  PullRequestState,
  StoredPullRequest,
} from "@yagura/activity";
import { isRecord } from "../../shared";

// A member's activity as stored in the browser cache: times as milliseconds
// since the epoch, maps as objects.

/** The cache key of `login`'s activity. */
export function activityCacheKey(login: string): string {
  return `activity/${login}`;
}

export function encodeMemberActivity(activity: MemberActivity): JsonValue {
  const days = (fetched: ReadonlyMap<string, FetchedDay>) =>
    Object.fromEntries(
      [...fetched].map(([day, { fetchedAt, ids }]) => [
        day,
        { fetchedAt: fetchedAt.getTime(), ids },
      ]),
    );
  return {
    days: {
      opened: days(activity.days.opened),
      merged: days(activity.days.merged),
    },
    pullRequests: Object.fromEntries(
      [...activity.pullRequests].map(([id, { storedAt, pullRequest }]) => [
        id,
        { storedAt: storedAt.getTime(), pullRequest: encode(pullRequest) },
      ]),
    ),
  };
}

/**
 * The activity `value` holds, or `undefined` when it is not one (absent,
 * or stored in another shape), so that it is fetched again.
 */
export function decodeMemberActivity(
  value: unknown,
): MemberActivity | undefined {
  if (!isRecord(value) || !isRecord(value.days)) {
    return undefined;
  }
  const opened = decodeDays(value.days.opened);
  const merged = decodeDays(value.days.merged);
  const pullRequests = decodeEntries(value.pullRequests, decodeStored);
  if (
    opened === undefined ||
    merged === undefined ||
    pullRequests === undefined
  ) {
    return undefined;
  }
  return { days: { opened, merged }, pullRequests };
}

const states: ReadonlySet<unknown> = new Set<PullRequestState>([
  "open",
  "merged",
  "closed",
]);

function encode(pr: PullRequest): JsonValue {
  return {
    ...pr,
    createdAt: pr.createdAt.getTime(),
    mergedAt: pr.mergedAt === null ? null : pr.mergedAt.getTime(),
  };
}

function decodeDays(value: unknown): Map<string, FetchedDay> | undefined {
  return decodeEntries(value, (day) =>
    isRecord(day) &&
    typeof day.fetchedAt === "number" &&
    Array.isArray(day.ids) &&
    day.ids.every((id) => typeof id === "string")
      ? { fetchedAt: new Date(day.fetchedAt), ids: day.ids as string[] }
      : undefined,
  );
}

function decodeStored(value: unknown): StoredPullRequest | undefined {
  if (!isRecord(value) || typeof value.storedAt !== "number") {
    return undefined;
  }
  const pullRequest = decodePullRequest(value.pullRequest);
  return pullRequest === undefined
    ? undefined
    : { storedAt: new Date(value.storedAt), pullRequest };
}

function decodePullRequest(value: unknown): PullRequest | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { id, title, url, repository, author, state, createdAt, mergedAt } =
    value;
  const { additions, deletions } = value;
  if (
    typeof id !== "string" ||
    typeof title !== "string" ||
    typeof url !== "string" ||
    typeof repository !== "string" ||
    typeof author !== "string" ||
    !states.has(state) ||
    typeof createdAt !== "number" ||
    (mergedAt !== null && typeof mergedAt !== "number") ||
    typeof additions !== "number" ||
    typeof deletions !== "number"
  ) {
    return undefined;
  }
  return {
    id,
    title,
    url,
    repository,
    author,
    state: state as PullRequestState,
    createdAt: new Date(createdAt),
    mergedAt: mergedAt === null ? null : new Date(mergedAt),
    additions,
    deletions,
  };
}

/** An object's entries decoded by `decode`; `undefined` if any is not. */
function decodeEntries<T>(
  value: unknown,
  decode: (entry: unknown) => T | undefined,
): Map<string, T> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const entries = new Map<string, T>();
  for (const [key, entry] of Object.entries(value)) {
    const decoded = decode(entry);
    if (decoded === undefined) {
      return undefined;
    }
    entries.set(key, decoded);
  }
  return entries;
}
