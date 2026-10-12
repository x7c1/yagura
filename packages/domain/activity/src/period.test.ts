import { describe, expect, it } from "vitest";
import { isWithin, periodEndingAt } from "./period";

// The test script runs in America/New_York, so that local days differ from
// UTC days and a daylight saving change falls inside a period.

describe("periodEndingAt", () => {
  it("starts at local midnight 13 days before today and ends now", () => {
    const now = new Date("2026-10-12T15:30:00-04:00");

    expect(periodEndingAt(now)).toEqual({
      start: new Date("2026-09-29T00:00:00-04:00"),
      end: now,
    });
  });

  it("follows local days, not UTC days", () => {
    // Already October 13 in UTC.
    const now = new Date("2026-10-12T23:30:00-04:00");

    expect(periodEndingAt(now).start).toEqual(
      new Date("2026-09-29T00:00:00-04:00"),
    );
  });

  it("keeps the start at midnight across a daylight saving change", () => {
    // Daylight saving time ends on November 1, 2026.
    const now = new Date("2026-11-05T09:00:00-05:00");

    expect(periodEndingAt(now).start).toEqual(
      new Date("2026-10-23T00:00:00-04:00"),
    );
  });

  it("does not share the end with the caller", () => {
    const now = new Date("2026-10-12T15:30:00-04:00");
    const period = periodEndingAt(now);

    now.setFullYear(2030);

    expect(period.end).toEqual(new Date("2026-10-12T15:30:00-04:00"));
  });
});

describe("isWithin", () => {
  const period = periodEndingAt(new Date("2026-10-12T15:30:00-04:00"));

  it("includes both ends", () => {
    expect(isWithin(period.start, period)).toBe(true);
    expect(isWithin(period.end, period)).toBe(true);
  });

  it("excludes times just outside", () => {
    expect(isWithin(new Date(period.start.getTime() - 1), period)).toBe(false);
    expect(isWithin(new Date(period.end.getTime() + 1), period)).toBe(false);
  });
});
