import {
  activityKinds,
  type AccountType,
  type Activity,
  type ActivityKind,
  type Member,
  type OrganizationActivity,
  type PullRequest,
  type Repository,
} from "@yagura/activity";

/** An organization the viewer can use Yagura for. */
export interface Organization {
  readonly id: string;
  readonly login: string;
  readonly avatarUrl: string;
}

// The bodies of the activity API's responses (docs/design/activity-api.md),
// read field by field: a body of any other shape reads as `undefined`.
// Ids are kept as strings, whether the API writes them as strings or as
// numbers.

/** The body of `GET /activity/organizations`. */
export function parseOrganizations(body: unknown): Organization[] | undefined {
  return isRecord(body)
    ? parseArray(body.organizations, parseOrganization)
    : undefined;
}

/** The body of `GET /activity`, or a response stored as it was received. */
export function parseOrganizationActivity(
  body: unknown,
): OrganizationActivity | undefined {
  if (!isRecord(body)) {
    return undefined;
  }
  const members = parseArray(body.members, parseMember);
  const pullRequests = parseArray(body.pullRequests, parsePullRequest);
  const activities = parseArray(body.activities, parseActivity);
  return members && pullRequests && activities
    ? { members, pullRequests, activities }
    : undefined;
}

/**
 * The activity as the API writes it, so that a response kept in the
 * browser's storage reads back with {@link parseOrganizationActivity}.
 */
export function encodeOrganizationActivity(
  activity: OrganizationActivity,
): ActivityBody {
  return {
    members: activity.members.map(({ id, login, type }) => ({
      id,
      login,
      type,
    })),
    pullRequests: activity.pullRequests.map((pr) => ({
      id: pr.id,
      repository: { ...pr.repository },
      number: pr.number,
      title: pr.title,
      state: pr.state,
      draft: pr.draft,
      additions: pr.additions,
      deletions: pr.deletions,
      authorId: pr.authorId,
      createdAt: pr.createdAt.toISOString(),
    })),
    activities: activity.activities.map((entry) => ({
      kind: entry.kind,
      pullRequestId: entry.pullRequestId,
      actorId: entry.actorId,
      occurredAt: entry.occurredAt.toISOString(),
    })),
  };
}

/** The JSON body of `GET /activity`. */
export interface ActivityBody {
  readonly [key: string]: Json;
  readonly members: Json[];
  readonly pullRequests: Json[];
  readonly activities: Json[];
}

type Json =
  | string
  | number
  | boolean
  | null
  | readonly Json[]
  | { readonly [key: string]: Json };

const accountTypes: ReadonlySet<unknown> = new Set<AccountType>([
  "User",
  "Bot",
]);
const kinds: ReadonlySet<unknown> = new Set<ActivityKind>(activityKinds);
const states: ReadonlySet<unknown> = new Set(["open", "closed"]);

function parseOrganization(value: unknown): Organization | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = parseId(value.id);
  const { login, avatarUrl } = value;
  return id !== undefined &&
    typeof login === "string" &&
    typeof avatarUrl === "string"
    ? { id, login, avatarUrl }
    : undefined;
}

function parseMember(value: unknown): Member | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = parseId(value.id);
  const { login, type } = value;
  return id !== undefined && typeof login === "string" && accountTypes.has(type)
    ? { id, login, type: type as AccountType }
    : undefined;
}

function parseRepository(value: unknown): Repository | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = parseId(value.id);
  const { ownerLogin, name } = value;
  return id !== undefined &&
    typeof ownerLogin === "string" &&
    typeof name === "string"
    ? { id, ownerLogin, name }
    : undefined;
}

function parsePullRequest(value: unknown): PullRequest | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = parseId(value.id);
  const authorId = parseId(value.authorId);
  const repository = parseRepository(value.repository);
  const createdAt = parseTime(value.createdAt);
  const { number, title, state, draft, additions, deletions } = value;
  if (
    id === undefined ||
    authorId === undefined ||
    repository === undefined ||
    createdAt === undefined ||
    typeof number !== "number" ||
    typeof title !== "string" ||
    !states.has(state) ||
    typeof draft !== "boolean" ||
    typeof additions !== "number" ||
    typeof deletions !== "number"
  ) {
    return undefined;
  }
  return {
    id,
    repository,
    number,
    title,
    state: state as PullRequest["state"],
    draft,
    additions,
    deletions,
    authorId,
    createdAt,
  };
}

function parseActivity(value: unknown): Activity | undefined {
  if (!isRecord(value) || !kinds.has(value.kind)) {
    return undefined;
  }
  const pullRequestId = parseId(value.pullRequestId);
  const actorId = parseId(value.actorId);
  const occurredAt = parseTime(value.occurredAt);
  return pullRequestId !== undefined &&
    actorId !== undefined &&
    occurredAt !== undefined
    ? {
        kind: value.kind as ActivityKind,
        pullRequestId,
        actorId,
        occurredAt,
      }
    : undefined;
}

function parseId(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : undefined;
}

function parseTime(value: unknown): Date | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const time = new Date(value);
  return Number.isNaN(time.getTime()) ? undefined : time;
}

/** Each item parsed; `undefined` when `value` is not an array or an item does not parse. */
function parseArray<T>(
  value: unknown,
  parse: (item: unknown) => T | undefined,
): T[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items: T[] = [];
  for (const item of value) {
    const parsed = parse(item);
    if (parsed === undefined) {
      return undefined;
    }
    items.push(parsed);
  }
  return items;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
