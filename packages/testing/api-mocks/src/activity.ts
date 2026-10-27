const hour = 60 * 60 * 1000;

/** The kinds of activity the activity API reports. */
export type MockActivityKind =
  | "opened"
  | "pushed"
  | "ready_for_review"
  | "converted_to_draft"
  | "merged"
  | "closed";

/** An account, as `GET /activity` writes it. */
export interface MockMember {
  readonly id: string;
  readonly login: string;
  readonly type: "User" | "Bot";
}

/** A pull request, as `GET /activity` writes it. */
export interface MockPullRequest {
  readonly id: string;
  readonly repository: {
    readonly id: string;
    readonly ownerLogin: string;
    readonly name: string;
  };
  readonly number: number;
  readonly title: string;
  readonly state: "open" | "closed";
  readonly draft: boolean;
  readonly additions: number;
  readonly deletions: number;
  readonly authorId: string;
  readonly createdAt: string;
}

/** An activity, as `GET /activity` writes it. */
export interface MockActivity {
  readonly kind: MockActivityKind;
  readonly pullRequestId: string;
  readonly actorId: string;
  readonly occurredAt: string;
}

/** Everything the mock knows of, before it is narrowed to a range. */
export interface MockActivityFixtures {
  /** The organization's members, in login order. */
  readonly members: readonly MockMember[];
  /** The bots that open pull requests. */
  readonly bots: readonly MockMember[];
  readonly pullRequests: readonly MockPullRequest[];
  /** In time order. */
  readonly activities: readonly MockActivity[];
}

/** The GitHub login the mock session API answers with. */
export const mockLogin = "mock-user";

/** The bot that opens the mock's dependency updates. */
export const mockBotLogin = "dependabot[bot]";

/** The members of each mock organization, in login order. */
export const mockMembers: readonly MockMember[] = [
  { id: "1001", login: "mock-alice", type: "User" },
  { id: "1002", login: "mock-bob", type: "User" },
  { id: "1003", login: "mock-carol", type: "User" },
  { id: "1004", login: mockLogin, type: "User" },
];

const bot: MockMember = { id: "49699333", login: mockBotLogin, type: "Bot" };

/** Someone outside the organization who pushes to a member's pull request. */
const guest: MockMember = { id: "1099", login: "mock-guest", type: "User" };

/** The logins of {@link mockMembers}. */
export const mockMemberLogins: readonly string[] = mockMembers.map(
  ({ login }) => login,
);

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

type Event = readonly [MockActivityKind, string, When];

interface Fixture {
  readonly title: string;
  /** `owner/name`. */
  readonly repository: string;
  readonly author: string;
  readonly created: When;
  /** What happened after it was opened, in time order. */
  readonly events: readonly Event[];
  readonly lines: readonly [number, number];
  /** Whether it is a draft now; it is open unless merged or closed. */
  readonly draft?: boolean;
}

