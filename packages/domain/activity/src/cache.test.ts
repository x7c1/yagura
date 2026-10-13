import { describe, expect, it } from "vitest";
import {
  emptyMemberActivity,
  idsNeedingDetails,
  isDayComplete,
  isWithinLastingLife,
  isWithinShortLife,
  planSearch,
  pruneMemberActivity,
  recordRefresh,
  recordSearch,
  splitIntoDays,
  staleUnmergedIds,
  storedPullRequests,
  type FetchedDay,
  type MemberActivity,
} from "./cache";
import { periodDayKeys } from "./days";
import type { Measure } from "./measures";
import { periodEndingAt } from "./period";
import type {
  FoundPullRequest,
  PullRequest,
  PullRequestState,
} from "./pull-request";

// The test script runs in America/New_York (UTC−4 in October).

const minute = 60 * 1000;
const day = 24 * 60 * minute;

const now = new Date("2026-10-12T15:30:00-04:00");
const period = periodEndingAt(now);
const days = periodDayKeys(period);
/** Fetched on October 12 after midnight: every earlier day had ended. */
const fetchedToday = new Date("2026-10-12T09:00:00-04:00");
const ago = (ms: number) => new Date(now.getTime() - ms);

function pr(
  id: string,
  createdAt: string,
  mergedAt: string | null = null,
  state: PullRequestState = mergedAt === null ? "open" : "merged",
): PullRequest {
  return {
    id,
    title: `Pull request ${id}`,
    url: `https://github.com/acme/app/pull/${id}`,
    repository: "acme/app",
    author: "octocat",
    state,
    createdAt: new Date(createdAt),
    mergedAt: mergedAt === null ? null : new Date(mergedAt),
    additions: 1,
    deletions: 0,
  };
}

/** Activity with the given days of one measure and the pull requests. */
function activity(
  measure: Measure,
  fetched: Record<string, FetchedDay>,
  pullRequests: readonly [PullRequest, Date][] = [],
): MemberActivity {
  return {
    days: {
      ...emptyMemberActivity.days,
      [measure]: new Map(Object.entries(fetched)),
    },
    pullRequests: new Map(
      pullRequests.map(([pullRequest, storedAt]) => [
        pullRequest.id,
        { storedAt, pullRequest },
      ]),
    ),
  };
}

/** Every day of the period fetched at `fetchedAt`, with no pull requests. */
function allDays(fetchedAt: Date): Record<string, FetchedDay> {
  return Object.fromEntries(days.map((d) => [d, { fetchedAt, ids: [] }]));
}

describe("isWithinShortLife and isWithinLastingLife", () => {
  it("last 10 minutes and 7 days", () => {
    expect(isWithinShortLife(ago(10 * minute - 1), now)).toBe(true);
    expect(isWithinShortLife(ago(10 * minute), now)).toBe(false);
    expect(isWithinLastingLife(ago(7 * day - 1), now)).toBe(true);
    expect(isWithinLastingLife(ago(7 * day), now)).toBe(false);
  });
});

describe("isDayComplete", () => {
  const fetched = (fetchedAt: string): FetchedDay => ({
    fetchedAt: new Date(fetchedAt),
    ids: [],
  });

  it("completes a past day fetched after it ended, for 7 days", () => {
    const at = fetched("2026-10-06T00:00:00-04:00");

    expect(isDayComplete("2026-10-05", at, now)).toBe(true);
    expect(
      isDayComplete("2026-10-05", at, new Date("2026-10-13T00:00:00-04:00")),
    ).toBe(false);
  });

  it("does not complete a past day fetched while it was today", () => {
    expect(
      isDayComplete("2026-10-11", fetched("2026-10-11T23:59:00-04:00"), now),
    ).toBe(false);
  });

  it("completes today for 10 minutes", () => {
    expect(
      isDayComplete("2026-10-12", fetched("2026-10-12T15:21:00-04:00"), now),
    ).toBe(true);
    expect(
      isDayComplete("2026-10-12", fetched("2026-10-12T15:20:00-04:00"), now),
    ).toBe(false);
  });

  it("does not complete today with results fetched before it began", () => {
    expect(
      isDayComplete(
        "2026-10-12",
        fetched("2026-10-11T23:58:00-04:00"),
        new Date("2026-10-12T00:03:00-04:00"),
      ),
    ).toBe(false);
  });
});

