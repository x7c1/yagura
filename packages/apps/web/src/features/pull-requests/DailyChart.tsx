import {
  measures,
  startOfDay,
  type DayCounts,
  type Measure,
} from "@yagura/activity";
import { useId, type CSSProperties, type KeyboardEvent } from "react";
import { chartGeometry, chartSize, type Rect } from "./chart-geometry";
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

/** The chart's widest, in CSS pixels: its own size, never scaled up. */
const chartWidth = { "--chart-width": `${chartSize.width}px` } as CSSProperties;

const measureLabels: Record<Measure, string> = {
  opened: "Opened",
  merged: "Merged",
};

/** A day key as its month and day, for example "Oct 3". */
function formatDay(day: string): string {
  return dayFormat.format(startOfDay(day));
}

/**
 * A bar chart of the opened and merged counts of each day: a group per day,
 * the opened bar solid and the merged bar hatched. Each bar with a count is
 * a button that chooses that day and kind; choosing the chosen one again
 * clears the choice.
 */
export function DailyChart(props: {
  readonly days: readonly DayCounts[];
  readonly selected: DaySelection | null;
  readonly onSelect: (selection: DaySelection | null) => void;
}) {
  const { days, selected, onSelect } = props;
  const hatch = `${useId()}-hatch`;
  const { plot, ticks, groups } = chartGeometry(days);
  // The merged bars are filled with the hatch, which only an attribute can
  // refer to by its generated id; the opened bars are filled by their class.
  const fills: Record<Measure, string | undefined> = {
    opened: undefined,
    merged: `url(#${hatch})`,
  };
  const bottom = plot.y + plot.height;

  const bar = (day: DayCounts, measure: Measure, rect: Rect) => {
    const count = day[measure];
    const pressed = selected?.day === day.day && selected.measure === measure;
    const choose = () => onSelect(pressed ? null : { day: day.day, measure });
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
    const label = `${formatDay(day.day)}: ${count} ${measure}`;
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
        {/* The exact count on hover, which the y axis only approximates. */}
        <title>{label}</title>
      </rect>
    );
  };

  return (
    <figure className={styles.figure}>
      <svg
        viewBox={`0 0 ${chartSize.width} ${chartSize.height}`}
        width="100%"
        className={
          selected === null ? styles.chart : `${styles.chart} ${styles.chosen}`
        }
        style={chartWidth}
        role="group"
        aria-label="Opened and merged pull requests per day"
        fontSize={11}
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
          {ticks.map(({ value, y }) => (
            <g key={value}>
              <line
                x1={plot.x}
                x2={plot.x + plot.width}
                y1={y}
                y2={y}
                className={value === 0 ? styles.baseline : styles.gridLine}
              />
              <text
                x={plot.x - 6}
                y={y}
                textAnchor="end"
                dominantBaseline="middle"
                className={styles.axisLabel}
              >
                {value}
              </text>
            </g>
          ))}
          {groups.map(
            ({ day, center, labelled }) =>
              labelled && (
                <text
                  key={day.day}
                  x={center}
                  y={bottom + 16}
                  textAnchor="middle"
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
      </svg>
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
