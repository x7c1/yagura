import { Fragment, useId } from "react";
import { useTheme } from "./theme-context";
import { themeChoices, type ThemeChoice } from "./theme-controller";
import styles from "./ThemeControl.module.css";

const labels: Readonly<Record<ThemeChoice, string>> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/**
 * The theme choice, "Theme: System · Light · Dark", small and muted, for
 * the footer and under the sign-in panel. The options are radio buttons,
 * so that Tab reaches the group and the arrow keys move the choice, as in
 * any radio group; they are drawn as words, the current one underlined.
 */
export function ThemeControl() {
  const { controller, choice } = useTheme();
  const labelId = useId();
  // The radio buttons' group name, unique to this control.
  const name = useId();
  return (
    <div role="radiogroup" aria-labelledby={labelId} className={styles.choice}>
      {/* The colon is drawn, but kept out of the group's name. */}
      <span>
        <span id={labelId}>Theme</span>:
      </span>
      {themeChoices.map((option, index) => (
        <Fragment key={option}>
          {index > 0 && (
            <span aria-hidden="true" className={styles.separator}>
              ·
            </span>
          )}
          <label className={styles.option}>
            <input
              type="radio"
              name={name}
              value={option}
              checked={choice === option}
              onChange={() => controller.choose(option)}
              className={styles.input}
            />
            <span className={styles.label}>{labels[option]}</span>
          </label>
        </Fragment>
      ))}
    </div>
  );
}
