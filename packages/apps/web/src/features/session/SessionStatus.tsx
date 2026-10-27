import type { ReactNode } from "react";
import { useSession } from "./session-context";
import { SessionMenu } from "./SessionMenu";
import styles from "./SessionStatus.module.css";

/**
 * While signed in, `liveStatus`, which shows whether the page is live,
 * then `organization`, which the page fills in once it knows the
 * organization, then the login, then the menu that holds the theme choice
 * and "Sign out". Signed out, the sign-in screen takes the page instead.
 */
export function SessionStatus(props: {
  readonly liveStatus?: ReactNode;
  readonly organization?: ReactNode;
}) {
  const { state } = useSession();
  if (state.status !== "signed-in") {
    return null;
  }
  return (
    <div className={styles.status}>
      <span className={styles.identity}>
        {props.liveStatus}
        {props.organization}
        <a
          href={`https://github.com/${state.login}`}
          target="_blank"
          rel="noreferrer"
          className={styles.login}
        >
          {state.login}
        </a>
      </span>
      <SessionMenu />
    </div>
  );
}