describe("planSearch", () => {
  it("searches the whole period up to now when nothing is stored", () => {
    expect(planSearch(emptyMemberActivity, "opened", period)).toEqual({
      days,
      from: period.start,
      to: undefined,
    });
  });

  it("plans nothing when every day is complete", () => {
    const stored = activity("merged", {
      ...allDays(fetchedToday),
      "2026-10-12": { fetchedAt: ago(minute), ids: [] },
    });

    expect(planSearch(stored, "merged", period)).toBeUndefined();
    // The other measure has nothing stored.
    expect(planSearch(stored, "opened", period)?.days).toEqual(days);
  });

  it("searches only today once its short life has passed", () => {
    const stored = activity("opened", {
      ...allDays(fetchedToday),
      "2026-10-12": { fetchedAt: ago(10 * minute), ids: [] },
    });

    expect(planSearch(stored, "opened", period)).toEqual({
      days: ["2026-10-12"],
      from: new Date("2026-10-12T00:00:00-04:00"),
      to: undefined,
    });
  });

  it("searches from the earliest incomplete day, up to now with today", () => {
    // Fetched on October 11: complete up to October 10, with October 11
    // fetched while it was today.
    const stored = activity(
      "opened",
      allDays(new Date("2026-10-11T15:00:00-04:00")),
    );

    expect(planSearch(stored, "opened", period)).toEqual({
      days: ["2026-10-11", "2026-10-12"],
      from: new Date("2026-10-11T00:00:00-04:00"),
      to: undefined,
    });
  });

  it("searches a range ending at the start of today when today is complete", () => {
    const fetched = allDays(fetchedToday);
    delete fetched["2026-10-03"];
    const stored = activity("opened", {
      ...fetched,
      "2026-10-12": { fetchedAt: ago(minute), ids: [] },
    });

    expect(planSearch(stored, "opened", period)).toEqual({
      days: days.slice(4, 13),
      from: new Date("2026-10-03T00:00:00-04:00"),
      to: new Date("2026-10-12T00:00:00-04:00"),
    });
  });
});

describe("splitIntoDays", () => {
  const openedLate = pr(
    "a",
    "2026-10-10T23:30:00-04:00",
    "2026-10-11T01:00:00-04:00",
  );
  const openedEarly = pr("b", "2026-10-11T00:00:00-04:00");
  const before = pr("c", "2026-10-01T10:00:00-04:00");

  it("splits by local creation day for opened, keeping empty days", () => {
    const byDay = splitIntoDays([openedLate, openedEarly, before], "opened", [
      "2026-10-10",
      "2026-10-11",
      "2026-10-12",
    ]);

    expect(
      Object.fromEntries(
        [...byDay].map(([d, prs]) => [d, prs.map(({ id }) => id)]),
      ),
    ).toEqual({ "2026-10-10": ["a"], "2026-10-11": ["b"], "2026-10-12": [] });
  });

  it("splits by merge day for merged, leaving out unmerged ones", () => {
    const byDay = splitIntoDays([openedLate, openedEarly], "merged", [
      "2026-10-10",
      "2026-10-11",
    ]);

    expect(byDay.get("2026-10-10")).toEqual([]);
    expect(byDay.get("2026-10-11")).toEqual([openedLate]);
  });
});

/** What a search reports of `pull`, optionally in another state. */
function light(
  pull: PullRequest,
  changes: Partial<FoundPullRequest> = {},
): FoundPullRequest {
  const { id, state, createdAt, mergedAt } = pull;
  return { id, state, createdAt, mergedAt, ...changes };
}

