import { useCallback, useState } from "react";
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

  return (
    <SessionProvider controller={props.session}>
      <h1>yagura</h1>
      {pathname === callbackPath ? (
        <CallbackHandler onDone={leaveCallback} />
      ) : (
        <Home />
      )}
    </SessionProvider>
  );
}

/** The session status and, while signed in, the organization's members. */
function Home() {
  const { state } = useSession();
  return (
    <>
      <SessionStatus />
      {state.status === "signed-in" && (
        <OrganizationMembers key={state.login} />
      )}
    </>
  );
}
