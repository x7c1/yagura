import { describe, expect, it } from "vitest";
import { countByDay, pullRequestsOn } from "./daily";
import { periodEndingAt } from "./period";
import type { PullRequest } from "./pull-request";

// The test script runs in America/New_York, so that local days differ from
// UTC days.

const period = periodEndingAt(new Date("2026-10-12T15:30:00-04:00"));
const beforePeriod = "2026-09-28T23:59:59-04:00";

function pr(
  id: string,
  createdAt: string,
  mergedAt: string | null = null,
): PullRequest {
  return {
    id,
    title: `Pull request ${id}`,
    url: `https://github.com/acme/app/pull/${id}`,
    repository: "acme/app",
    author: "octocat",
    state: mergedAt === null ? "open" : "merged",
    createdAt: new Date(createdAt),
    mergedAt: mergedAt === null ? null : new Date(mergedAt),
    additions: 1,
    deletions: 0,
  };
}

/** The counts of `day` in `countByDay`'s result. */
function countsOn(
  pullRequests: readonly PullRequest[],
  day: string,
): { opened: number; merged: number } | undefined {
  const entry = countByDay(pullRequests, period).find((e) => e.day === day);
  return entry && { opened: entry.opened, merged: entry.merged };
}

describe("countByDay", () => {
  it("has every day of the period, oldest first, with zeros for an empty day", () => {
    const days = countByDay([pr("1", "2026-10-05T10:00:00-04:00")], period);

    expect(days).toHaveLength(14);
    expect(days[0]).toEqual({ day: "2026-09-29", opened: 0, merged: 0 });
    expect(days[13]).toEqual({ day: "2026-10-12", opened: 0, merged: 0 });
    expect(days.find(({ day }) => day === "2026-10-05")).toEqual({
      day: "2026-10-05",
      opened: 1,
      merged: 0,
    });
  });

  it("counts a pull request opened on one day and merged on another on each", () => {
    const prs = [
      pr("1", "2026-10-01T10:00:00-04:00", "2026-10-03T09:00:00-04:00"),
    ];

    expect(countsOn(prs, "2026-10-01")).toEqual({ opened: 1, merged: 0 });
    expect(countsOn(prs, "2026-10-02")).toEqual({ opened: 0, merged: 0 });
    expect(countsOn(prs, "2026-10-03")).toEqual({ opened: 0, merged: 1 });
  });

  it("counts one opened and merged on the same day for both", () => {
    const prs = [
      pr("1", "2026-10-04T09:00:00-04:00", "2026-10-04T17:00:00-04:00"),
      pr("2", "2026-10-04T11:00:00-04:00"),
    ];

    expect(countsOn(prs, "2026-10-04")).toEqual({ opened: 2, merged: 1 });
  });

  it("splits days at local midnight, not UTC midnight", () => {
    // Already October 7 in UTC.
    const prs = [pr("1", "2026-10-06T23:30:00-04:00")];

    expect(countsOn(prs, "2026-10-06")).toEqual({ opened: 1, merged: 0 });
    expect(countsOn(prs, "2026-10-07")).toEqual({ opened: 0, merged: 0 });
  });

  it("counts only the merge of one opened before the period", () => {
    const days = countByDay(
      [pr("1", beforePeriod, "2026-09-29T08:00:00-04:00")],
      period,
    );

    expect(days.reduce((sum, { opened }) => sum + opened, 0)).toBe(0);
    expect(days[0]).toEqual({ day: "2026-09-29", opened: 0, merged: 1 });
  });

  it("is all zeros without pull requests", () => {
    const days = countByDay([], period);

    expect(days).toHaveLength(14);
    expect(days.every(({ opened, merged }) => opened + merged === 0)).toBe(
      true,
    );
  });
});

describe("pullRequestsOn", () => {
  const openedAndMerged = pr(
    "a",
    "2026-10-01T10:00:00-04:00",
    "2026-10-03T09:00:00-04:00",
  );
  const opened = pr("b", "2026-10-03T12:00:00-04:00");
  const mergedOnly = pr("c", beforePeriod, "2026-10-03T15:00:00-04:00");
  const all = [openedAndMerged, opened, mergedOnly];

  it("selects the pull requests of the day and measure, in the order given", () => {
    expect(
      pullRequestsOn(all, period, "2026-10-03", "merged").map(({ id }) => id),
    ).toEqual(["a", "c"]);
    expect(
      pullRequestsOn(all, period, "2026-10-03", "opened").map(({ id }) => id),
    ).toEqual(["b"]);
    expect(
      pullRequestsOn(all, period, "2026-10-01", "opened").map(({ id }) => id),
    ).toEqual(["a"]);
  });

  it("selects nothing on a day with nothing", () => {
    expect(pullRequestsOn(all, period, "2026-10-02", "opened")).toEqual([]);
    expect(pullRequestsOn(all, period, "2026-10-02", "merged")).toEqual([]);
  });

  it("selects as many as countByDay counts", () => {
    for (const { day, opened, merged } of countByDay(all, period)) {
      expect(pullRequestsOn(all, period, day, "opened")).toHaveLength(opened);
      expect(pullRequestsOn(all, period, day, "merged")).toHaveLength(merged);
    }
  });
});
