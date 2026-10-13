import type { ReactNode } from "react";
import { buttonStyles } from "../../shared";
import { useSession } from "./session-context";
import styles from "./SessionStatus.module.css";

/**
 * While signed in, the login with a sign-out button and, before the login,
 * `organization`, which the page fills in once it knows the organization.
 * Signed out, the sign-in screen takes the page instead.
 */
export function SessionStatus(props: { readonly organization?: ReactNode }) {
  const { controller, state } = useSession();
  if (state.status !== "signed-in") {
    return null;
  }
  return (
    <div className={styles.status}>
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
