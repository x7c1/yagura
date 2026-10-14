const hour = 60 * 60 * 1000;

/** A pull request the mock serves, as GitHub's GraphQL API returns it. */
export interface MockPullRequestNode {
  readonly __typename: "PullRequest";
  readonly id: string;
  readonly title: string;
  readonly url: string;
  readonly repository: { readonly nameWithOwner: string };
  readonly author: { readonly login: string };
  readonly state: "OPEN" | "MERGED" | "CLOSED";
  readonly createdAt: string;
  readonly mergedAt: string | null;
  readonly additions: number;
  readonly deletions: number;
}

/**
 * When a fixture's event happened: a span before the mock's creation, for
 * the events of the last hours, or a local time of day on a day some days
 * before it, so that the hours of the other days do not move with the time
 * the mock is created at.
 */
type When =
  | { readonly ago: number }
  | {
      readonly daysBack: number;
      readonly hour: number;
      readonly minute: number;
    };

/** `span` before the mock's creation. */
function ago(span: number): When {
  return { ago: span };
}

/** The local time `time` ("HH:MM") on the day `daysBack` days before now. */
function on(daysBack: number, time: string): When {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return { daysBack, hour, minute };
}

interface Fixture {
  readonly title: string;
  readonly repository: string;
  readonly author: string;
  readonly state: "OPEN" | "MERGED" | "CLOSED";
  readonly created: When;
  /** When it was merged, if it was. */
  readonly merged?: When;
  readonly additions: number;
  readonly deletions: number;
}

/** A fixture opened at `created` and merged at `mergedAt`. */
function merged(
  title: string,
  repository: string,
  author: string,
  created: When,
  mergedAt: When,
  [additions, deletions]: readonly [number, number],
): Fixture {
  return {
    title,
    repository,
    author,
    state: "MERGED",
    created,
    merged: mergedAt,
    additions,
    deletions,
  };
}

/**
 * The mock members' pull requests over the last 14 days, and a few from
 * before them. Every time inside the period is at most 12 local days back
 * and every time before it at least 18, so that each falls on the same side
 * of the period's start (local midnight 13 days back) wherever the mock
 * runs; the events of the last hours are a span back from now, so that they
 * are never in the future. The times are spread over the day, from early
 * morning to late at night, with the late morning and the early afternoon
 * busier than the rest, so that the chart's hours have something to show.
 */
const fixtures: readonly Fixture[] = [
  {
    title: "Draw the activity chart",
    repository: "mock-org/web",
    author: "mock-alice",
    state: "OPEN",
    created: ago(2 * hour),
    additions: 240,
    deletions: 12,
  },
  merged(
    "Fix the sign-out redirect",
    "mock-org/web",
    "mock-alice",
    on(1, "16:40"),
    ago(6 * hour),
    [18, 4],
  ),
  merged(
    "Tidy the shell aliases",
    "mock-alice/dotfiles",
    "mock-alice",
    on(5, "22:15"),
    on(4, "07:40"),
    [7, 9],
  ),
  merged(
    "Paginate the members endpoint",
    "mock-org/api",
    "mock-bob",
    on(20, "11:00"),
    on(3, "10:20"),
    [96, 31],
  ),
  {
    title: "Try another GraphQL client",
    repository: "mock-org/api",
    author: "mock-bob",
    state: "CLOSED",
    created: on(9, "14:35"),
    additions: 410,
    deletions: 120,
  },
  merged(
    "Split the session module",
    "mock-org/api",
    "mock-bob",
    on(25, "15:10"),
    on(18, "11:45"),
    [150, 140],
  ),
  {
    title: "Cache the installations",
    repository: "mock-org/web",
    author: "mock-carol",
    state: "OPEN",
    created: on(11, "10:45"),
    additions: 64,
    deletions: 2,
  },
  merged(
    "Document the API mock",
    "mock-org/web",
    "mock-carol",
    on(2, "14:10"),
    on(1, "11:25"),
    [35, 6],
  ),
  merged(
    "Bump the dependencies",
    "mock-org/api",
    "mock-user",
    // Two days back, so that it is opened before its merge 8 hours ago
    // whatever the time of day the mock is created at.
    on(2, "20:50"),
    ago(8 * hour),
    [220, 214],
  ),
  {
    title: "Rename the session hook",
    repository: "mock-org/web",
    author: "mock-user",
    state: "CLOSED",
    created: on(7, "18:05"),
    additions: 22,
    deletions: 22,
  },
  merged(
    "Retry a search that timed out",
    "mock-org/web",
    "mock-alice",
    on(1, "10:10"),
    on(1, "14:30"),
    [41, 8],
  ),
  merged(
    "Explain the cache in the README",
    "mock-org/web",
    "mock-bob",
    on(2, "19:45"),
    on(2, "21:30"),
    [58, 3],
  ),
  merged(
    "Move the mock to its own package",
    "mock-org/web",
    "mock-carol",
    on(3, "10:30"),
    on(2, "16:20"),
    [312, 290],
  ),
  merged(
    "Handle a revoked token",
    "mock-org/api",
    "mock-bob",
    on(4, "23:05"),
    on(3, "14:15"),
    [77, 12],
  ),
  merged(
    "Sort the members by login",
    "mock-org/api",
    "mock-user",
    on(4, "11:30"),
    on(4, "14:40"),
    [12, 5],
  ),
  merged(
    "Batch the lookups",
    "mock-org/api",
    "mock-user",
    on(5, "14:20"),
    on(5, "21:40"),
    [130, 44],
  ),
  merged(
    "Log the rate limit",
    "mock-org/api",
    "mock-bob",
    on(6, "10:40"),
    on(5, "14:05"),
    [26, 0],
  ),
  merged(
    "Show the hours of activity",
    "mock-org/web",
    "mock-alice",
    on(6, "10:12"),
    on(6, "14:48"),
    [188, 21],
  ),
  merged(
    "Trim the lockfile",
    "mock-org/web",
    "mock-carol",
    on(6, "10:55"),
    on(6, "14:20"),
    [3, 610],
  ),
  merged(
    "Fix the narrow layout",
    "mock-org/web",
    "mock-carol",
    on(8, "15:45"),
    on(7, "10:05"),
    [46, 30],
  ),
  merged(
    "Count the lines once per pull request",
    "mock-org/api",
    "mock-bob",
    on(8, "09:20"),
    on(8, "10:50"),
    [19, 7],
  ),
  merged(
    "Add a dark theme",
    "mock-org/web",
    "mock-alice",
    on(10, "21:10"),
    on(8, "14:30"),
    [205, 66],
  ),
  merged(
    "Name the chart for screen readers",
    "mock-org/web",
    "mock-carol",
    on(9, "07:15"),
    on(9, "10:25"),
    [14, 2],
  ),
  merged(
    "Measure the chart's labels",
    "mock-org/web",
    "mock-user",
    on(12, "13:10"),
    on(11, "10:35"),
    [52, 18],
  ),
  merged(
    "Pin the Node version",
    "mock-org/api",
    "mock-bob",
    on(11, "20:30"),
    on(10, "14:50"),
    [2, 2],
  ),
  merged(
    "Tighten the content security policy",
    "mock-org/web",
    "mock-bob",
    on(12, "10:05"),
    on(12, "17:50"),
    [9, 4],
  ),
  merged(
    "Write the session API's design",
    "mock-org/api",
    "mock-user",
    on(10, "08:30"),
    on(10, "10:15"),
    [140, 0],
  ),
];

