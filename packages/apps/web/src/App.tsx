import { useCallback, useState } from "react";
import {
  CallbackHandler,
  SessionProvider,
  SessionStatus,
  type SessionController,
} from "./features/session";

export const callbackPath = "/callback";

export function App(props: { readonly session: SessionController }) {
  const [pathname, setPathname] = useState(window.location.pathname);

  // Drop the code and state from the address bar and the history entry.
  const leaveCallback = useCallback(() => {
    window.history.replaceState(null, "", "/");
    setPathname("/");
  }, []);

  return (
    <SessionProvider controller={props.session}>
      <h1>yagura</h1>
      {pathname === callbackPath ? (
        <CallbackHandler onDone={leaveCallback} />
      ) : (
        <SessionStatus />
      )}
    </SessionProvider>
  );
}
