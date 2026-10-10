import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { SessionController, SessionState } from "./session-controller";

const SessionContext = createContext<SessionController | undefined>(undefined);

export function SessionProvider(props: {
  readonly controller: SessionController;
  readonly children: ReactNode;
}) {
  return (
    <SessionContext.Provider value={props.controller}>
      {props.children}
    </SessionContext.Provider>
  );
}

/** The session controller and its current state. */
export function useSession(): {
  readonly controller: SessionController;
  readonly state: SessionState;
} {
  const controller = useContext(SessionContext);
  if (!controller) {
    throw new Error("useSession must be used inside a SessionProvider");
  }
  const state = useSyncExternalStore(
    (listener) => controller.subscribe(listener),
    () => controller.state,
  );
  return { controller, state };
}