/**
 * The titles of the pull requests opened or merged in the last 14 days,
 * newest first by their latest event in the period, as the activity view
 * lists them (at 15:30, as the tests run them).
 */
export const mockPullRequestTitles: readonly string[] = [
  "Draw the activity chart",
  "Fix the sign-out redirect",
  "Bump the dependencies",
  "Retry a search that timed out",
  "Document the API mock",
  "Explain the cache in the README",
  "Move the mock to its own package",
  "Handle a revoked token",
  "Paginate the members endpoint",
  "Sort the members by login",
  "Tidy the shell aliases",
  "Batch the lookups",
  "Log the rate limit",
  "Show the hours of activity",
  "Trim the lockfile",
  "Rename the session hook",
  "Fix the narrow layout",
  "Add a dark theme",
  "Count the lines once per pull request",
  "Try another GraphQL client",
  "Name the chart for screen readers",
  "Pin the Node version",
  "Write the session API's design",
  "Cache the installations",
  "Measure the chart's labels",
  "Tighten the content security policy",
];

/** The fixture pull requests, with times relative to `now`. */
export function mockPullRequests(now: Date): MockPullRequestNode[] {
  const at = (when: When) =>
    ("ago" in when
      ? new Date(now.getTime() - when.ago)
      : new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - when.daysBack,
          when.hour,
          when.minute,
        )
    ).toISOString();
  return fixtures.map((fixture, index) => {
    const number = index + 1;
    return {
      __typename: "PullRequest",
      id: `PR_mock_${number}`,
      title: fixture.title,
      url: `https://github.com/${fixture.repository}/pull/${number}`,
      repository: { nameWithOwner: fixture.repository },
      author: { login: fixture.author },
      state: fixture.state,
      createdAt: at(fixture.created),
      mergedAt: fixture.merged === undefined ? null : at(fixture.merged),
      additions: fixture.additions,
      deletions: fixture.deletions,
    };
  });
}

/**
 * The pull requests matching a search query, as far as the mock understands
 * one: the `author:`, `is:merged`, `created:` and `merged:` qualifiers, the
 * last two with a `>=<timestamp>` or `<timestamp>..<timestamp>` range.
 * Other terms, such as `is:pr`, are ignored.
 */
export function searchMockPullRequests(
  pullRequests: readonly MockPullRequestNode[],
  query: string,
): MockPullRequestNode[] {
  let result = [...pullRequests];
  for (const term of query.split(/\s+/)) {
    const [qualifier, value = ""] = splitQualifier(term);
    switch (qualifier) {
      case "author":
        result = result.filter(
          (pr) => pr.author.login.toLowerCase() === value.toLowerCase(),
        );
        break;
      case "is":
        if (value === "merged") {
          result = result.filter((pr) => pr.mergedAt !== null);
        }
        break;
      case "created":
        result = result.filter((pr) => isInRange(pr.createdAt, value));
        break;
      case "merged":
        result = result.filter(
          (pr) => pr.mergedAt !== null && isInRange(pr.mergedAt, value),
        );
        break;
    }
  }
  return result;
}

function splitQualifier(term: string): [string, string?] {
  const colon = term.indexOf(":");
  return colon < 0 ? [term] : [term.slice(0, colon), term.slice(colon + 1)];
}

/**
 * Whether `time` satisfies a `>=<timestamp>` range or an inclusive
 * `<timestamp>..<timestamp>` one.
 */
function isInRange(time: string, range: string): boolean {
  const t = Date.parse(time);
  if (range.startsWith(">=")) {
    return t >= Date.parse(range.slice(2));
  }
  const [from, to, ...rest] = range.split("..");
  if (from === undefined || to === undefined || rest.length > 0) {
    throw new Error(
      `The API mock supports only >= and .. ranges, not ${range}`,
    );
  }
  return Date.parse(from) <= t && t <= Date.parse(to);
}
