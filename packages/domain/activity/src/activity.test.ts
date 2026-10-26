import { describe, expect, it } from "vitest";
import {
  pullRequestUrl,
  type Activity,
  type ActivityKind,
  type Member,
  type OrganizationActivity,
  type PullRequest,
} from "./activity";
import { countByDay, countByHour } from "./daily";
import { countedEvents } from "./events";
import { listPullRequests } from "./list";
import { narrowList, type Narrowing } from "./narrowing";
import { periodEndingAt } from "./period";
import { summarizeByMember } from "./summary";

// The test script runs in America/New_York (UTC−4 in October).

const now = new Date("2026-10-12T18:00:00-04:00");
const period = periodEndingAt(now);

const alice: Member = { id: "u1", login: "alice", type: "User" };
const bob: Member = { id: "u2", login: "bob", type: "User" };
const carol: Member = { id: "u3", login: "carol", type: "User" };
const dependabot: Member = { id: "b1", login: "dependabot[bot]", type: "Bot" };
/** Someone outside the organization, named only as an actor. */
const outsiderId = "u9";

function pullRequest(
  id: string,
  author: Member,
  overrides: Partial<PullRequest> = {},
): PullRequest {
  return {
    id,
    repository: { id: "r1", ownerLogin: "acme", name: "web" },
    number: Number(id.replace(/\D/g, "")),
    title: `Pull request ${id}`,
    state: "open",
    draft: false,
    additions: 10,
    deletions: 2,
    authorId: author.id,
    createdAt: new Date("2026-10-01T09:00:00-04:00"),
    ...overrides,
  };
}

function at(
  kind: ActivityKind,
  pullRequestId: string,
  actor: Member | string,
  time: string,
): Activity {
  return {
    kind,
    pullRequestId,
    actorId: typeof actor === "string" ? actor : actor.id,
    occurredAt: new Date(`${time}-04:00`),
  };
}

/**
 * Alice opens pr1 before the period and pushes to it twice, then Bob merges
 * it; Bob opens a draft, pr2, and pushes to it, as does someone outside the
 * organization; Dependabot opens pr3, rebases it, and Alice merges it; a
 * closed pull request of Carol's, pr4, only gets closed in the period.
 */
const activity: OrganizationActivity = {
  members: [alice, bob, carol, dependabot],
  pullRequests: [
    pullRequest("pr1", alice, {
      state: "closed",
      createdAt: new Date("2026-09-20T09:00:00-04:00"),
      additions: 100,
      deletions: 20,
    }),
    pullRequest("pr2", bob, { draft: true, additions: 5, deletions: 1 }),
    pullRequest("pr3", dependabot, { state: "closed", additions: 3 }),
    pullRequest("pr4", carol, { state: "closed" }),
  ],
  activities: [
    at("opened", "pr1", alice, "2026-09-20T09:00:00"),
    at("pushed", "pr1", alice, "2026-10-05T14:10:00"),
    at("opened", "pr2", bob, "2026-10-05T14:30:00"),
    at("opened", "pr3", dependabot, "2026-10-06T03:00:00"),
    at("pushed", "pr3", dependabot, "2026-10-07T03:00:00"),
    at("pushed", "pr2", outsiderId, "2026-10-07T11:00:00"),
    at("converted_to_draft", "pr2", bob, "2026-10-07T12:00:00"),
    at("pushed", "pr1", alice, "2026-10-07T14:05:00"),
    at("merged", "pr3", alice, "2026-10-07T14:20:00"),
    at("pushed", "pr2", bob, "2026-10-08T09:00:00"),
    at("merged", "pr1", bob, "2026-10-08T16:00:00"),
    at("closed", "pr4", carol, "2026-10-09T10:00:00"),
  ],
};

const events = countedEvents(activity, period);
const listed = listPullRequests(activity, events);

