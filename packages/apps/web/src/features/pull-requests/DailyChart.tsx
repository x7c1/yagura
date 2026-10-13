import {
  measures,
  startOfDay,
  type DayCounts,
  type Measure,
} from "@yagura/activity";
import { useId, type KeyboardEvent } from "react";
import { useElementWidth } from "../../shared";
import { chartGeometry, type Bar, type TextSpot } from "./chart-geometry";
import styles from "./DailyChart.module.css";
import { dayFormat } from "./format";

/** A day's opened or merged pull requests, as chosen in the chart. */
export interface DaySelection {
  readonly day: string;
  readonly measure: Measure;
}

/**
 * The class of each kind's bars and swatches, which colours them from the
 * theme's tokens.
 */
const measureClasses: Record<Measure, string | undefined> = {
  opened: styles.opened,
  merged: styles.merged,
};

/** The class of each kind's counts, in the kind's colour. */
const countClasses: Record<Measure, string | undefined> = {
  opened: styles.openedCount,
  merged: styles.mergedCount,
};

const measureLabels: Record<Measure, string> = {
  opened: "Opened",
  merged: "Merged",
};

/** A day key as its month and day, for example "Oct 3". */
function formatDay(day: string): string {
  return dayFormat.format(startOfDay(day));
}

/** The attributes that place a piece of text at `spot`. */
function placed({ x, y, anchor }: TextSpot) {
  return { x, y, textAnchor: anchor, dominantBaseline: "middle" } as const;
}

/**
 * A bar chart of the opened and merged counts of each day: a group per day,
 * the opened bar solid and the merged bar hatched, each with its count
 * written past its end. It is drawn to the width it is given: a column per
 * day when the columns have room for their counts, else a row per day. Each
 * bar with a count is a button that chooses that day and kind; choosing the
 * chosen one again clears the choice.
 */
export function DailyChart(props: {
  readonly days: readonly DayCounts[];
  readonly selected: DaySelection | null;
  readonly onSelect: (selection: DaySelection | null) => void;
}) {
  const { days, selected, onSelect } = props;
  const hatch = `${useId()}-hatch`;
  const { ref, width } = useElementWidth<HTMLDivElement>();
  // The merged bars are filled with the hatch, which only an attribute can
  // refer to by its generated id; the opened bars are filled by their class.
  const fills: Record<Measure, string | undefined> = {
    opened: undefined,
    merged: `url(#${hatch})`,
  };

  /** Whether a day's bar of `measure` is chosen, and what choosing it does. */
  const choice = (day: DayCounts, measure: Measure) => {
    const pressed = selected?.day === day.day && selected.measure === measure;
    const choose = () => onSelect(pressed ? null : { day: day.day, measure });
    return { pressed, choose };
  };

  const bar = (day: DayCounts, measure: Measure, { rect }: Bar) => {
    const count = day[measure];
    const { pressed, choose } = choice(day, measure);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        choose();
      }
    };
    const classes = [styles.bar, measureClasses[measure]];
    if (pressed) {
      classes.push(styles.pressed);
    }
    const label = `${formatDay(day.day)}, ${measure}: ${count}`;
    return (
      <rect
        key={measure}
        {...rect}
        className={classes.join(" ")}
        fill={fills[measure]}
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
    const { height, ticks, groups } = chartGeometry(days, width);
    return (
      <svg
        width={width}
        height={height}
        className={
          selected === null ? styles.chart : `${styles.chart} ${styles.chosen}`
        }
        role="group"
        aria-label="Opened and merged pull requests per day"
      >
        <defs>
          <pattern
            id={hatch}
            width={4}
            height={4}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width={2} height={4} className={styles.hatch} />
          </pattern>
        </defs>
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
        {groups.map((group) => (
          <g key={group.day.day}>
            {measures.map((measure) => bar(group.day, measure, group[measure]))}
          </g>
        ))}
        {/*
          The counts, which the bars' names carry for assistive technology.
          A click on a count chooses its bar, which may be too short to hit.
        */}
        <g aria-hidden="true">
          {groups.map((group) =>
            measures.map((measure) => {
              const count = group.day[measure];
              return (
                <text
                  key={`${group.day.day}-${measure}`}
                  {...placed(group[measure].count)}
                  className={`${styles.count} ${
                    count === 0
                      ? styles.zeroCount
                      : `${countClasses[measure]} ${styles.choosableCount}`
                  }`}
                  onClick={
                    count > 0 ? choice(group.day, measure).choose : undefined
                  }
                >
                  {count}
                </text>
              );
            }),
          )}
        </g>
      </svg>
    );
  };

  return (
    <figure className={styles.figure}>
      <div ref={ref} className={styles.frame}>
        {width !== null && chart(width)}
      </div>
      <figcaption>
        <ul className={styles.legend}>
          {measures.map((measure) => (
            <li key={measure} className={styles.legendItem}>
              <svg width={12} height={12} aria-hidden="true">
                <rect
                  x={0.5}
                  y={0.5}
                  width={11}
                  height={11}
                  className={measureClasses[measure]}
                  fill={fills[measure]}
                />
              </svg>{" "}
              {measureLabels[measure]}
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}

/** What the list is narrowed to, for example "Merged on Oct 3". */
export function describeSelection({ day, measure }: DaySelection): string {
  return `${measureLabels[measure]} on ${formatDay(day)}`;
}
