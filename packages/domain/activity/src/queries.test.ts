import { describe, expect, it } from "vitest";
import { localTimestamp, searchQuery } from "./queries";

// The test script runs in America/New_York (UTC−4 in summer, UTC−5 in
// winter).

describe("searchQuery", () => {
  const from = new Date("2026-09-29T00:00:00-04:00");

  it("searches on from the local start when the span has no end", () => {
    const span = { from, to: undefined };

    expect(searchQuery("octocat", "opened", span)).toBe(
      "is:pr author:octocat created:>=2026-09-29T00:00:00-04:00",
    );
    expect(searchQuery("octocat", "merged", span)).toBe(
      "is:pr is:merged author:octocat merged:>=2026-09-29T00:00:00-04:00",
    );
  });

  it("ends a range at the last second before its end", () => {
    const span = { from, to: new Date("2026-10-12T00:00:00-04:00") };

    expect(searchQuery("octocat", "opened", span)).toBe(
      "is:pr author:octocat " +
        "created:2026-09-29T00:00:00-04:00..2026-10-11T23:59:59-04:00",
    );
    expect(searchQuery("octocat", "merged", span)).toBe(
      "is:pr is:merged author:octocat " +
        "merged:2026-09-29T00:00:00-04:00..2026-10-11T23:59:59-04:00",
    );
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
