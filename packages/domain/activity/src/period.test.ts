import { describe, expect, it } from "vitest";
import {
  isWithin,
  localTimestamp,
  periodEndingAt,
  requestRange,
} from "./period";

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

describe("requestRange", () => {
  it("runs from the period's start to local midnight after today", () => {
    const period = periodEndingAt(new Date("2026-10-12T15:30:00-04:00"));

    expect(requestRange(period)).toEqual({
      from: new Date("2026-09-29T00:00:00-04:00"),
      to: new Date("2026-10-13T00:00:00-04:00"),
    });
  });

  it("spans an hour more across the end of daylight saving time", () => {
    // Daylight saving time ends on November 1, 2026.
    const { from, to } = requestRange(
      periodEndingAt(new Date("2026-11-05T09:00:00-05:00")),
    );

    expect(to.getTime() - from.getTime()).toBe((14 * 24 + 1) * 3600 * 1000);
  });
});

describe("localTimestamp", () => {
  it("writes the local time with its offset", () => {
    expect(localTimestamp(new Date("2026-07-04T01:02:03Z"))).toBe(
      "2026-07-03T21:02:03-04:00",
    );
    expect(localTimestamp(new Date("2026-12-31T23:59:59Z"))).toBe(
      "2026-12-31T18:59:59-05:00",
    );
  });

  it("denotes the same instant", () => {
    const time = new Date("2026-03-08T06:59:59Z");

    expect(new Date(localTimestamp(time))).toEqual(time);
  });
});
