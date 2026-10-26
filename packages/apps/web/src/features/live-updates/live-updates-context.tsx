import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "../session";
import { LiveUpdates, type LiveUpdatesOptions } from "./live-updates";

/** Subscribes a listener to the updates; returns the unsubscribe. */
type SubscribeToUpdates = (listener: () => void) => () => void;

const LiveUpdatesContext = createContext<SubscribeToUpdates | undefined>(
  undefined,
);

/**
 * Keeps the signed-in viewer's page live while it is mounted: one
 * connection to the viewer's channel of signals, closed when it unmounts,
 * as it does on signing out. Without `options`, as in a build without the
 * signal hosts, nothing connects and the page is not live.
 */
export function LiveUpdatesProvider(props: {
  readonly options: LiveUpdatesOptions | undefined;
  readonly children: ReactNode;
}) {
  const { controller } = useSession();
  const { options } = props;
  const [listeners] = useState(() => new Set<() => void>());
  const [subscribe] = useState((): SubscribeToUpdates => (listener) => {
    // Wrapped, so that subscribing the same function twice counts twice.
    const entry = () => listener();
    listeners.add(entry);
    return () => listeners.delete(entry);
  });

  useEffect(() => {
    if (options === undefined) {
      return undefined;
    }
    const live = new LiveUpdates(
      options,
      () =>
        controller.withAccessToken((token) =>
          controller.activityApi.createSignalToken(token),
        ),
      () => {
        for (const listener of [...listeners]) {
          listener();
        }
      },
    );
    live.start();
    return () => live.stop();
  }, [options, controller, listeners]);

  return (
    <LiveUpdatesContext.Provider value={subscribe}>
      {props.children}
    </LiveUpdatesContext.Provider>
  );
}

/**
 * Calls `onUpdate` each time the page should fetch again because the
 * server has new activity for the viewer. Outside a
 * {@link LiveUpdatesProvider}, it is never called.
 */
export function useLiveUpdates(onUpdate: () => void): void {
  const subscribe = useContext(LiveUpdatesContext);
  const latest = useRef(onUpdate);
  useEffect(() => {
    latest.current = onUpdate;
  }, [onUpdate]);
  useEffect(() => subscribe?.(() => latest.current()), [subscribe]);
}
