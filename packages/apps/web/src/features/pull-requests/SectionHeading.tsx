import type { ReactNode } from "react";
import { sectionStyles } from "../../shared";
import styles from "./SectionHeading.module.css";

/**
 * A section's heading, with `aside` at its right when one is given, which
 * wraps under the heading when the two do not fit on one line.
 */
export function SectionHeading(props: {
  readonly children: ReactNode;
  readonly aside?: ReactNode;
}) {
  const heading = <h2 className={sectionStyles.heading}>{props.children}</h2>;
  return props.aside === undefined ? (
    heading
  ) : (
    <div className={sectionStyles.headingRow}>
      {heading}
      {props.aside}
    </div>
  );
}

/**
 * The note that an update is running, in room kept while it is absent, so
 * that its coming and going moves nothing beside it.
 */
export function UpdatingNote(props: {
  readonly updating: boolean;
  readonly className?: string;
}) {
  const classes = [styles.updatingNote, props.className].filter(Boolean);
  return (
    <span role="status" className={classes.join(" ")}>
      {props.updating && "Updating…"}
    </span>
  );
}
