import {
  countByDay,
  periodDays,
  pullRequestsOn,
  type Period,
  type PullRequest,
} from "@yagura/activity";
import { useState } from "react";
import { DailyChart, describeSelection, type DaySelection } from "./DailyChart";
import { PullRequestList } from "./PullRequestList";

/**
 * The chart of the opened and merged counts per day, and the list of pull
 * requests below it. Choosing a bar in the chart narrows the list to that
 * day's pull requests of that kind, until it is chosen again or the
 * narrowing is cleared.
 */
export function DailyActivity(props: {
  readonly org: string;
  readonly pullRequests: readonly PullRequest[];
  readonly period: Period;
}) {
  const { org, pullRequests, period } = props;
  const [selected, setSelected] = useState<DaySelection | null>(null);
  const listed =
    selected === null
      ? pullRequests
      : pullRequestsOn(pullRequests, period, selected.day, selected.measure);

  return (
    <>
      <section>
        <h3>Per day</h3>
        <DailyChart
          days={countByDay(pullRequests, period)}
          selected={selected}
          onSelect={setSelected}
        />
      </section>
      <section>
        <h3>Pull requests</h3>
        {selected !== null && (
          <p>
            {describeSelection(selected)} ·{" "}
            <button type="button" onClick={() => setSelected(null)}>
              Show all
            </button>
          </p>
        )}
        {listed.length === 0 ? (
          <p>{`No pull requests by ${org}'s members in the last ${periodDays} days.`}</p>
        ) : (
          <PullRequestList pullRequests={listed} period={period} />
        )}
      </section>
    </>
  );
}
