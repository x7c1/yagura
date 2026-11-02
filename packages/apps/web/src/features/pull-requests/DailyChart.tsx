import {
  type DayCounts,
  type DayHourCounts,
  type KindGroup,
  type MergedKinds,
  type Narrowing,
} from "@yagura/activity";
import type { KeyboardEvent } from "react";
import { useElementWidth } from "../../shared";
import {
  chartGeometry,
  segmentGaps,
  stackSegments,
  type Bar,
  type ChartLayout,
  type Circle,
  type TextSpot,
} from "./chart-geometry";
import styles from "./DailyChart.module.css";
import {
  formatDay,
  formatDayLabels,
  formatMergedDay,
  formatPushes,
} from "./format";
import { heatmapGeometry } from "./heatmap-geometry";
import { HeatDescription, HourlyHeatmap } from "./HourlyHeatmap";
import { kindClasses } from "./KindLegend";
import { weekLines } from "./week-lines";
import { WeekLineMarks } from "./WeekLineMarks";

/** The attributes that place a piece of text at `spot`. */
function placed({ x, y, anchor }: TextSpot) {
  return { x, y, textAnchor: anchor, dominantBaseline: "middle" } as const;
}

/** A day without merges of any kind. */
const noKinds: Readonly<Record<KindGroup, number>> = {
  feat: 0,
  fix: 0,
  third: 0,
  other: 0,
};

/** Runs `choose` on Enter or Space, as a button does. */
function onButtonKey(choose: () => void) {
  return (event: KeyboardEvent) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose();
    }
  };
}

/**
 * A bar chart of the merged count of each day: a bar per day, with its
 * count written past its end. Its bars count merges, as they are what tell
 * how often changes landed. Each bar is a stack of the day's merges by the
 * kind of their pull requests, in `mergedGroups`: those of `feat`, `fix`,
 * the period's third kind and `other` that the period has merges of, from
 * the end of the bar toward the axis, each group in a colour of its own, with a 1px gap in the card's colour between
 * neighbouring segments. The legend that names the groups is drawn beside
 * the card's heading, from the same `mergedGroups` (see `KindLegend`).
 * A row labelled "Pushes" holds a circle per
 * day with the members' pushes of that day, so that days spent iterating on
 * a pull request show too; a day without pushes has no circle. Pushes are drawn apart from the bars, on no axis, as they are
 * counted on a scale of their own. The chart is drawn to the width it is
 * given: a column per day when the columns have room for their counts,
 * with the push circles in a row of their own under the heatmap, each
 * under its day's column, else a row per day, the push circle next to the
 * date. A line between each Saturday and the Sunday after it, through the
 * bars, the heatmap and the push row, tells the weeks apart (see
 * {@link weekLines}). Each bar or circle
 * with a count is a button that chooses that day's merges or pushes;
 * choosing the chosen one again clears the choice.
 *
 * Under the bars, the heatmap of `hours` shows when in each day the
 * pushes and merges happened, laid out to share the bars' days (see
 * {@link HourlyHeatmap}); a cell chooses its hour as a bar chooses its
 * day. The cells' shades need no key; the figure's caption describes them
 * to assistive technology only. What the bars count is said by the heading
 * of the card the chart is drawn in.
 */
