import {
  kindGroupName,
  kindGroups,
  type KindGroup,
  type MergedKinds,
} from "@yagura/activity";
import styles from "./DailyChart.module.css";

/** The class that gives a group of kinds its colour. */
export const kindClasses: Readonly<Record<KindGroup, string | undefined>> = {
  feat: styles.kindFeat,
  fix: styles.kindFix,
  third: styles.kindThird,
  other: styles.kindOther,
};

/**
 * The groups of kinds that have a merge in the period of `kinds`, in the
 * order the bars draw them. Both the bars and the legend are drawn from
 * them, so that the legend names the groups the bars draw and no others.
 */
export function mergedKindGroups(kinds: MergedKinds): readonly KindGroup[] {
  return kindGroups.filter((group) =>
    kinds.days.some((day) => day.merged[group] > 0),
  );
}

/**
 * The key to the colours of the bars' `groups` of kinds, in their order;
 * nothing without groups, when the period has no merges. It is drawn at
 * the right of the chart's heading, and its items wrap onto more lines
 * rather than widening the page.
 */
export function KindLegend(props: {
  readonly groups: readonly KindGroup[];
  readonly third: string | null;
}) {
  const { groups, third } = props;
  if (groups.length === 0) {
    return null;
  }
  return (
    <ul className={styles.legend} aria-label="Kinds of merged pull requests">
      {groups.map((group) => (
        <li
          key={group}
          className={`${styles.legendItem} ${kindClasses[group] ?? ""}`}
        >
          <span className={styles.swatch} aria-hidden="true" />
          <span className={styles.legendName}>
            {kindGroupName(group, third)}
          </span>
        </li>
      ))}
    </ul>
  );
}
