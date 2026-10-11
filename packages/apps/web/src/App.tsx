import { useCallback, useState } from "react";
import {
  CallbackHandler,
  SessionProvider,
  SessionStatus,
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
        <SessionStatus />
      )}
    </SessionProvider>
  );
}