describe("countByDay", () => {
  it("counts every merge, a bot's pull request's included", () => {
    const days = countByDay(events, period);

    expect(days).toHaveLength(14);
    expect(days.find(({ day }) => day === "2026-10-07")?.merged).toBe(1);
    expect(days.find(({ day }) => day === "2026-10-08")?.merged).toBe(1);
    expect(days.reduce((sum, { merged }) => sum + merged, 0)).toBe(2);
  });

  it("counts the members' pushes only, not a bot's or an outsider's", () => {
    const pushed = Object.fromEntries(
      countByDay(events, period).map(({ day, pushed }) => [day, pushed]),
    );

    expect(pushed["2026-10-05"]).toBe(1);
    // Alice's push; Dependabot's rebase and the outsider's push are left out.
    expect(pushed["2026-10-07"]).toBe(1);
    expect(pushed["2026-10-08"]).toBe(1);
    expect(Object.values(pushed).reduce((a, b) => a + b, 0)).toBe(3);
  });

  it("leaves out what happened before the period", () => {
    const early = countByDay(
      countedEvents(
        {
          ...activity,
          activities: [at("merged", "pr1", bob, "2026-09-28T23:00:00")],
        },
        period,
      ),
      period,
    );

    expect(early.every(({ merged }) => merged === 0)).toBe(true);
  });
});

describe("countByHour", () => {
  it("places pushes and merges in their local hours, adding up to the day's counts", () => {
    const day = countByHour(events, period).find(
      ({ day }) => day === "2026-10-07",
    );

    expect(day?.pushed[14]).toBe(1);
    expect(day?.merged[14]).toBe(1);
    expect(day?.pushed[3]).toBe(0);
    for (const hours of countByHour(events, period)) {
      const counts = countByDay(events, period).find(
        ({ day }) => day === hours.day,
      );
      expect(hours.merged.reduce((a, b) => a + b, 0)).toBe(counts?.merged);
      expect(hours.pushed.reduce((a, b) => a + b, 0)).toBe(counts?.pushed);
    }
  });
});

describe("listPullRequests", () => {
  it("holds those opened, merged or pushed to by a member in the period, newest first", () => {
    // pr4 was only closed in the period, so it is not listed.
    expect(listed.map(({ pullRequest }) => pullRequest.id)).toEqual([
      "pr1",
      "pr2",
      "pr3",
    ]);
  });

  it("dates each by its latest counted event, with its kind", () => {
    const latest = Object.fromEntries(
      listed.map(({ pullRequest, latest }) => [pullRequest.id, latest]),
    );

    expect(latest.pr1).toEqual({
      kind: "merged",
      at: new Date("2026-10-08T16:00:00-04:00"),
    });
    expect(latest.pr2).toEqual({
      kind: "pushed",
      at: new Date("2026-10-08T09:00:00-04:00"),
    });
    // Dependabot's rebase is later, but not counted.
    expect(latest.pr3).toEqual({
      kind: "merged",
      at: new Date("2026-10-07T14:20:00-04:00"),
    });
  });

  it("counts the members' pushes to each", () => {
    expect(listed.map(({ pushes }) => pushes)).toEqual([2, 1, 0]);
  });

  it("shows a merged pull request as merged, and an open draft as a draft", () => {
    expect(listed.map(({ state }) => state)).toEqual([
      "merged",
      "draft",
      "merged",
    ]);
    const closed = listPullRequests(
      activity,
      countedEvents(
        {
          ...activity,
          activities: [at("opened", "pr4", carol, "2026-10-09T09:00:00")],
        },
        period,
      ),
    );
    expect(closed.map(({ state }) => state)).toEqual(["closed"]);
  });

  it("names the author and marks a bot's pull request", () => {
    expect(listed.map(({ author, byBot }) => [author?.login, byBot])).toEqual([
      ["alice", false],
      ["bob", false],
      ["dependabot[bot]", true],
    ]);
  });
});