export function DailyChart(props: {
  readonly days: readonly DayCounts[];
  readonly kinds: MergedKinds;
  readonly mergedGroups: readonly KindGroup[];
  readonly hours: readonly DayHourCounts[];
  readonly selected: Narrowing | null;
  readonly onSelect: (selection: Narrowing | null) => void;
}) {
  const { days, kinds, mergedGroups, hours, selected, onSelect } = props;
  const kindsOfDay = new Map(kinds.days.map((day) => [day.day, day.merged]));
  // A bar or a circle is chosen only when no hour is.
  const chosenDay = selected?.kind === "hour" ? null : selected;
  const { ref, width } = useElementWidth<HTMLDivElement>();

  /**
   * Whether a day's bar (`merged`) or circle (`pushed`) is chosen, and what
   * choosing it does.
   */
  const choice = (day: DayCounts, kind: "merged" | "pushed") => {
    const pressed = chosenDay?.kind === kind && chosenDay.day === day.day;
    const choose = () => onSelect(pressed ? null : { kind, day: day.day });
    return { pressed, choose };
  };

  /**
   * A day's bar: its segments, one per group of kinds it has merges of,
   * the gaps between them, and over them the button that chooses the day,
   * as large as the whole bar and unpainted but for its outline when it is
   * chosen or focused, so that a segment is not chosen on its own.
   */
  const bar = (day: DayCounts, { rect }: Bar, layout: ChartLayout) => {
    const count = day.merged;
    const { pressed, choose } = choice(day, "merged");
    const onKeyDown = onButtonKey(choose);
    const classes = [styles.bar];
    if (pressed) {
      classes.push(styles.pressed);
    }
    const merged = kindsOfDay.get(day.day) ?? noKinds;
    const segments = stackSegments(
      layout,
      rect,
      mergedGroups.map((group) => merged[group]),
    );
    const label = formatMergedDay(day.day, merged, kinds.third);
    return (
      <g
        key={day.day}
        className={
          pressed ? `${styles.stack} ${styles.pressedStack}` : styles.stack
        }
      >
        {segments.map(({ index, rect }) => (
          <rect
            key={index}
            {...rect}
            className={`${styles.segment} ${kindClasses[mergedGroups[index] ?? "other"] ?? ""}`}
          />
        ))}
        {segmentGaps(layout, segments).map((line, index) => (
          <line key={index} {...line} className={styles.segmentGap} />
        ))}
        <rect
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
      </g>
    );
  };

  /**
   * A day's push circle, with its count on it, or nothing on a day without
   * pushes. The count is part of the circle's button, so a click on it
   * chooses the circle too.
   */
  const push = (day: DayCounts, { cx, cy, r }: Circle) => {
    const count = day.pushed;
    if (count === 0) {
      return null;
    }
    const { pressed, choose } = choice(day, "pushed");
    const label = `${formatDay(day.day)}, ${formatPushes(count)}`;
    const classes = [styles.push];
    if (pressed) {
      classes.push(styles.pressed);
    }
    return (
      <g
        key={day.day}
        className={classes.join(" ")}
        role="button"
        aria-label={label}
        aria-pressed={pressed}
        tabIndex={0}
        onClick={choose}
        onKeyDown={onButtonKey(choose)}
      >
        <title>{label}</title>
        <circle cx={cx} cy={cy} r={r} className={styles.pushCircle} />
        <text
          {...placed({ x: cx, y: cy, anchor: "middle" })}
          className={styles.pushCount}
          aria-hidden="true"
        >
          {count}
        </text>
      </g>
    );
  };

  const chartClass =
    chosenDay === null ? styles.chart : `${styles.chart} ${styles.chosen}`;

  const chart = (width: number) => {
    const geometry = chartGeometry(days, width);
    const { layout, height, ticks, groups, pushLabel, pushRow } = geometry;
    const heatmap = heatmapGeometry(geometry);
    const weeks = weekLines(geometry, heatmap);
    const dayLabels = formatDayLabels(
      groups
        .filter((group) => group.label !== null)
        .map((group) => group.day.day),
    );
    const pushes = (
      <>
        <text {...placed(pushLabel)} className={styles.pushLabel}>
          Pushes
        </text>
        <g role="group" aria-label="Pushes per day">
          {groups.map((group) => push(group.day, group.push))}
        </g>
      </>
    );
    const bars = (
      <svg
        width={width}
        height={height}
        className={chartClass}
        role="group"
        aria-label="Merged pull requests and pushes per day"
      >
        {pushRow === null && pushes}
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
                  {dayLabels.get(day.day)}
                </text>
              ),
          )}
        </g>
        <WeekLineMarks lines={weeks.bars} />
        <g role="group" aria-label="Merged pull requests per day">
          {groups.map((group) => bar(group.day, group.bar, layout))}
        </g>
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
                  onClick={choice(day, "merged").choose}
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
          geometry={heatmap}
          weekLines={weeks.heatmap}
          hours={hours}
          selected={selected}
          onSelect={onSelect}
        />
        {pushRow !== null && (
          <svg width={width} height={pushRow.height} className={chartClass}>
            <WeekLineMarks lines={weeks.pushRow} />
            {pushes}
          </svg>
        )}
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
