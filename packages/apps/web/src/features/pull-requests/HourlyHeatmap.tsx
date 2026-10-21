import {
  hoursPerDay,
  type DayCounts,
  type DayHourCounts,
} from "@yagura/activity";
import { useRef, useState, type KeyboardEvent } from "react";
import styles from "./DailyChart.module.css";
import { formatDay, formatHour } from "./format";
import {
  heatStep,
  heatSteps,
  type HeatmapGeometry,
  type HeatGroup,
} from "./heatmap-geometry";
import type { ChartSelection } from "./selection";

/**
 * The class of each strength of a cell, from the empty cell's up to the
 * strongest, which colours it from the theme's tokens.
 */
const stepClasses: readonly (string | undefined)[] = [
  styles.emptyCell,
  styles.step1,
  styles.step2,
  styles.step3,
  styles.step4,
];

/** A cell's place: the index of its day, in the days' order, and its hour. */
interface CellPosition {
  readonly day: number;
  readonly hour: number;
}

/** Keeps `value` within 0 and `last`. */
function clamp(value: number, last: number): number {
  return Math.min(Math.max(value, 0), last);
}

/**
 * The heatmap of the hours of each day the pull requests were merged in,
 * drawn under the bar chart as laid out by `geometry`, with the counts of
 * `hours`, a day per group of `geometry` in the same order. Each cell with a
 * count chooses its day and hour, as a bar chooses its day; choosing the
 * chosen one again clears the choice.
 *
 * It is a grid of one tab stop: the arrow keys move between its cells, the
 * way they are laid out, Home and End to the ends of a line, and Enter or
 * Space chooses the cell with focus. The cell that takes focus on entering
 * is the one last moved to, else the chosen one, else the first with a
 * count.
 */
