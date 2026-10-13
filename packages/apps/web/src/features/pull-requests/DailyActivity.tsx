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

/**
 * The chart of the opened and merged counts per day, and the list of pull
 * requests below it, with the avatars of the authors among `members`.
 * Choosing a bar in the chart narrows the list to that day's pull requests
 * of that kind, until it is chosen again or the narrowing is cleared.
 */
export function DailyActivity(props: {
  readonly org: string;
  readonly members: readonly Member[];
  readonly pullRequests: readonly PullRequest[];
  readonly period: Period;
}) {
  const { org, members, pullRequests, period } = props;
  const [selected, setSelected] = useState<DaySelection | null>(null);
  const listed =
    selected === null
      ? pullRequests
      : pullRequestsOn(pullRequests, period, selected.day, selected.measure);

  return (
    <>
      <section className={sectionStyles.section}>
        <h3 className={sectionStyles.heading}>Per day</h3>
        <DailyChart
          days={countByDay(pullRequests, period)}
          selected={selected}
          onSelect={setSelected}
        />
      </section>
      <section className={sectionStyles.section}>
        <h3 className={sectionStyles.heading}>Pull requests</h3>
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
            pullRequests={listed}
            period={period}
            members={members}
          />
        )}
      </section>
    </>
  );
}
