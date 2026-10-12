import { describe, expect, it } from "vitest";
import { periodEndingAt } from "./period";
import { localTimestamp, memberQueries } from "./queries";

// The test script runs in America/New_York (UTC−4 in summer, UTC−5 in
// winter).

describe("memberQueries", () => {
  it("bounds both searches by the period's local start", () => {
    const period = periodEndingAt(new Date("2026-10-12T15:30:00-04:00"));

    expect(memberQueries("octocat", period)).toEqual({
      opened: "is:pr author:octocat created:>=2026-09-29T00:00:00-04:00",
      merged:
        "is:pr is:merged author:octocat merged:>=2026-09-29T00:00:00-04:00",
    });
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
