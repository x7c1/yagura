import { describe, expect, it } from "vitest";
import { dayBands } from "./day-bands";

/** Local time on October `day`, 2026. */
function at(day: number, hours: number): Date {
  return new Date(2026, 9, day, hours);
}

describe("dayBands", () => {
  it("gives nothing for no times", () => {
    expect(dayBands([])).toEqual([]);
  });

  it("puts all the times of a single day in the first band", () => {
    expect(dayBands([at(13, 23), at(13, 12), at(13, 0)])).toEqual([0, 0, 0]);
  });

  it("alternates the band each time the local day changes", () => {
    expect(
      dayBands([at(13, 9), at(12, 23), at(12, 1), at(10, 8), at(9, 22)]),
    ).toEqual([0, 1, 1, 0, 1]);
  });

  it("changes the band at local midnight", () => {
    expect(
      dayBands([new Date(2026, 9, 13, 0, 0), new Date(2026, 9, 12, 23, 59)]),
    ).toEqual([0, 1]);
  });
});
