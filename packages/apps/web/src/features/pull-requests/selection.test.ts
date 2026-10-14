import { describe, expect, it } from "vitest";
import { describeSelection } from "./selection";

describe("describeSelection", () => {
  it("names the day of a chosen bar", () => {
    expect(describeSelection({ day: "2026-10-03", hour: null })).toBe(
      "Merged on Oct 3",
    );
  });

  it("adds the hour of a chosen cell, the day's last ending at 24:00", () => {
    expect(describeSelection({ day: "2026-10-13", hour: 14 })).toBe(
      "Merged on Oct 13, 14:00–15:00",
    );
    expect(describeSelection({ day: "2026-10-13", hour: 0 })).toBe(
      "Merged on Oct 13, 00:00–01:00",
    );
    expect(describeSelection({ day: "2026-10-13", hour: 23 })).toBe(
      "Merged on Oct 13, 23:00–24:00",
    );
  });
});