describe("idsNeedingDetails", () => {
  const merged = pr(
    "merged",
    "2026-10-12T08:00:00-04:00",
    "2026-10-12T09:00:00-04:00",
  );
  const fresh = pr("fresh", "2026-10-12T08:00:00-04:00");
  const old = pr("old", "2026-10-12T08:00:00-04:00");
  const stored = activity("opened", {}, [
    [merged, ago(day)],
    [fresh, ago(10 * minute - 1)],
    [old, ago(10 * minute)],
  ]);

  it("lists ids not stored, and stored unmerged ones past the short life", () => {
    const found = [
      light(pr("new", "2026-10-12T10:00:00-04:00")),
      light(merged),
      light(fresh),
      light(old),
    ];

    expect(idsNeedingDetails(stored, found, now)).toEqual(["new", "old"]);
  });

  it("lists a fresh unmerged one the search reports in another state", () => {
    const found = [
      light(fresh, {
        state: "merged",
        mergedAt: new Date("2026-10-12T15:00:00-04:00"),
      }),
      light(merged, { state: "closed", mergedAt: null }),
    ];

    expect(idsNeedingDetails(stored, found, now)).toEqual(["fresh"]);
  });

  it("lists an id found twice once", () => {
    const found = pr("new", "2026-10-12T10:00:00-04:00");

    expect(
      idsNeedingDetails(stored, [light(found), light(found)], now),
    ).toEqual(["new"]);
  });
});

describe("recordSearch", () => {
  const plan = {
    days: ["2026-10-11", "2026-10-12"],
    from: new Date("2026-10-11T00:00:00-04:00"),
    to: undefined,
  };

  it("stores every planned day, empty ones included, and the details", () => {
    const found = pr("a", "2026-10-11T10:00:00-04:00");

    const stored = recordSearch(
      emptyMemberActivity,
      "opened",
      plan,
      [light(found)],
      new Map([["a", found]]),
      now,
    );

    expect(stored.days.opened).toEqual(
      new Map([
        ["2026-10-11", { fetchedAt: now, ids: ["a"] }],
        ["2026-10-12", { fetchedAt: now, ids: [] }],
      ]),
    );
    expect(stored.days.merged.size).toBe(0);
    expect(stored.pullRequests.get("a")).toEqual({
      storedAt: now,
      pullRequest: found,
    });
  });

  it("keeps the stored record of a pull request found without details", () => {
    const merged = pr(
      "merged",
      "2026-10-10T10:00:00-04:00",
      "2026-10-12T09:00:00-04:00",
    );
    const stored = activity("merged", {}, [[merged, fetchedToday]]);

    const updated = recordSearch(
      stored,
      "merged",
      plan,
      [light(merged)],
      new Map(),
      now,
    );

    expect(updated.days.merged.get("2026-10-12")).toEqual({
      fetchedAt: now,
      ids: ["merged"],
    });
    expect(updated.pullRequests.get("merged")).toEqual({
      storedAt: fetchedToday,
      pullRequest: merged,
    });
  });

  it("places a pull request by its details where the search disagrees", () => {
    const open = pr("a", "2026-10-11T10:00:00-04:00");

    const stored = recordSearch(
      emptyMemberActivity,
      "merged",
      plan,
      [
        light(open, {
          state: "merged",
          mergedAt: new Date("2026-10-12T09:00:00-04:00"),
        }),
      ],
      new Map([["a", open]]),
      now,
    );

    expect(stored.days.merged.get("2026-10-12")?.ids).toEqual([]);
    expect(stored.pullRequests.size).toBe(0);
  });

  it("drops a pull request whose lookup found nothing, from other days too", () => {
    const gone = pr(
      "gone",
      "2026-10-05T10:00:00-04:00",
      "2026-10-12T09:00:00-04:00",
    );
    const stored: MemberActivity = {
      days: {
        opened: new Map([
          ["2026-10-05", { fetchedAt: fetchedToday, ids: ["gone"] }],
        ]),
        merged: new Map(),
      },
      pullRequests: new Map([
        ["gone", { storedAt: ago(day), pullRequest: gone }],
      ]),
    };

    const updated = recordSearch(
      stored,
      "merged",
      plan,
      [light(gone)],
      new Map([["gone", null]]),
      now,
    );

    expect(updated.days.merged.get("2026-10-12")?.ids).toEqual([]);
    expect(updated.days.opened.get("2026-10-05")?.ids).toEqual([]);
    expect(updated.pullRequests.size).toBe(0);
  });

  it("refuses to store a day with a pull request lacking details", () => {
    const found = pr("a", "2026-10-11T10:00:00-04:00");

    expect(() =>
      recordSearch(
        emptyMemberActivity,
        "opened",
        plan,
        [light(found)],
        new Map(),
        now,
      ),
    ).toThrow("pull request a ");
  });

  it("replaces a day and drops the pull requests it no longer finds", () => {
    const gone = pr("gone", "2026-10-12T08:00:00-04:00");
    const stored = activity(
      "opened",
      { "2026-10-12": { fetchedAt: fetchedToday, ids: ["gone"] } },
      [[gone, fetchedToday]],
    );

    const updated = recordSearch(stored, "opened", plan, [], new Map(), now);

    expect(updated.days.opened.get("2026-10-12")?.ids).toEqual([]);
    expect(updated.pullRequests.size).toBe(0);
  });
});

