import { useCallback, useState } from "react";
import styles from "./App.module.css";
import { OrganizationMembers } from "./features/members";
import {
  CallbackHandler,
  SessionProvider,
  SessionStatus,
  useSession,
  type SessionController,
} from "./features/session";

export const callbackPath = "/callback";

export function App(props: { readonly session: SessionController }) {
  const { location } = props.session;
  const [pathname, setPathname] = useState(location.pathname);

  // Drop the code and state from the address bar and the history entry.
  const leaveCallback = useCallback(() => {
    location.replace("/");
    setPathname(location.pathname);
  }, [location]);

  const onCallback = pathname === callbackPath;
  return (
    <SessionProvider controller={props.session}>
      <header className={styles.header}>
        <div className={styles.bar}>
          <h1 className={styles.title}>yagura</h1>
          {!onCallback && <SessionStatus />}
        </div>
      </header>
      <main className={styles.main}>
        {onCallback ? <CallbackHandler onDone={leaveCallback} /> : <Home />}
      </main>
    </SessionProvider>
  );
}

/** While signed in, the organization's members. */
function Home() {
  const { state } = useSession();
  return state.status === "signed-in" ? (
    <OrganizationMembers key={state.login} />
  ) : null;
}
