import { describe, expect, it } from "vitest";
import {
  latestEventIn,
  mergeSearchResults,
  wasMerged,
  wasOpened,
} from "./measures";
import { periodEndingAt } from "./period";
import type { PullRequest } from "./pull-request";

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

describe("wasOpened", () => {
  it("counts a pull request created in the period, whatever its state", () => {
    expect(wasOpened(pr("1", "2026-09-29T00:00:00-04:00"), period)).toBe(true);
    expect(
      wasOpened(
        { ...pr("2", "2026-10-01T10:00:00-04:00"), state: "closed" },
        period,
      ),
    ).toBe(true);
  });

  it("does not count one created before the period", () => {
    expect(
      wasOpened(pr("1", beforePeriod, "2026-10-01T10:00:00-04:00"), period),
    ).toBe(false);
  });
});

describe("wasMerged", () => {
  it("counts a pull request merged in the period, even if created before", () => {
    expect(
      wasMerged(pr("1", beforePeriod, "2026-10-01T10:00:00-04:00"), period),
    ).toBe(true);
  });

  it("does not count one that is unmerged or merged before the period", () => {
    expect(wasMerged(pr("1", "2026-10-01T10:00:00-04:00"), period)).toBe(false);
    expect(
      wasMerged(pr("2", "2026-09-01T10:00:00-04:00", beforePeriod), period),
    ).toBe(false);
  });
});

describe("latestEventIn", () => {
  it("is the merge when merged in the period, else the creation", () => {
    const merged = pr(
      "1",
      "2026-10-01T10:00:00-04:00",
      "2026-10-02T10:00:00-04:00",
    );
    const open = pr("2", "2026-10-03T10:00:00-04:00");
    const mergedBefore = pr("3", "2026-09-01T10:00:00-04:00", beforePeriod);

    expect(latestEventIn(merged, period)).toEqual(merged.mergedAt);
    expect(latestEventIn(open, period)).toEqual(open.createdAt);
    expect(latestEventIn(mergedBefore, period)).toEqual(mergedBefore.createdAt);
  });
});

describe("mergeSearchResults", () => {
  it("lists each pull request once, newest first by its latest event", () => {
    const openedAndMerged = pr(
      "a",
      "2026-10-01T10:00:00-04:00",
      "2026-10-10T10:00:00-04:00",
    );
    const opened = pr("b", "2026-10-05T10:00:00-04:00");
    const mergedOnly = pr("c", beforePeriod, "2026-10-03T10:00:00-04:00");
    const latest = pr("d", "2026-10-12T09:00:00-04:00");

    const merged = mergeSearchResults(
      [
        [openedAndMerged, opened, latest],
        [openedAndMerged, mergedOnly],
      ],
      period,
    );

    expect(merged.map(({ id }) => id)).toEqual(["d", "a", "b", "c"]);
  });

  it("leaves out pull requests neither opened nor merged in the period", () => {
    const outside = pr("x", "2026-09-01T10:00:00-04:00", beforePeriod);

    expect(mergeSearchResults([[outside]], period)).toEqual([]);
  });

  it("returns an empty list for no results", () => {
    expect(mergeSearchResults([], period)).toEqual([]);
  });
});
