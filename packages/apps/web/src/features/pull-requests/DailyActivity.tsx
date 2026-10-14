import {
  countByDay,
  periodDays,
  pullRequestsOn,
  type Period,
  type PullRequest,
} from "@yagura/activity";
import type { Member } from "@yagura/github-api";
import { useState } from "react";
import { buttonStyles, sectionStyles } from "../../shared";
import styles from "./DailyActivity.module.css";
import { DailyChart, describeSelection, type DaySelection } from "./DailyChart";
import { PullRequestList } from "./PullRequestList";
import { SectionHeading, UpdatingNote } from "./SectionHeading";

/**
 * The chart of the opened and merged counts per day, and the list of pull
 * requests below it, with the avatars of the authors among `members`. The
 * chart's card carries the page's heading, "Pull requests", and the list's
 * card has none of its own: it is the detail of what the chart counts.
 * Choosing a bar in the chart narrows the list to that day's pull requests
 * of that kind, until it is chosen again or the narrowing is cleared. While
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
  const [selected, setSelected] = useState<DaySelection | null>(null);
  const listed =
    selected === null
      ? pullRequests
      : pullRequestsOn(pullRequests, period, selected.day, selected.measure);

  return (
    <>
      <section className={sectionStyles.section}>
        <SectionHeading aside={<UpdatingNote updating={updating} />}>
          Pull requests
        </SectionHeading>
        <DailyChart
          days={countByDay(pullRequests, period)}
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

/** What tells one narrowing of the list from another, or from none. */
function selectionKey(selected: DaySelection | null): string {
  return selected === null ? "all" : `${selected.day}:${selected.measure}`;
}
