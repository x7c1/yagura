import buttonStyles from "./button.module.css";
import styles from "./Failure.module.css";

/** A failed request's message and a button that retries it. */
export function Failure(props: {
  readonly message: string;
  readonly retry: () => void;
}) {
  return (
    <div className={styles.failure}>
      <p role="alert">{props.message}</p>
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