export function HourlyHeatmap(props: {
  readonly geometry: HeatmapGeometry<DayCounts>;
  readonly hours: readonly DayHourCounts[];
  readonly selected: ChartSelection | null;
  readonly onSelect: (selection: ChartSelection | null) => void;
}) {
  const { geometry, hours, selected, onSelect } = props;
  const grid = useRef<SVGSVGElement>(null);
  const [moved, setMoved] = useState<CellPosition | null>(null);
  const max = busiestHour(hours);
  const days = geometry.groups.length;

  const countAt = ({ day, hour }: CellPosition): number =>
    hours[day]?.merged[hour] ?? 0;

  const chosen = (): CellPosition | null => {
    if (selected === null || selected.hour === null) {
      return null;
    }
    const day = hours.findIndex((d) => d.day === selected.day);
    return day < 0 ? null : { day, hour: selected.hour };
  };

  const firstWithCount = (): CellPosition | null => {
    for (let hour = 0; hour < hoursPerDay; hour += 1) {
      for (let day = 0; day < days; day += 1) {
        if (countAt({ day, hour }) > 0) {
          return { day, hour };
        }
      }
    }
    return null;
  };

  const active = moved ?? chosen() ?? firstWithCount() ?? { day: 0, hour: 0 };

  const isChosen = ({ day, hour }: CellPosition): boolean =>
    selected !== null &&
    selected.hour === hour &&
    selected.day === hours[day]?.day;

  const choose = (position: CellPosition) => {
    const day = hours[position.day]?.day;
    if (countAt(position) === 0 || day === undefined) {
      return;
    }
    onSelect(isChosen(position) ? null : { day, hour: position.hour });
  };

  /** Moves focus to the cell at `position`, making it the tab stop. */
  const focus = (position: CellPosition) => {
    setMoved(position);
    grid.current
      ?.querySelector<SVGRectElement>(
        `[data-cell="${position.day}-${position.hour}"]`,
      )
      ?.focus();
  };

  /**
   * Where a key moves focus from `from`. Under the columns, the hours run
   * down and the days across; beside the rows, the days run down and the
   * hours across.
   */
  const destination = (
    key: string,
    from: CellPosition,
  ): CellPosition | null => {
    const across = geometry.layout === "columns" ? "day" : "hour";
    const down = geometry.layout === "columns" ? "hour" : "day";
    const last = { day: days - 1, hour: hoursPerDay - 1 };
    const step = (axis: "day" | "hour", by: number): CellPosition => ({
      ...from,
      [axis]: clamp(from[axis] + by, last[axis]),
    });
    switch (key) {
      case "ArrowRight":
        return step(across, 1);
      case "ArrowLeft":
        return step(across, -1);
      case "ArrowDown":
        return step(down, 1);
      case "ArrowUp":
        return step(down, -1);
      case "Home":
        return { ...from, [across]: 0 };
      case "End":
        return { ...from, [across]: last[across] };
      default:
        return null;
    }
  };

  const onKeyDown = (event: KeyboardEvent<SVGSVGElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      choose(active);
      return;
    }
    const next = destination(event.key, active);
    if (next !== null) {
      event.preventDefault();
      focus(next);
    }
  };

  const cell = (group: HeatGroup<DayCounts>, day: number, hour: number) => {
    const position = { day, hour };
    const rect = group.cells[hour];
    if (rect === undefined) {
      return null;
    }
    const count = countAt(position);
    const pressed = isChosen(position);
    const classes = [styles.cell, stepClasses[heatStep(count, max)]];
    if (pressed) {
      classes.push(styles.pressed);
    }
    const label =
      `${formatDay(group.day.day)}, ${formatHour(hour)} to ` +
      `${formatHour(hour + 1)}: ${count} merged`;
    const isActive = active.day === day && active.hour === hour;
    return (
      <rect
        key={`${day}-${hour}`}
        data-cell={`${day}-${hour}`}
        {...rect}
        className={classes.join(" ")}
        role="gridcell"
        aria-label={label}
        tabIndex={isActive ? 0 : -1}
        onFocus={() => setMoved(position)}
        onClick={() => choose(position)}
        {...(count > 0
          ? { "aria-selected": pressed }
          : { "aria-disabled": true })}
      >
        <title>{label}</title>
      </rect>
    );
  };

  /**
   * The grid's rows, as they are drawn: an hour's cells across the days
   * under the columns, or a day's hours beside the rows.
   */
  const rows =
    geometry.layout === "columns"
      ? Array.from({ length: hoursPerDay }, (_, hour) =>
          geometry.groups.map((group, day) => cell(group, day, hour)),
        )
      : geometry.groups.map((group, day) =>
          Array.from({ length: hoursPerDay }, (_, hour) =>
            cell(group, day, hour),
          ),
        );

  return (
    <svg
      ref={grid}
      width={geometry.width}
      height={geometry.height}
      className={
        geometry.layout === "rows"
          ? `${styles.chart} ${styles.rowsHeatmap}`
          : styles.chart
      }
      role="grid"
      aria-label="Merged pull requests per hour of each day"
      onKeyDown={onKeyDown}
    >
      {/*
        The lines of the labelled hours, behind the cells, in the bar chart's
        grid-line style; they are decoration and take no clicks.
      */}
      <g aria-hidden="true" className={styles.hourLines}>
        {geometry.hourLines.map(({ hour, line }) => (
          <line key={hour} {...line} className={styles.gridLine} />
        ))}
      </g>
      <g aria-hidden="true">
        {geometry.hourLabels.map(({ hour, spot }) => (
          <text
            key={hour}
            x={spot.x}
            y={spot.y}
            textAnchor={spot.anchor}
            dominantBaseline="middle"
            className={styles.axisLabel}
          >
            {hour}
          </text>
        ))}
        {geometry.groups.map(
          ({ day, label }) =>
            label !== null && (
              <text
                key={day.day}
                x={label.x}
                y={label.y}
                textAnchor={label.anchor}
                dominantBaseline="middle"
                className={styles.axisLabel}
              >
                {formatDay(day.day)}
              </text>
            ),
        )}
      </g>
      {rows.map((cells, index) => (
        <g key={index} role="row">
          {cells}
        </g>
      ))}
    </svg>
  );
}

/** The count of the busiest hour of `hours`, or 0 for none. */
function busiestHour(hours: readonly DayHourCounts[]): number {
  return Math.max(0, ...hours.flatMap((d) => d.merged));
}

/**
 * The description of the heatmap's strengths, as the caption of the chart's
 * figure, for assistive technology only: the cells' shades show them on
 * the page without a key. With no hour busy, there is nothing to describe.
 * What is counted needs no description of its own: the card's heading says
 * it.
 */
export function HeatDescription(props: {
  readonly hours: readonly DayHourCounts[];
}) {
  const busiest = busiestHour(props.hours);
  if (busiest === 0) {
    return null;
  }
  return (
    <figcaption className={styles.visuallyHidden}>
      {`Hours shaded in ${heatSteps} steps, from 1 up to the busiest hour's ${busiest}`}
    </figcaption>
  );
}
