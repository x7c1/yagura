import {
  countByDay,
  countByHour,
  periodDays,
  pullRequestsInHour,
  pullRequestsOn,
  type Period,
  type PullRequest,
} from "@yagura/activity";
import type { Member } from "@yagura/github-api";
import { useState } from "react";
import { buttonStyles, sectionStyles } from "../../shared";
import styles from "./DailyActivity.module.css";
import { DailyChart } from "./DailyChart";
import { PullRequestList } from "./PullRequestList";
import { SectionHeading, UpdatingNote } from "./SectionHeading";
import { describeSelection, type ChartSelection } from "./selection";

/**
 * The chart of the merged counts per day, with the heatmap of their hours
 * under it, and the list of pull requests below them, with the avatars of
 * the authors among `members`. The chart's card carries the page's heading,
 * "Merged PRs", which says what the chart counts, and the list's card has
 * none of its own: it is the detail of the period the chart covers, every
 * pull request opened or merged in it. Choosing a bar in the chart narrows
 * the list to the pull requests merged on that day, and choosing a cell of
 * the heatmap to those merged within that hour of the day, until it is
 * chosen again, another is chosen, or the narrowing is cleared. While
 * `updating`, a note at the right of the chart's heading says so.
 *
 * Where the page fits the window, the list's card takes the height the
 * chart leaves, and the list scrolls inside it under the narrowing's line,
 * if any. A card with only a note keeps its natural height instead, so that
 * it does not stretch to the bottom as an empty box.
 */
export function DailyActivity(props: {
  readonly org: string;
  readonly members: readonly Member[];
  readonly pullRequests: readonly PullRequest[];
  readonly period: Period;
  readonly updating: boolean;
}) {
  const { org, members, pullRequests, period, updating } = props;
  const [selected, setSelected] = useState<ChartSelection | null>(null);
  const listed = narrowed(pullRequests, period, selected);

  return (
    <>
      <section className={sectionStyles.section}>
        <SectionHeading aside={<UpdatingNote updating={updating} />}>
          Merged PRs
        </SectionHeading>
        <DailyChart
          days={countByDay(pullRequests, period)}
          hours={countByHour(pullRequests, period)}
          selected={selected}
          onSelect={setSelected}
        />
      </section>
      <section
        className={
          listed.length === 0
            ? sectionStyles.section
            : `${sectionStyles.section} ${styles.listSection}`
        }
      >
        {selected !== null && (
          <p className={styles.selection}>
            {describeSelection(selected)} ·{" "}
            <button
              type="button"
              className={buttonStyles.quiet}
              onClick={() => setSelected(null)}
            >
              Show all
            </button>
          </p>
        )}
        {listed.length === 0 ? (
          <p
            className={sectionStyles.note}
          >{`No pull requests by ${org}'s members in the last ${periodDays} days.`}</p>
        ) : (
          <PullRequestList
            // A new narrowing draws the list afresh, so that it is read
            // from its top rather than at where the previous one was
            // scrolled to.
            key={selectionKey(selected)}
            pullRequests={listed}
            period={period}
            members={members}
          />
        )}
      </section>
    </>
  );
}

/** The pull requests the list shows with `selected` chosen in the chart. */
function narrowed(
  pullRequests: readonly PullRequest[],
  period: Period,
  selected: ChartSelection | null,
): readonly PullRequest[] {
  if (selected === null) {
    return pullRequests;
  }
  const { day, hour } = selected;
  return hour === null
    ? pullRequestsOn(pullRequests, period, day, "merged")
    : pullRequestsInHour(pullRequests, period, day, hour, "merged");
}

/** What tells one narrowing of the list from another, or from none. */
function selectionKey(selected: ChartSelection | null): string {
  return selected === null
    ? "all"
    : `${selected.day}:${selected.hour ?? "day"}`;
}
