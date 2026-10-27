import { describe, expect, it } from "vitest";
import { periodEndingAt } from "@yagura/activity";
import { formatDateTime, formatPeriod, formatPushes } from "./format";

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
