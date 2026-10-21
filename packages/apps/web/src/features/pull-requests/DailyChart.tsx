import type { DayCounts, DayHourCounts } from "@yagura/activity";
import type { KeyboardEvent } from "react";
import { useElementWidth } from "../../shared";
import { chartGeometry, type Bar, type TextSpot } from "./chart-geometry";
import styles from "./DailyChart.module.css";
import { formatDay } from "./format";
import { heatmapGeometry } from "./heatmap-geometry";
import { HeatDescription, HourlyHeatmap } from "./HourlyHeatmap";
import type { ChartSelection } from "./selection";

/** The attributes that place a piece of text at `spot`. */
function placed({ x, y, anchor }: TextSpot) {
  return { x, y, textAnchor: anchor, dominantBaseline: "middle" } as const;
}

/**
 * A bar chart of the merged count of each day: a bar per day, with its
 * count written past its end. It counts merges only, as they are what tell
 * how often changes landed. It is drawn to the width it is given: a column
 * per day when the columns have room for their counts, else a row per day.
 * Each bar with a count is a button that chooses that day; choosing the
 * chosen one again clears the choice.
 *
 * Under the bars, the heatmap of `hours` shows when in each day the merges
 * happened, laid out to share the bars' days (see {@link HourlyHeatmap});
 * a cell chooses its hour as a bar chooses its day. The cells' shades need
 * no key; the figure's caption describes them to assistive technology
 * only. What both count is said by the heading of the card the chart is
 * drawn in.
 */
export function DailyChart(props: {
  readonly days: readonly DayCounts[];
  readonly hours: readonly DayHourCounts[];
  readonly selected: ChartSelection | null;
  readonly onSelect: (selection: ChartSelection | null) => void;
}) {
  const { days, hours, selected, onSelect } = props;
  // A bar is chosen only when no hour is.
  const chosenBar = selected?.hour === null ? selected : null;
  const { ref, width } = useElementWidth<HTMLDivElement>();

  /** Whether a day's bar is chosen, and what choosing it does. */
  const choice = (day: DayCounts) => {
    const pressed = chosenBar?.day === day.day;
    const choose = () =>
      onSelect(pressed ? null : { day: day.day, hour: null });
    return { pressed, choose };
  };

  const bar = (day: DayCounts, { rect }: Bar) => {
    const count = day.merged;
    const { pressed, choose } = choice(day);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        choose();
      }
    };
    const classes = [styles.bar, styles.mark];
    if (pressed) {
      classes.push(styles.pressed);
    }
    const label = `${formatDay(day.day)}, merged: ${count}`;
    return (
      <rect
        key={day.day}
        {...rect}
        className={classes.join(" ")}
        role="button"
        aria-label={label}
        {...(count > 0
          ? {
              tabIndex: 0,
              "aria-pressed": pressed,
              onClick: choose,
              onKeyDown,
            }
          : { "aria-disabled": true })}
      >
        <title>{label}</title>
      </rect>
    );
  };

  const chart = (width: number) => {
    const geometry = chartGeometry(days, width);
    const { height, ticks, groups } = geometry;
    const bars = (
      <svg
        width={width}
        height={height}
        className={
          chosenBar === null ? styles.chart : `${styles.chart} ${styles.chosen}`
        }
        role="group"
        aria-label="Merged pull requests per day"
      >
        <g aria-hidden="true">
          {ticks.map(({ value, line, label }) => (
            <g key={value}>
              <line
                {...line}
                className={value === 0 ? styles.baseline : styles.gridLine}
              />
              <text {...placed(label)} className={styles.axisLabel}>
                {value}
              </text>
            </g>
          ))}
          {groups.map(
            ({ day, label }) =>
              label !== null && (
                <text
                  key={day.day}
                  {...placed(label)}
                  className={styles.axisLabel}
                >
                  {formatDay(day.day)}
                </text>
              ),
          )}
        </g>
        {groups.map((group) => bar(group.day, group.bar))}
        {/*
          The counts, which the bars' names carry for assistive technology;
          a zero is not written, its empty bar shows it. A click on a count
          chooses its bar, which may be too short to hit.
        */}
        <g aria-hidden="true">
          {groups.map(
            ({ day, bar }) =>
              day.merged > 0 && (
                <text
                  key={day.day}
                  {...placed(bar.count)}
                  className={styles.count}
                  onClick={choice(day).choose}
                >
                  {day.merged}
                </text>
              ),
          )}
        </g>
      </svg>
    );
    return (
      <>
        {bars}
        <HourlyHeatmap
          geometry={heatmapGeometry(geometry)}
          hours={hours}
          selected={selected}
          onSelect={onSelect}
        />
      </>
    );
  };

  return (
    <figure className={styles.figure}>
      <div ref={ref} className={styles.frame}>
        {width !== null && chart(width)}
      </div>
      <HeatDescription hours={hours} />
    </figure>
  );
}
