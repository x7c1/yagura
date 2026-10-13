import { useEffect } from "react";
import { buttonStyles } from "../../shared";
import { useSession } from "./session-context";
import styles from "./SessionStatus.module.css";

/** The sign-in button, or the signed-in login with a sign-out button. */
export function SessionStatus() {
  const { controller, state } = useSession();

  useEffect(() => {
    void controller.restore();
  }, [controller]);

  switch (state.status) {
    case "pending":
      return <p className={styles.pending}>Loading…</p>;
    case "signed-out":
      return (
        <div className={styles.status}>
          {state.error && (
            <p role="alert" className={styles.error}>
              {state.error}
            </p>
          )}
          <button
            type="button"
            className={buttonStyles.primary}
            onClick={() => void controller.signIn()}
          >
            Sign in with GitHub
          </button>
        </div>
      );
    case "signed-in":
      return (
        <div className={styles.status}>
          <span className={styles.login}>{state.login}</span>{" "}
          {/* Quiet, so that the bar's emphasis stays on the tabs. */}
          <button
            type="button"
            className={buttonStyles.quiet}
            onClick={() => void controller.signOut()}
          >
            Sign out
          </button>
        </div>
      );
  }
}
