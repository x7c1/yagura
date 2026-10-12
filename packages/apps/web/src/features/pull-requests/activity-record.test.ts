import type { MemberActivity } from "@yagura/activity";
import { describe, expect, it } from "vitest";
import { decodeMemberActivity, encodeMemberActivity } from "./activity-record";

const fetchedAt = new Date("2026-10-12T19:30:00Z");

const activity: MemberActivity = {
  days: {
    opened: new Map([
      ["2026-10-11", { fetchedAt, ids: ["PR_1"] }],
      ["2026-10-12", { fetchedAt, ids: [] }],
    ]),
    merged: new Map([["2026-10-12", { fetchedAt, ids: ["PR_1"] }]]),
  },
  pullRequests: new Map([
    [
      "PR_1",
      {
        storedAt: fetchedAt,
        pullRequest: {
          id: "PR_1",
          title: "Add the chart",
          url: "https://github.com/acme/app/pull/1",
          repository: "acme/app",
          author: "octocat",
          state: "merged",
          createdAt: new Date("2026-10-11T10:00:00Z"),
          mergedAt: new Date("2026-10-12T11:30:00Z"),
          additions: 12,
          deletions: 3,
        },
      },
    ],
  ]),
};

describe("encodeMemberActivity and decodeMemberActivity", () => {
  it("round-trip an activity through JSON", () => {
    const stored: unknown = JSON.parse(
      JSON.stringify(encodeMemberActivity(activity)),
    );

    expect(decodeMemberActivity(stored)).toEqual(activity);
  });

  it("decode anything else as nothing", () => {
    const encoded = encodeMemberActivity(activity) as Record<string, unknown>;

    expect(decodeMemberActivity(undefined)).toBeUndefined();
    expect(decodeMemberActivity({ ...encoded, days: {} })).toBeUndefined();
    expect(
      decodeMemberActivity({
        ...encoded,
        pullRequests: { PR_1: { storedAt: 0, pullRequest: { id: "PR_1" } } },
      }),
    ).toBeUndefined();
  });
});
