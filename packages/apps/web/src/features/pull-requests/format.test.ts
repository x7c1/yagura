import { describe, expect, it } from "vitest";
import { periodEndingAt } from "@yagura/activity";
import {
  formatDateTime,
  formatMergedDay,
  formatPeriod,
  formatPushes,
} from "./format";

describe("formatDateTime", () => {
  it("shows the local date and 24-hour time", () => {
    expect(formatDateTime(new Date(2026, 9, 13, 14, 5))).toBe(
      "2026-10-13 14:05",
    );
  });

  it("pads the month, day, hour and minute, and shows midnight as 00:00", () => {
    expect(formatDateTime(new Date(2026, 0, 3, 0, 0))).toBe("2026-01-03 00:00");
    expect(formatDateTime(new Date(2026, 8, 3, 9, 7))).toBe("2026-09-03 09:07");
  });
});

describe("formatPeriod", () => {
  it("names the number of days, then the first and last of them", () => {
    expect(formatPeriod(periodEndingAt(new Date(2026, 9, 12, 15, 30)))).toBe(
      "Last 14 days · Sep 29 – Oct 12",
    );
  });
});

describe("formatPushes", () => {
  it("counts pushes in words", () => {
    expect(formatPushes(1)).toBe("1 push");
    expect(formatPushes(0)).toBe("0 pushes");
    expect(formatPushes(5)).toBe("5 pushes");
  });
});

describe("formatMergedDay", () => {
  it("adds the groups of kinds to the merged count, in the order they are drawn", () => {
    expect(
      formatMergedDay(
        "2026-10-13",
        { feat: 3, fix: 2, third: 1, other: 1 },
        "docs",
      ),
    ).toBe("Oct 13, merged: 7 (feat 3, fix 2, docs 1, other 1)");
  });

  it("leaves out the groups with nothing", () => {
    expect(
      formatMergedDay(
        "2026-10-13",
        { feat: 0, fix: 2, third: 0, other: 1 },
        "ci",
      ),
    ).toBe("Oct 13, merged: 3 (fix 2, other 1)");
  });

  it("names a day without merges by its count alone", () => {
    expect(
      formatMergedDay(
        "2026-10-12",
        { feat: 0, fix: 0, third: 0, other: 0 },
        null,
      ),
    ).toBe("Oct 12, merged: 0");
  });
});