describe("pruneMemberActivity", () => {
  it("drops the days outside the period and their pull requests", () => {
    const old = pr("old", "2026-09-28T10:00:00-04:00");
    const kept = pr("kept", "2026-09-29T10:00:00-04:00");
    const stored = activity(
      "opened",
      {
        "2026-09-28": { fetchedAt: fetchedToday, ids: ["old"] },
        "2026-09-29": { fetchedAt: fetchedToday, ids: ["kept"] },
      },
      [
        [old, fetchedToday],
        [kept, fetchedToday],
      ],
    );

    const pruned = pruneMemberActivity(stored, period);

    expect([...pruned.days.opened.keys()]).toEqual(["2026-09-29"]);
    expect([...pruned.pullRequests.keys()]).toEqual(["kept"]);
  });

  it("drops pull requests past the lasting life and the days listing them", () => {
    const expired = pr(
      "expired",
      "2026-10-01T10:00:00-04:00",
      "2026-10-02T10:00:00-04:00",
    );
    const stored: MemberActivity = {
      days: {
        opened: new Map([
          ["2026-10-01", { fetchedAt: fetchedToday, ids: ["expired"] }],
        ]),
        merged: new Map([
          ["2026-10-02", { fetchedAt: fetchedToday, ids: ["expired"] }],
          ["2026-10-03", { fetchedAt: fetchedToday, ids: [] }],
        ]),
      },
      pullRequests: new Map([
        ["expired", { storedAt: ago(7 * day), pullRequest: expired }],
      ]),
    };

    const pruned = pruneMemberActivity(stored, period);

    expect(pruned.days.opened.size).toBe(0);
    expect([...pruned.days.merged.keys()]).toEqual(["2026-10-03"]);
    expect(pruned.pullRequests.size).toBe(0);
  });
});

describe("staleUnmergedIds", () => {
  it("lists unmerged pull requests stored longer than 10 minutes ago", () => {
    const stored = activity("opened", {}, [
      [pr("open", "2026-10-01T10:00:00-04:00"), ago(10 * minute)],
      [pr("closed", "2026-10-01T10:00:00-04:00", null, "closed"), ago(day)],
      [pr("fresh", "2026-10-01T10:00:00-04:00"), ago(minute)],
      [
        pr("merged", "2026-10-01T10:00:00-04:00", "2026-10-02T10:00:00-04:00"),
        ago(day),
      ],
    ]);

    expect(staleUnmergedIds(stored, now)).toEqual(["open", "closed"]);
  });
});

describe("recordRefresh", () => {
  const open = pr("open", "2026-10-05T10:00:00-04:00");
  const gone = pr("gone", "2026-10-05T11:00:00-04:00");
  const stored = activity(
    "opened",
    { "2026-10-05": { fetchedAt: fetchedToday, ids: ["open", "gone"] } },
    [
      [open, fetchedToday],
      [gone, fetchedToday],
    ],
  );

  it("stores what came back, and drops what did not from the days too", () => {
    const merged = {
      ...open,
      state: "merged" as const,
      mergedAt: new Date("2026-10-12T14:00:00-04:00"),
    };

    const updated = recordRefresh(stored, ["open", "gone"], [merged], now);

    expect(updated.pullRequests).toEqual(
      new Map([["open", { storedAt: now, pullRequest: merged }]]),
    );
    expect(updated.days.opened.get("2026-10-05")).toEqual({
      fetchedAt: fetchedToday,
      ids: ["open"],
    });
    expect(staleUnmergedIds(updated, new Date(now.getTime() + day))).toEqual(
      [],
    );
  });

  it("ignores ids it does not store", () => {
    const updated = recordRefresh(stored, ["other"], [], now);

    expect(storedPullRequests(updated)).toEqual([open, gone]);
  });
});
