const hour = 60 * 60 * 1000;
const day = 24 * hour;

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

interface Fixture {
  readonly title: string;
  readonly repository: string;
  readonly author: string;
  readonly state: "OPEN" | "MERGED" | "CLOSED";
  /** How long before the mock's creation the pull request was created. */
  readonly createdAgo: number;
  /** How long before the mock's creation it was merged, if it was. */
  readonly mergedAgo?: number;
  readonly additions: number;
  readonly deletions: number;
}

/**
 * The mock members' pull requests over the last 14 days, and a few from
 * before them. Every time inside the period is at most 12 days back and
 * every time before it at least 18 days back, so that each falls on the
 * same side of the period's start (local midnight 13 days back) in any time
 * zone.
 */
const fixtures: readonly Fixture[] = [
  {
    title: "Draw the activity chart",
    repository: "mock-org/web",
    author: "mock-alice",
    state: "OPEN",
    createdAgo: 2 * hour,
    additions: 240,
    deletions: 12,
  },
  {
    title: "Fix the sign-out redirect",
    repository: "mock-org/web",
    author: "mock-alice",
    state: "MERGED",
    createdAgo: 30 * hour,
    mergedAgo: 6 * hour,
    additions: 18,
    deletions: 4,
  },
  {
    title: "Tidy the shell aliases",
    repository: "mock-alice/dotfiles",
    author: "mock-alice",
    state: "MERGED",
    createdAgo: 5 * day,
    mergedAgo: 4 * day,
    additions: 7,
    deletions: 9,
  },
  {
    title: "Paginate the members endpoint",
    repository: "mock-org/api",
    author: "mock-bob",
    state: "MERGED",
    createdAgo: 20 * day,
    mergedAgo: 3 * day,
    additions: 96,
    deletions: 31,
  },
  {
    title: "Try another GraphQL client",
    repository: "mock-org/api",
    author: "mock-bob",
    state: "CLOSED",
    createdAgo: 9 * day,
    additions: 410,
    deletions: 120,
  },
  {
    title: "Split the session module",
    repository: "mock-org/api",
    author: "mock-bob",
    state: "MERGED",
    createdAgo: 25 * day,
    mergedAgo: 18 * day,
    additions: 150,
    deletions: 140,
  },
  {
    title: "Cache the installations",
    repository: "mock-org/web",
    author: "mock-carol",
    state: "OPEN",
    createdAgo: 11 * day,
    additions: 64,
    deletions: 2,
  },
  {
    title: "Document the API mock",
    repository: "mock-org/web",
    author: "mock-carol",
    state: "MERGED",
    createdAgo: 2 * day,
    mergedAgo: 1 * day,
    additions: 35,
    deletions: 6,
  },
  {
    title: "Bump the dependencies",
    repository: "mock-org/api",
    author: "mock-user",
    state: "MERGED",
    createdAgo: 12 * hour,
    mergedAgo: 10 * hour,
    additions: 220,
    deletions: 214,
  },
  {
    title: "Rename the session hook",
    repository: "mock-org/web",
    author: "mock-user",
    state: "CLOSED",
    createdAgo: 7 * day,
    additions: 22,
    deletions: 22,
  },
];

/**
 * The titles of the pull requests opened or merged in the last 14 days,
 * newest first by their latest event in the period, as the activity view
 * lists them.
 */
export const mockPullRequestTitles: readonly string[] = [
  "Draw the activity chart",
  "Fix the sign-out redirect",
  "Bump the dependencies",
  "Document the API mock",
  "Paginate the members endpoint",
  "Tidy the shell aliases",
  "Rename the session hook",
  "Try another GraphQL client",
  "Cache the installations",
];

/** The fixture pull requests, with times relative to `now`. */
export function mockPullRequests(now: Date): MockPullRequestNode[] {
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();
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
      createdAt: ago(fixture.createdAgo),
      mergedAt: fixture.mergedAgo === undefined ? null : ago(fixture.mergedAgo),
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
