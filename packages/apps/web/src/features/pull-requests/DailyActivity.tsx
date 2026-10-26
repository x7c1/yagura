import {
  countByDay,
  countByHour,
  narrowList,
  periodDays,
  type CountedEvent,
  type ListedPullRequest,
  type Narrowing,
  type Period,
} from "@yagura/activity";
import { useState } from "react";
import { buttonStyles, sectionStyles, useStoredSwitch } from "../../shared";
import styles from "./DailyActivity.module.css";
import { DailyChart } from "./DailyChart";
import { PullRequestList } from "./PullRequestList";
import { SectionHeading, UpdatingNote } from "./SectionHeading";
import { describeSelection, selectionKey } from "./selection";

/**
 * The key under which the browser remembers whether the list shows bots'
 * pull requests.
 */
export const showBotsKey = "yagura.show-bot-pull-requests";

/**
 * The chart of the merged counts per day, with the members' pushes in a
 * row of circles above the bars and the heatmap of the hours of both under
 * them, and the list of pull requests below. The chart's card carries the
 * page's heading, "Merged PRs", which says what its bars count, and the
 * list's card has none of its own: it is the detail of the period the
 * chart covers. Choosing a bar narrows the list to the pull requests merged
 * on that day, a push circle to those a member pushed to that day, and a
 * cell of the heatmap to those merged or pushed to within that hour of the
 * day, until it is chosen again, another is chosen, or the narrowing is
 * cleared. While the list is narrowed, its pushes and dates are those of
 * the chosen day or hour rather than of the period. While `updating`, a note at the right of the chart's heading
 * says so.
 *
 * Bots' pull requests are left out of the list unless the viewer chooses
 * to show them, a choice the browser remembers; a button above the list
 * says how many it leaves out, of the narrowed list when the chart narrows
 * it.
 *
 * Where the page fits the window, the list's card takes the height the
 * chart leaves, and the list scrolls inside it under the lines above it. A
 * card with only notes keeps its natural height instead, so that it does
 * not stretch to the bottom as an empty box.
 */
export function DailyActivity(props: {
  readonly org: string;
  readonly events: readonly CountedEvent[];
  readonly listed: readonly ListedPullRequest[];
  readonly period: Period;
  readonly updating: boolean;
}) {
  const { org, events, listed, period, updating } = props;
  const [selected, setSelected] = useState<Narrowing | null>(null);
  const [showBots, setShowBots] = useStoredSwitch(showBotsKey);
  const narrowed =
    selected === null ? listed : narrowList(listed, events, selected);
  const bots = narrowed.filter(({ byBot }) => byBot).length;
  const shown = showBots ? narrowed : narrowed.filter(({ byBot }) => !byBot);

  return (
    <>
      <section className={sectionStyles.section}>
        <SectionHeading aside={<UpdatingNote updating={updating} />}>
          Merged PRs
        </SectionHeading>
        <DailyChart
          days={countByDay(events, period)}
          hours={countByHour(events, period)}
          selected={selected}
          onSelect={setSelected}
        />
      </section>
      <section
        className={
          shown.length === 0
            ? sectionStyles.section
            : `${sectionStyles.section} ${styles.listSection}`
        }
      >
        {(selected !== null || bots > 0) && (
          <div className={styles.lines}>
            {selected !== null && (
              <p className={styles.line}>
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
            {bots > 0 && (
              <p className={`${styles.line} ${styles.bots}`}>
                {/*
                 * The label says what the button does next, so it carries
                 * no pressed state: "Hide …, pressed" would read as the
                 * opposite of what is shown.
                 */}
                <button
                  type="button"
                  className={buttonStyles.quiet}
                  onClick={() => setShowBots(!showBots)}
                >
                  {showBots
                    ? `Hide ${botPullRequests(bots)}`
                    : `Show ${botPullRequests(bots)}`}
                </button>
              </p>
            )}
          </div>
        )}
        {shown.length === 0 ? (
          <p className={sectionStyles.note}>
            {bots > 0
              ? "Only bots' pull requests here."
              : `No pull requests by ${org}'s members in the last ${periodDays} days.`}
          </p>
        ) : (
          <PullRequestList
            // A new narrowing draws the list afresh, so that it is read
            // from its top rather than at where the previous one was
            // scrolled to.
            key={selectionKey(selected)}
            pullRequests={shown}
          />
        )}
      </section>
    </>
  );
}

/** "1 bot pull request", "12 bot pull requests". */
function botPullRequests(count: number): string {
  return count === 1 ? "1 bot pull request" : `${count} bot pull requests`;
}
