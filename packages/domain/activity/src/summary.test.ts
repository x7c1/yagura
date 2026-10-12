import { describe, expect, it } from "vitest";
import { periodEndingAt } from "./period";
import type { PullRequest } from "./pull-request";
import { summarizeByMember } from "./summary";

const period = periodEndingAt(new Date("2026-10-12T15:30:00-04:00"));
const beforePeriod = "2026-09-28T23:59:59-04:00";

function pr(
  id: string,
  author: string,
  createdAt: string,
  mergedAt: string | null,
  additions: number,
  deletions: number,
): PullRequest {
  return {
    id,
    title: `Pull request ${id}`,
    url: `https://github.com/acme/app/pull/${id}`,
    repository: "acme/app",
    author,
    state: mergedAt === null ? "open" : "merged",
    createdAt: new Date(createdAt),
    mergedAt: mergedAt === null ? null : new Date(mergedAt),
    additions,
    deletions,
  };
}

describe("summarizeByMember", () => {
  it("counts a pull request opened before the period and merged in it as merged only", () => {
    const summary = summarizeByMember(
      ["alice"],
      [pr("1", "alice", beforePeriod, "2026-10-01T10:00:00-04:00", 10, 3)],
      period,
    );

    expect(summary.members).toEqual([
      { login: "alice", opened: 0, merged: 1, additions: 10, deletions: 3 },
    ]);
  });

  it("counts a pull request opened and merged in the period as both, its lines once", () => {
    const summary = summarizeByMember(
      ["alice"],
      [
        pr(
          "1",
          "alice",
          "2026-10-01T10:00:00-04:00",
          "2026-10-02T10:00:00-04:00",
          10,
          3,
        ),
      ],
      period,
    );

    expect(summary.members).toEqual([
      { login: "alice", opened: 1, merged: 1, additions: 10, deletions: 3 },
    ]);
  });

  it("gives a member with no pull requests a row of zeros", () => {
    const summary = summarizeByMember(["alice", "bob"], [], period);

    expect(summary.members).toEqual([
      { login: "alice", opened: 0, merged: 0, additions: 0, deletions: 0 },
      { login: "bob", opened: 0, merged: 0, additions: 0, deletions: 0 },
    ]);
    expect(summary.total).toEqual({
      opened: 0,
      merged: 0,
      additions: 0,
      deletions: 0,
    });
  });

  it("lists the members in the given order, with the totals over them all", () => {
    const summary = summarizeByMember(
      ["carol", "alice", "bob"],
      [
        pr("1", "alice", "2026-10-03T10:00:00-04:00", null, 5, 1),
        pr(
          "2",
          "bob",
          "2026-10-04T10:00:00-04:00",
          "2026-10-05T10:00:00-04:00",
          20,
          8,
        ),
        pr("3", "alice", beforePeriod, "2026-10-06T10:00:00-04:00", 2, 2),
      ],
      period,
    );

    expect(summary.members).toEqual([
      { login: "carol", opened: 0, merged: 0, additions: 0, deletions: 0 },
      { login: "alice", opened: 1, merged: 1, additions: 7, deletions: 3 },
      { login: "bob", opened: 1, merged: 1, additions: 20, deletions: 8 },
    ]);
    expect(summary.total).toEqual({
      opened: 2,
      merged: 2,
      additions: 27,
      deletions: 11,
    });
  });

  it("matches authors to logins ignoring case and leaves out others", () => {
    const summary = summarizeByMember(
      ["Alice"],
      [
        pr("1", "alice", "2026-10-03T10:00:00-04:00", null, 5, 1),
        pr("2", "mallory", "2026-10-03T10:00:00-04:00", null, 50, 10),
      ],
      period,
    );

    expect(summary.members).toEqual([
      { login: "Alice", opened: 1, merged: 0, additions: 5, deletions: 1 },
    ]);
    expect(summary.total).toEqual({
      opened: 1,
      merged: 0,
      additions: 5,
      deletions: 1,
    });
  });
});