/**
 * The mock members' pull requests: drafts, pushes, merges by members of
 * one another's pull requests, a closed one, pushes by a bot and by someone
 * outside the organization, and the bot's own pull requests, one merged
 * and one open. Every time inside the period is at most 12 local days back
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
    created: on(3, "10:15"),
    events: [
      ["pushed", "mock-alice", on(3, "11:40")],
      ["pushed", "mock-alice", on(2, "15:20")],
      ["pushed", "mock-alice", on(1, "10:05")],
      ["pushed", "mock-alice", ago(1 * hour)],
    ],
    lines: [240, 12],
    draft: true,
  },
  {
    title: "Fix the sign-out redirect",
    repository: "mock-org/web",
    author: "mock-alice",
    created: on(1, "16:40"),
    events: [
      ["pushed", "mock-alice", on(1, "17:10")],
      ["merged", "mock-bob", ago(6 * hour)],
    ],
    lines: [18, 4],
  },
  {
    title: "Show the push counts",
    repository: "mock-org/web",
    author: mockLogin,
    created: on(1, "09:00"),
    events: [
      ["converted_to_draft", mockLogin, on(1, "09:05")],
      ["pushed", mockLogin, on(1, "09:40")],
      ["pushed", mockLogin, ago(3 * hour)],
    ],
    lines: [150, 20],
    draft: true,
  },
  {
    title: "Document the API mock",
    repository: "mock-org/web",
    author: "mock-carol",
    created: on(2, "14:10"),
    events: [
      ["pushed", "mock-carol", on(2, "15:00")],
      ["merged", mockLogin, on(1, "11:30")],
    ],
    lines: [46, 30],
  },
  {
    title: "Bump eslint from 10.12.0 to 10.13.0",
    repository: "mock-org/api",
    author: mockBotLogin,
    created: on(2, "05:10"),
    events: [],
    lines: [12, 12],
  },
  {
    title: "Paginate the members endpoint",
    repository: "mock-org/api",
    author: "mock-bob",
    created: on(20, "11:00"),
    events: [
      ["pushed", "mock-bob", on(4, "09:30")],
      ["merged", "mock-carol", on(3, "10:20")],
    ],
    lines: [96, 31],
  },
  {
    title: "Handle a revoked token",
    repository: "mock-org/web",
    author: mockLogin,
    created: on(6, "14:00"),
    events: [
      ["pushed", mockLogin, on(6, "14:30")],
      ["merged", "mock-carol", on(3, "11:15")],
    ],
    lines: [28, 5],
  },
  {
    title: "Retry a search that timed out",
    repository: "mock-org/api",
    author: "mock-alice",
    created: on(7, "10:00"),
    events: [
      ["pushed", "mock-alice", on(6, "11:20")],
      ["pushed", "mock-alice", on(4, "14:40")],
      ["merged", "mock-bob", on(4, "15:30")],
    ],
    lines: [33, 8],
  },
  {
    title: "Tidy the shell aliases",
    repository: "mock-alice/dotfiles",
    author: "mock-alice",
    created: on(5, "22:15"),
    events: [["merged", "mock-alice", on(4, "07:40")]],
    lines: [7, 9],
  },
  {
    title: "Bump vite from 8.3.4 to 8.3.5",
    repository: "mock-org/web",
    author: mockBotLogin,
    created: on(6, "05:00"),
    events: [
      // The bot rebasing its own branch: not counted as a push.
      ["pushed", mockBotLogin, on(5, "05:00")],
      ["merged", mockLogin, on(5, "13:15")],
    ],
    lines: [3, 3],
  },
  {
    title: "Rename the session hook",
    repository: "mock-org/api",
    author: "mock-carol",
    created: on(8, "09:15"),
    events: [["merged", "mock-bob", on(6, "16:20")]],
    lines: [22, 18],
  },
  {
    title: "Try another GraphQL client",
    repository: "mock-org/api",
    author: "mock-bob",
    created: on(9, "14:35"),
    events: [
      ["pushed", "mock-bob", on(9, "16:00")],
      ["pushed", "mock-bob", on(8, "11:10")],
      ["closed", "mock-bob", on(7, "13:00")],
    ],
    lines: [410, 120],
  },
  {
    title: "Count the lines once per pull request",
    repository: "mock-org/api",
    author: "mock-bob",
    created: on(8, "09:20"),
    events: [
      ["pushed", "mock-bob", on(8, "10:00")],
      ["merged", "mock-bob", on(8, "10:50")],
    ],
    lines: [19, 7],
  },
  {
    title: "Add a dark theme",
    repository: "mock-org/web",
    author: "mock-alice",
    created: on(10, "21:10"),
    events: [
      ["pushed", "mock-alice", on(9, "11:00")],
      ["pushed", "mock-alice", on(9, "14:15")],
      ["merged", "mock-carol", on(8, "14:30")],
    ],
    lines: [205, 66],
  },
  {
    title: "Bump msw from 2.14.0 to 2.15.0",
    repository: "mock-org/web",
    author: mockBotLogin,
    created: on(9, "05:00"),
    events: [["merged", "mock-alice", on(8, "09:50")]],
    lines: [4, 4],
  },
  {
    title: "Name the chart for screen readers",
    repository: "mock-org/web",
    author: "mock-carol",
    created: on(9, "07:15"),
    events: [["merged", mockLogin, on(9, "10:25")]],
    lines: [14, 2],
  },
  {
    title: "Cache the installations",
    repository: "mock-org/web",
    author: "mock-carol",
    created: on(11, "10:45"),
    events: [
      ["pushed", "mock-carol", on(10, "14:00")],
      ["ready_for_review", "mock-carol", on(10, "14:30")],
      ["pushed", guest.login, on(10, "16:00")],
    ],
    lines: [64, 2],
  },
  {
    title: "Write the session API's design",
    repository: "mock-org/api",
    author: mockLogin,
    created: on(10, "08:30"),
    events: [["merged", "mock-carol", on(10, "10:15")]],
    lines: [140, 0],
  },
  {
    title: "Pin the Node version",
    repository: "mock-org/api",
    author: "mock-bob",
    created: on(11, "20:30"),
    events: [["merged", "mock-bob", on(10, "14:50")]],
    lines: [2, 2],
  },
  {
    title: "Measure the chart's labels",
    repository: "mock-org/web",
    author: mockLogin,
    created: on(12, "13:10"),
    events: [
      ["pushed", mockLogin, on(12, "15:00")],
      ["merged", "mock-alice", on(11, "10:35")],
    ],
    lines: [52, 18],
  },
  {
    title: "Tighten the content security policy",
    repository: "mock-org/web",
    author: "mock-bob",
    created: on(12, "10:05"),
    events: [
      ["pushed", "mock-bob", on(12, "11:30")],
      ["merged", "mock-alice", on(12, "17:50")],
    ],
    lines: [9, 4],
  },
  {
    title: "Split the session module",
    repository: "mock-org/api",
    author: "mock-bob",
    created: on(25, "15:10"),
    events: [["merged", "mock-bob", on(18, "11:45")]],
    lines: [150, 140],
  },
];

const accounts = new Map(
  [...mockMembers, bot, guest].map((account) => [account.login, account]),
);

function accountId(login: string): string {
  const account = accounts.get(login);
  if (account === undefined) {
    throw new Error(`The API mock has no account ${login}`);
  }
  return account.id;
}

/** Every fixture pull request and its activity, with times relative to `now`. */
export function mockActivityFixtures(now: Date): MockActivityFixtures {
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
  const pullRequests: MockPullRequest[] = [];
  const activities: MockActivity[] = [];
  fixtures.forEach((fixture, index) => {
    const number = index + 1;
    const id = `PR_mock_${number}`;
    const [ownerLogin = "", name = ""] = fixture.repository.split("/");
    const ends = fixture.events.some(
      ([kind]) => kind === "merged" || kind === "closed",
    );
    pullRequests.push({
      id,
      repository: { id: `R_${fixture.repository}`, ownerLogin, name },
      number,
      title: fixture.title,
      state: ends ? "closed" : "open",
      draft: fixture.draft === true,
      additions: fixture.lines[0],
      deletions: fixture.lines[1],
      authorId: accountId(fixture.author),
      createdAt: at(fixture.created),
    });
    const events: Event[] = [
      ["opened", fixture.author, fixture.created],
      ...fixture.events,
    ];
    for (const [kind, actor, when] of events) {
      activities.push({
        kind,
        pullRequestId: id,
        actorId: accountId(actor),
        occurredAt: at(when),
      });
    }
  });
  activities.sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt),
  );
  return { members: mockMembers, bots: [bot], pullRequests, activities };
}

/**
 * The body of `GET /activity` for `[from, to)`: the activities in it, the
 * pull requests they belong to in the order of their first activity in
 * it, and the members followed by the bots that opened one of those pull
 * requests.
 */
export function mockActivityResponse(
  fixtures: MockActivityFixtures,
  from: Date,
  to: Date,
): {
  readonly members: readonly MockMember[];
  readonly pullRequests: readonly MockPullRequest[];
  readonly activities: readonly MockActivity[];
} {
  const activities = fixtures.activities.filter(({ occurredAt }) => {
    const time = Date.parse(occurredAt);
    return from.getTime() <= time && time < to.getTime();
  });
  const order = [...new Set(activities.map((a) => a.pullRequestId))];
  const pullRequests = order.flatMap((id) =>
    fixtures.pullRequests.filter((pr) => pr.id === id),
  );
  const bots = fixtures.bots.filter(({ id }) =>
    pullRequests.some(({ authorId }) => authorId === id),
  );
  return {
    members: [...fixtures.members, ...bots],
    pullRequests,
    activities,
  };
}
