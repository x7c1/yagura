import { dayKeyOf } from "./days";
import type { CountedEvent, EventKind } from "./events";
import type { ListedPullRequest } from "./list";

/**
 * What the chart narrows the list to: the pull requests merged on a day,
 * as a bar chooses them; those a member pushed to on a day, as a push
 * circle does; or those merged or pushed to within one hour of a day, as a
 * cell of the hours' heatmap does.
 */
export type Narrowing =
  | { readonly kind: "merged" | "pushed"; readonly day: string }
  | { readonly kind: "hour"; readonly day: string; readonly hour: number };

/**
 * The rows of `listed` that `narrowing` keeps, those with one of the
 * counted events it covers, newest first by the latest such event. Each
 * kept row's `latest` and `pushes` are taken within the narrowing's window,
 * its day or its hour of a day, rather than the period: `latest` is the
 * latest event the narrowing covers (a bar's merge, a circle's last push
 * that day, a cell's last merge or push in that hour), and `pushes` are the
 * members' pushes to it in the window. `events` are the period's counted
 * events the rows were listed from.
 */
export function narrowList(
  listed: readonly ListedPullRequest[],
  events: readonly CountedEvent[],
  narrowing: Narrowing,
): ListedPullRequest[] {
  const found = new Map<
    string,
    { latest: ListedPullRequest["latest"] | undefined; pushes: number }
  >();
  for (const event of events) {
    if (!isInWindow(narrowing, event)) {
      continue;
    }
    const id = event.pullRequest.id;
    const entry = found.get(id) ?? { latest: undefined, pushes: 0 };
    if (event.kind === "pushed") {
      entry.pushes += 1;
    }
    if (
      covers(narrowing, event.kind) &&
      (entry.latest === undefined ||
        event.at.getTime() >= entry.latest.at.getTime())
    ) {
      entry.latest = { kind: event.kind, at: event.at };
    }
    found.set(id, entry);
  }
  return listed
    .flatMap((row) => {
      const entry = found.get(row.pullRequest.id);
      return entry?.latest === undefined
        ? []
        : [{ ...row, latest: entry.latest, pushes: entry.pushes }];
    })
    .sort((a, b) => b.latest.at.getTime() - a.latest.at.getTime());
}

/** Whether `event` falls on the narrowing's day, and in its hour if it has one. */
function isInWindow(narrowing: Narrowing, event: CountedEvent): boolean {
  return (
    dayKeyOf(event.at) === narrowing.day &&
    (narrowing.kind !== "hour" || event.at.getHours() === narrowing.hour)
  );
}

/** Whether `narrowing` keeps a pull request for an event of `kind` in its window. */
function covers(narrowing: Narrowing, kind: EventKind): boolean {
  return narrowing.kind === "hour"
    ? kind !== "opened"
    : kind === narrowing.kind;
}
