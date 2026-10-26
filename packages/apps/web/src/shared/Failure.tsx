import buttonStyles from "./button.module.css";
import styles from "./Failure.module.css";
import type { LoadFailure } from "./load-failure";

/**
 * A failed fetch of `subject` (such as "the members of my-org") and a
 * button that retries it. The message says what happened in the viewer's
 * terms, whether what is shown is out of date (`stale`: the fetch was an
 * update of what is drawn), and what they can do; what failed in technical
 * terms is in the console.
 */
export function Failure(props: {
  readonly subject: string;
  readonly failure: LoadFailure;
  readonly stale: boolean;
  readonly retry: () => void;
}) {
  return (
    <div className={styles.failure}>
      <p role="alert">
        {failureMessage(props.subject, props.failure, props.stale)}
      </p>
      <button
        type="button"
        className={buttonStyles.quiet}
        onClick={props.retry}
      >
        Retry
      </button>
    </div>
  );
}

const reasons: Readonly<
  Record<LoadFailure, { readonly why: string; readonly then: string }>
> = {
  offline: {
    why: "you appear to be offline",
    then: "Check your connection, then retry.",
  },
  denied: {
    why: "GitHub no longer lets you see them",
    then: "Reload the page to see what you can access now.",
  },
  unavailable: {
    why: "GitHub or Yagura is not working right now",
    then: "Retry in a moment, or reload the page if it keeps failing.",
  },
};

function failureMessage(
  subject: string,
  failure: LoadFailure,
  stale: boolean,
): string {
  const { why, then } = reasons[failure];
  return stale
    ? `Could not update ${subject} because ${why}, so what is shown may be out of date. ${then}`
    : `Could not load ${subject} because ${why}. ${then}`;
}
