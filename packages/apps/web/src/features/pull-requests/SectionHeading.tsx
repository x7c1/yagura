import type { ReactNode } from "react";
import { sectionStyles } from "../../shared";
import styles from "./SectionHeading.module.css";

/**
 * A section's heading, with `aside` at its right, which wraps under the
 * heading when the two do not fit on one line. What `aside` holds is kept
 * on one line, in its order, flush with the section's right edge, and
 * aligned with the heading's text.
 */
export function SectionHeading(props: {
  readonly children: ReactNode;
  readonly aside: ReactNode;
}) {
  return (
    <div className={sectionStyles.headingRow}>
      <h2 className={sectionStyles.heading}>{props.children}</h2>
      <div className={styles.aside}>{props.aside}</div>
    </div>
  );
}

/**
 * The note that an update is running, in room kept while it is absent, so
 * that its coming and going moves nothing beside it.
 */
export function UpdatingNote(props: { readonly updating: boolean }) {
  return (
    <span role="status" className={styles.updatingNote}>
      {props.updating && "Updating…"}
    </span>
  );
}
