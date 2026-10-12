import { describe, expect, it } from "vitest";
import { dayKeyOf, periodDayKeys, startOfDay, startOfNextDay } from "./days";
import { periodEndingAt } from "./period";

// The test script runs in America/New_York, so that local days differ from
// UTC days and a daylight saving change falls inside a period.

describe("dayKeyOf", () => {
  it("names the local day, not the UTC one", () => {
    // Already October 13 in UTC.
    expect(dayKeyOf(new Date("2026-10-12T23:30:00-04:00"))).toBe("2026-10-12");
  });
});

describe("startOfDay and startOfNextDay", () => {
  it("are the local midnights around the day", () => {
    expect(startOfDay("2026-10-12")).toEqual(
      new Date("2026-10-12T00:00:00-04:00"),
    );
    expect(startOfNextDay("2026-10-12")).toEqual(
      new Date("2026-10-13T00:00:00-04:00"),
    );
  });

  it("follow a daylight saving change", () => {
    // Daylight saving time ends on November 1, 2026: a 25-hour day.
    expect(startOfNextDay("2026-11-01")).toEqual(
      new Date("2026-11-02T00:00:00-05:00"),
    );
    expect(startOfNextDay("2026-12-31")).toEqual(
      new Date("2027-01-01T00:00:00-05:00"),
    );
  });

  it("reject what is not a day key", () => {
    expect(() => startOfDay("2026-10-12T00:00")).toThrow();
  });
});

describe("periodDayKeys", () => {
  it("lists the period's 14 days, oldest first, ending today", () => {
    const keys = periodDayKeys(
      periodEndingAt(new Date("2026-10-12T15:30:00-04:00")),
    );

    expect(keys).toHaveLength(14);
    expect(keys[0]).toBe("2026-09-29");
    expect(keys[13]).toBe("2026-10-12");
  });

  it("lists each day once across a daylight saving change", () => {
    const keys = periodDayKeys(
      periodEndingAt(new Date("2026-11-05T09:00:00-05:00")),
    );

    expect(keys.slice(8, 11)).toEqual([
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
    expect(new Set(keys).size).toBe(14);
  });
});
