import type { Line } from "./chart-geometry";
import styles from "./DailyChart.module.css";

/**
 * The lines between each Saturday and the Sunday after it, drawn behind the
 * marks of one of the chart's SVGs: decoration only, hidden from assistive
 * technology, and a click passes through them.
 */
export function WeekLineMarks({ lines }: { readonly lines: readonly Line[] }) {
  return (
    <g aria-hidden="true" className={styles.weekLines}>
      {lines.map((line, index) => (
        <line key={index} {...line} className={styles.weekLine} />
      ))}
    </g>
  );
}
