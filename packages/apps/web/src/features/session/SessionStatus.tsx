import { useEffect, type ReactNode } from "react";
import { buttonStyles } from "../../shared";
import { useSession } from "./session-context";
import styles from "./SessionStatus.module.css";

/**
 * The sign-in button, or the signed-in login with a sign-out button and,
 * before the login, `organization`, which the page fills in once it knows
 * the organization.
 */
export function SessionStatus(props: { readonly organization?: ReactNode }) {
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
        <div className={`${styles.status} ${styles.signedIn}`}>
          <span className={styles.identity}>
            {props.organization}
            <span className={styles.login}>{state.login}</span>
          </span>
          {/* Quiet, so that the bar's emphasis stays on the tabs. */}
          <button
            type="button"
            className={`${buttonStyles.quiet} ${styles.signOut}`}
            onClick={() => void controller.signOut()}
          >
            Sign out
          </button>
        </div>
      );
  }
}
