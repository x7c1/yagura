import { describe, expect, it } from "vitest";
import { periodEndingAt } from "@yagura/activity";
import { formatDayTime, formatPeriod } from "./format";

describe("formatDayTime", () => {
  it("shows the local month, day and 24-hour time", () => {
    expect(formatDayTime(new Date(2026, 9, 13, 14, 5))).toBe("Oct 13 14:05");
  });

  it("pads the hour and minute, and shows midnight as 00:00", () => {
    expect(formatDayTime(new Date(2026, 9, 3, 0, 0))).toBe("Oct 3 00:00");
    expect(formatDayTime(new Date(2026, 9, 3, 9, 7))).toBe("Oct 3 09:07");
  });
});

describe("formatPeriod", () => {
  it("names the number of days, then the first and last of them", () => {
    expect(formatPeriod(periodEndingAt(new Date(2026, 9, 12, 15, 30)))).toBe(
      "Last 14 days · Sep 29 – Oct 12",
    );
  });
});
