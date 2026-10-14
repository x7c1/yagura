import { describe, expect, it } from "vitest";
import { countByDay } from "./daily";
import { countByHour, hoursPerDay, pullRequestsInHour } from "./hourly";
import { periodEndingAt } from "./period";
import type { PullRequest } from "./pull-request";

// The test script runs in America/New_York, so that local hours and days
// differ from UTC ones.

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

/** The hours of `day` with something, as `{ hour: count }`, per measure. */
function busyHours(
  pullRequests: readonly PullRequest[],
  day: string,
  p = period,
): { opened: Record<number, number>; merged: Record<number, number> } {
  const entry = countByHour(pullRequests, p).find((e) => e.day === day);
  if (entry === undefined) {
    throw new Error(`No ${day} in the period`);
  }
  const busy = (counts: readonly number[]) =>
    Object.fromEntries(
      counts.flatMap((count, hour) => (count > 0 ? [[hour, count]] : [])),
    ) as Record<number, number>;
  return { opened: busy(entry.opened), merged: busy(entry.merged) };
}

describe("countByHour", () => {
  it("has every hour of every day of the period, oldest day first, with zeros", () => {
    const days = countByHour([], period);

    expect(days).toHaveLength(14);
    expect(days[0]?.day).toBe("2026-09-29");
    expect(days[13]?.day).toBe("2026-10-12");
    for (const { opened, merged } of days) {
      expect(opened).toEqual(new Array(hoursPerDay).fill(0));
      expect(merged).toEqual(new Array(hoursPerDay).fill(0));
    }
  });

  it("counts the opened and the merged apart, each in its own hour", () => {
    const prs = [
      pr("1", "2026-10-04T09:05:00-04:00", "2026-10-04T14:59:59-04:00"),
      pr("2", "2026-10-04T09:55:00-04:00", "2026-10-04T14:00:00-04:00"),
      pr("3", "2026-10-04T10:00:00-04:00"),
    ];

    expect(busyHours(prs, "2026-10-04")).toEqual({
      opened: { 9: 2, 10: 1 },
      merged: { 14: 2 },
    });
  });

  it("splits days and hours at local midnight, not UTC midnight", () => {
    const prs = [
      // Already October 7, 03:30, in UTC.
      pr("1", "2026-10-06T23:30:00-04:00", "2026-10-07T00:10:00-04:00"),
    ];

    expect(busyHours(prs, "2026-10-06")).toEqual({
      opened: { 23: 1 },
      merged: {},
    });
    expect(busyHours(prs, "2026-10-07")).toEqual({
      opened: {},
      merged: { 0: 1 },
    });
  });

  it("counts only the merge of one opened before the period", () => {
    const prs = [pr("1", beforePeriod, "2026-09-29T08:15:00-04:00")];

    expect(busyHours(prs, "2026-09-29")).toEqual({
      opened: {},
      merged: { 8: 1 },
    });
  });

  it("counts both times of the hour a daylight saving change repeats", () => {
    // New York leaves daylight saving time at 2:00 on November 1, 2026,
    // going back to 1:00.
    const fallBack = periodEndingAt(new Date("2026-11-01T12:00:00-05:00"));
    const prs = [
      pr("1", "2026-11-01T01:30:00-04:00"),
      pr("2", "2026-11-01T01:30:00-05:00"),
      pr("3", "2026-11-01T02:30:00-05:00"),
    ];

    expect(busyHours(prs, "2026-11-01", fallBack)).toEqual({
      opened: { 1: 2, 2: 1 },
      merged: {},
    });
  });

  it("adds up, hour by hour, to each day's counts", () => {
    const prs = [
      pr("1", "2026-10-01T10:00:00-04:00", "2026-10-03T09:00:00-04:00"),
      pr("2", "2026-10-03T12:00:00-04:00"),
      pr("3", beforePeriod, "2026-10-03T15:00:00-04:00"),
      pr("4", "2026-10-12T00:00:00-04:00", "2026-10-12T15:29:00-04:00"),
    ];
    const sum = (counts: readonly number[]) =>
      counts.reduce((total, count) => total + count, 0);

    expect(
      countByHour(prs, period).map(({ day, opened, merged }) => ({
        day,
        opened: sum(opened),
        merged: sum(merged),
      })),
    ).toEqual(countByDay(prs, period));
  });
});

describe("pullRequestsInHour", () => {
  const morning = pr(
    "a",
    "2026-10-01T10:00:00-04:00",
    "2026-10-03T09:00:00-04:00",
  );
  const nineThirty = pr("b", "2026-10-03T09:30:00-04:00");
  const mergedOnly = pr("c", beforePeriod, "2026-10-03T09:59:59-04:00");
  const ten = pr("d", "2026-10-02T08:00:00-04:00", "2026-10-03T10:00:00-04:00");
  const all = [morning, nineThirty, mergedOnly, ten];

  it("selects the pull requests of the day, hour and measure, in the order given", () => {
    const ids = (selected: readonly PullRequest[]) =>
      selected.map(({ id }) => id);

    expect(
      ids(pullRequestsInHour(all, period, "2026-10-03", 9, "merged")),
    ).toEqual(["a", "c"]);
    expect(
      ids(pullRequestsInHour(all, period, "2026-10-03", 10, "merged")),
    ).toEqual(["d"]);
    expect(
      ids(pullRequestsInHour(all, period, "2026-10-03", 9, "opened")),
    ).toEqual(["b"]);
    expect(pullRequestsInHour(all, period, "2026-10-02", 9, "opened")).toEqual(
      [],
    );
  });

  it("selects as many as countByHour counts", () => {
    for (const { day, opened, merged } of countByHour(all, period)) {
      for (let hour = 0; hour < hoursPerDay; hour += 1) {
        expect(
          pullRequestsInHour(all, period, day, hour, "opened"),
        ).toHaveLength(opened[hour] ?? -1);
        expect(
          pullRequestsInHour(all, period, day, hour, "merged"),
        ).toHaveLength(merged[hour] ?? -1);
      }
    }
  });
});
