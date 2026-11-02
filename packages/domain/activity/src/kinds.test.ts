import { describe, expect, it } from "vitest";
import type { PullRequest } from "./activity";
import { countByDay } from "./daily";
import type { CountedEvent, EventKind } from "./events";
import { countKindsByDay, kindGroupName, kindOfTitle } from "./kinds";
import { periodEndingAt } from "./period";

// The test script runs in America/New_York (UTC−4 in October).

const now = new Date("2026-10-12T18:00:00-04:00");
const period = periodEndingAt(now);

let numbers = 0;

/** An event of `kind` at the local `time` to a new pull request titled `title`. */
function event(
  title: string,
  time: string,
  kind: EventKind = "merged",
): CountedEvent {
  numbers += 1;
  const pullRequest: PullRequest = {
    id: `pr${numbers}`,
    repository: { id: "r1", ownerLogin: "acme", name: "web" },
    number: numbers,
    title,
    state: "closed",
    draft: false,
    additions: 1,
    deletions: 1,
    authorId: "u1",
    createdAt: new Date("2026-10-01T09:00:00-04:00"),
  };
  return {
    kind,
    pullRequest,
    actorId: "u1",
    at: new Date(`${time}-04:00`),
  };
}

/** The groups' counts of `day` in `kinds`. */
function dayOf(kinds: ReturnType<typeof countKindsByDay>, day: string) {
  return kinds.days.find((entry) => entry.day === day)?.merged;
}

describe("kindOfTitle", () => {
  it.each([
    ["feat: add a chart", "feat"],
    ["feat(web): add a chart", "feat"],
    ["fix!: drop the old endpoint", "fix"],
    ["refactor(api)!: split the module", "refactor"],
    ["Docs: write the guide", "docs"],
    ["BUILD(deps): bump vite", "build"],
  ])("reads the type of %j", (title, kind) => {
    expect(kindOfTitle(title)).toBe(kind);
  });

  it.each([
    "Add a chart",
    "feat : add a chart",
    "feat (web): add a chart",
    "",
    ": nothing before the colon",
    "Release 1.0: the first one",
  ])("finds no kind in %j", (title) => {
    expect(kindOfTitle(title)).toBeNull();
  });
});

describe("countKindsByDay", () => {
  it("puts each merge in its kind's group, on its local day, the rest in other", () => {
    const kinds = countKindsByDay(
      [
        event("feat: one", "2026-10-07T10:00:00"),
        event("feat(web): two", "2026-10-07T11:00:00"),
        event("fix: three", "2026-10-07T12:00:00"),
        event("docs: four", "2026-10-07T13:00:00"),
        event("chore: five", "2026-10-07T14:00:00"),
        event("No kind", "2026-10-08T09:00:00"),
        // Not merges: not counted.
        event("feat: opened", "2026-10-08T10:00:00", "opened"),
        event("feat: pushed", "2026-10-08T11:00:00", "pushed"),
      ],
      period,
    );

    expect(kinds.days).toHaveLength(14);
    // docs and chore tie; chore sorts first.
    expect(kinds.third).toBe("chore");
    expect(dayOf(kinds, "2026-10-07")).toEqual({
      feat: 2,
      fix: 1,
      third: 1,
      other: 1,
    });
    expect(dayOf(kinds, "2026-10-08")).toEqual({
      feat: 0,
      fix: 0,
      third: 0,
      other: 1,
    });
  });

  it("chooses the most merged kind but feat and fix as the third", () => {
    const kinds = countKindsByDay(
      [
        event("feat: a", "2026-10-05T10:00:00"),
        event("feat: b", "2026-10-05T11:00:00"),
        event("feat: c", "2026-10-05T12:00:00"),
        event("fix: d", "2026-10-05T13:00:00"),
        event("fix: e", "2026-10-05T14:00:00"),
        event("fix: f", "2026-10-05T15:00:00"),
        event("ci: g", "2026-10-06T10:00:00"),
        event("docs: h", "2026-10-06T11:00:00"),
        event("docs: i", "2026-10-06T12:00:00"),
      ],
      period,
    );

    expect(kinds.third).toBe("docs");
    expect(dayOf(kinds, "2026-10-06")).toEqual({
      feat: 0,
      fix: 0,
      third: 2,
      other: 1,
    });
  });

  it("gives a tie to the kind whose name sorts first", () => {
    const kinds = countKindsByDay(
      [
        event("test: a", "2026-10-06T10:00:00"),
        event("docs: b", "2026-10-06T11:00:00"),
        event("ci: c", "2026-10-07T11:00:00"),
      ],
      period,
    );

    expect(kinds.third).toBe("ci");
  });

  it("has no third kind when only feat, fix and titles without a kind are merged", () => {
    const kinds = countKindsByDay(
      [
        event("feat: a", "2026-10-06T10:00:00"),
        event("fix: b", "2026-10-06T11:00:00"),
        event("No kind", "2026-10-06T12:00:00"),
        event("No kind either", "2026-10-07T12:00:00"),
      ],
      period,
    );

    expect(kinds.third).toBeNull();
    expect(dayOf(kinds, "2026-10-06")).toEqual({
      feat: 1,
      fix: 1,
      third: 0,
      other: 1,
    });
  });

  it("chooses the third kind over the period, not per day", () => {
    const kinds = countKindsByDay(
      [
        event("docs: a", "2026-10-05T10:00:00"),
        event("docs: b", "2026-10-05T11:00:00"),
        event("docs: c", "2026-10-05T12:00:00"),
        // ci is the most merged of this day alone, but not of the period.
        event("ci: d", "2026-10-09T10:00:00"),
        event("ci: e", "2026-10-09T11:00:00"),
        event("docs: f", "2026-10-09T12:00:00"),
      ],
      period,
    );

    expect(kinds.third).toBe("docs");
    expect(dayOf(kinds, "2026-10-09")).toEqual({
      feat: 0,
      fix: 0,
      third: 1,
      other: 2,
    });
  });

  it("adds each day's groups up to its merged count", () => {
    const events = [
      event("feat: a", "2026-10-05T10:00:00"),
      event("fix(api)!: b", "2026-10-05T11:00:00"),
      event("docs: c", "2026-10-06T12:00:00"),
      event("perf: d", "2026-10-06T13:00:00"),
      event("Untyped", "2026-10-12T09:00:00"),
      event("feat: pushed", "2026-10-12T10:00:00", "pushed"),
    ];
    const kinds = countKindsByDay(events, period);

    expect(
      kinds.days.map(({ day, merged }) => ({
        day,
        merged: merged.feat + merged.fix + merged.third + merged.other,
      })),
    ).toEqual(
      countByDay(events, period).map(({ day, merged }) => ({ day, merged })),
    );
  });
});

describe("kindGroupName", () => {
  it("names the third group after its kind, and the others after themselves", () => {
    expect(kindGroupName("third", "docs")).toBe("docs");
    expect(kindGroupName("feat", "docs")).toBe("feat");
    expect(kindGroupName("other", null)).toBe("other");
  });
});
