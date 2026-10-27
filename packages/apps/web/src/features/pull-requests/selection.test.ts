import { describe, expect, it } from "vitest";
import { describeSelection, selectionKey } from "./selection";

describe("describeSelection", () => {
  it("names the day of a chosen bar", () => {
    expect(describeSelection({ kind: "merged", day: "2026-10-03" })).toBe(
      "Merged on Oct 3",
    );
  });

  it("names the day of a chosen push circle", () => {
    expect(describeSelection({ kind: "pushed", day: "2026-10-03" })).toBe(
      "Pushed on Oct 3",
    );
  });

  it("adds the hour of a chosen cell, the day's last ending at 24:00", () => {
    const cell = (hour: number) =>
      describeSelection({ kind: "hour", day: "2026-10-13", hour });

    expect(cell(14)).toBe("Merged or pushed on Oct 13, 14:00–15:00");
    expect(cell(0)).toBe("Merged or pushed on Oct 13, 00:00–01:00");
    expect(cell(23)).toBe("Merged or pushed on Oct 13, 23:00–24:00");
  });
});

describe("selectionKey", () => {
  it("tells every narrowing apart", () => {
    const keys = [
      selectionKey(null),
      selectionKey({ kind: "merged", day: "2026-10-03" }),
      selectionKey({ kind: "pushed", day: "2026-10-03" }),
      selectionKey({ kind: "hour", day: "2026-10-03", hour: 0 }),
      selectionKey({ kind: "hour", day: "2026-10-03", hour: 1 }),
    ];

    expect(new Set(keys).size).toBe(keys.length);
  });
});