describe("narrowList", () => {
  /** Each kept row's id, latest event and pushes, in list order. */
  const narrowed = (narrowing: Narrowing) =>
    narrowList(listed, events, narrowing).map(
      ({ pullRequest, latest, pushes }) => [
        pullRequest.id,
        latest.kind,
        latest.at,
        pushes,
      ],
    );

  it("keeps the pull requests merged on a day, dated by the merge, with that day's pushes", () => {
    // Alice pushed to pr1 on Oct 7, but it was merged on Oct 8.
    expect(narrowed({ kind: "merged", day: "2026-10-07" })).toEqual([
      ["pr3", "merged", new Date("2026-10-07T14:20:00-04:00"), 0],
    ]);
    // pr1 had 2 pushes in the period, none of them on the day it was merged.
    expect(narrowed({ kind: "merged", day: "2026-10-08" })).toEqual([
      ["pr1", "merged", new Date("2026-10-08T16:00:00-04:00"), 0],
    ]);
  });

  it("keeps the pull requests a member pushed to on a day, dated by the day's last push, with that day's pushes", () => {
    // pr1's latest event in the period is its merge on Oct 8.
    expect(narrowed({ kind: "pushed", day: "2026-10-07" })).toEqual([
      ["pr1", "pushed", new Date("2026-10-07T14:05:00-04:00"), 1],
    ]);
    // Dependabot's rebase is not a member's push.
    expect(narrowed({ kind: "pushed", day: "2026-10-06" })).toEqual([]);
  });

  it("keeps the pull requests merged or pushed to within an hour, dated and counted in that hour", () => {
    expect(narrowed({ kind: "hour", day: "2026-10-07", hour: 14 })).toEqual([
      ["pr3", "merged", new Date("2026-10-07T14:20:00-04:00"), 0],
      ["pr1", "pushed", new Date("2026-10-07T14:05:00-04:00"), 1],
    ]);
    // Opening a pull request is not counted in the hours.
    expect(narrowed({ kind: "hour", day: "2026-10-05", hour: 14 })).toEqual([
      ["pr1", "pushed", new Date("2026-10-05T14:10:00-04:00"), 1],
    ]);
  });

  it("keeps the rest of each row as listed", () => {
    const [row] = narrowList(listed, events, {
      kind: "merged",
      day: "2026-10-07",
    });

    expect(row).toMatchObject({
      author: dependabot,
      state: "merged",
      byBot: true,
    });
  });
});

describe("summarizeByMember", () => {
  const summary = summarizeByMember(activity, listed, events);
  const rows = Object.fromEntries(
    summary.members.map(({ member, ...counts }) => [member.login, counts]),
  );

  it("has a row per person in the members' order, then the bots", () => {
    expect(summary.members.map(({ member }) => member.login)).toEqual([
      "alice",
      "bob",
      "carol",
      "dependabot[bot]",
    ]);
  });

  it("counts what the author opened and merged, not what they merged of others", () => {
    // Alice merged Dependabot's pull request, and Bob merged Alice's.
    expect(rows.alice).toMatchObject({ opened: 0, merged: 1 });
    expect(rows.bob).toMatchObject({ opened: 1, merged: 0 });
    expect(rows.carol).toEqual({
      opened: 0,
      merged: 0,
      pushed: 0,
      additions: 0,
      deletions: 0,
    });
  });

  it("counts a person's pushes, and none for a bot", () => {
    expect(rows.alice?.pushed).toBe(2);
    expect(rows.bob?.pushed).toBe(1);
    expect(rows["dependabot[bot]"]).toEqual({
      opened: 1,
      merged: 1,
      pushed: null,
      additions: 3,
      deletions: 2,
    });
  });

  it("adds each listed pull request's lines to its author once", () => {
    expect(rows.alice).toMatchObject({ additions: 100, deletions: 20 });
    expect(rows.bob).toMatchObject({ additions: 5, deletions: 1 });
  });

  it("totals the rows, the bots' included, so that the merged total is the chart's", () => {
    expect(summary.total).toEqual({
      opened: 2,
      merged: 2,
      pushed: 3,
      additions: 108,
      deletions: 23,
    });
  });

  it("has no row for a bot without a listed pull request", () => {
    const quiet = summarizeByMember(
      activity,
      listed.filter(({ byBot }) => !byBot),
      events,
    );

    expect(quiet.members.map(({ member }) => member.login)).not.toContain(
      "dependabot[bot]",
    );
  });
});

describe("pullRequestUrl", () => {
  it("is the pull request's page on GitHub", () => {
    expect(pullRequestUrl(pullRequest("pr12", alice))).toBe(
      "https://github.com/acme/web/pull/12",
    );
  });
});
