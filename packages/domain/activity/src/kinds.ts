import { dayKeyOf, periodDayKeys } from "./days";
import type { CountedEvent } from "./events";
import type { Period } from "./period";

/**
 * The type at the start of a title in the Conventional Commits form
 * (https://www.conventionalcommits.org/): a word, then an optional scope in
 * parentheses, an optional `!`, and a colon, with nothing between them.
 */
const typePrefix = /^([a-z]+)(?:\([^()]*\))?!?:/i;

/**
 * The kind of a pull request with the title `title`: the type its title
 * starts with in the Conventional Commits form, in lower case, so that
 * `feat(web): …` and `Feat: …` are both `feat`, and `fix!: …` is `fix`.
 * A title without that form, such as one with no colon or a space before
 * it, has no kind (null).
 */
export function kindOfTitle(title: string): string | null {
  const type = typePrefix.exec(title)?.[1];
  return type === undefined ? null : type.toLowerCase();
}

/**
 * The groups the merges of a period are split into by kind, in the order
 * they are drawn from the end of a bar toward its axis: `feat`, `fix`, the
 * third kind of the period ({@link MergedKinds.third}), and `other`, which
 * takes every merge in none of the first three, those without a kind
 * included.
 */
export type KindGroup = "feat" | "fix" | "third" | "other";

/** The {@link KindGroup}s in the order they are drawn and named. */
export const kindGroups: readonly KindGroup[] = [
  "feat",
  "fix",
  "third",
  "other",
];

/** How many pull requests of each {@link KindGroup} were merged on one day. */
export interface DayKinds {
  /** The day, as a {@link dayKeyOf} key. */
  readonly day: string;
  readonly merged: Readonly<Record<KindGroup, number>>;
}

/** The merges of a period, split by the kind of their pull requests. */
export interface MergedKinds {
  /**
   * The kind the `third` group holds, the same for every day of the
   * period, or null when the period has no merge of a kind other than
   * `feat` and `fix`; the `third` group is then empty.
   */
  readonly third: string | null;
  /**
   * Each day of the period, oldest first, every day present, its groups
   * adding up to its merged count in `countByDay`.
   */
  readonly days: readonly DayKinds[];
}

/**
 * The name a group is shown under: its kind, `other` for the rest, or for
 * the third group, the kind it holds in the period (see
 * {@link MergedKinds.third}).
 */
export function kindGroupName(group: KindGroup, third: string | null): string {
  return group === "third" ? (third ?? "") : group;
}

/**
 * The merges of the period, each counted on its local day in the group of
 * its pull request's kind. The third group is chosen once for the whole
 * period, not per day: the kind, other than `feat` and `fix`, with the
 * most merges in the period, a tie going to the name that sorts first. A
 * pull request without a kind is never chosen.
 */
export function countKindsByDay(
  events: readonly CountedEvent[],
  period: Period,
): MergedKinds {
  const days = new Map(
    periodDayKeys(period).map((day) => [
      day,
      { feat: 0, fix: 0, third: 0, other: 0 },
    ]),
  );
  const merges = events.flatMap((event) => {
    const day = days.get(dayKeyOf(event.at));
    return event.kind === "merged" && day !== undefined
      ? [{ day, kind: kindOfTitle(event.pullRequest.title) }]
      : [];
  });
  const third = thirdKind(merges.map(({ kind }) => kind));
  for (const { day, kind } of merges) {
    day[groupOf(kind, third)] += 1;
  }
  return {
    third,
    days: [...days].map(([day, merged]) => ({ day, merged })),
  };
}

/**
 * The kind, other than `feat` and `fix`, that `kinds` hold most often, a
 * tie going to the name that sorts first, or null when they hold none.
 */
function thirdKind(kinds: readonly (string | null)[]): string | null {
  const counts = new Map<string, number>();
  for (const kind of kinds) {
    if (kind !== null && kind !== "feat" && kind !== "fix") {
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    }
  }
  let chosen: { kind: string; count: number } | null = null;
  for (const [kind, count] of counts) {
    if (
      chosen === null ||
      count > chosen.count ||
      (count === chosen.count && kind < chosen.kind)
    ) {
      chosen = { kind, count };
    }
  }
  return chosen?.kind ?? null;
}

/** The group a merge of `kind` falls into, with `third` the third kind. */
function groupOf(kind: string | null, third: string | null): KindGroup {
  if (kind === "feat" || kind === "fix") {
    return kind;
  }
  return kind !== null && kind === third ? "third" : "other";
}
