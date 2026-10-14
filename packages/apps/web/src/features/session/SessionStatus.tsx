import type { ReactNode } from "react";
import { useSession } from "./session-context";
import { SessionMenu } from "./SessionMenu";
import styles from "./SessionStatus.module.css";

/**
 * While signed in, `organization`, which the page fills in once it knows
 * the organization, then the login, then the menu that holds the theme
 * choice and "Sign out". Signed out, the sign-in screen takes the page
 * instead.
 */
export function SessionStatus(props: { readonly organization?: ReactNode }) {
  const { state } = useSession();
  if (state.status !== "signed-in") {
    return null;
  }
  return (
    <div className={styles.status}>
      <span className={styles.identity}>
        {props.organization}
        <span className={styles.login}>{state.login}</span>
      </span>
      <SessionMenu />
    </div>
  );
}
