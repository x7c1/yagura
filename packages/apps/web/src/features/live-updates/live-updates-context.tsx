import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useSession } from "../session";
import {
  concerns,
  LiveUpdates,
  type LiveStatus,
  type LiveUpdate,
  type LiveUpdatesOptions,
} from "./live-updates";

/** Subscribes a listener to the updates; returns the unsubscribe. */
type SubscribeToUpdates = (
  listener: (update: LiveUpdate) => void,
) => () => void;

const LiveUpdatesContext = createContext<SubscribeToUpdates | undefined>(
  undefined,
);

const LiveStatusContext = createContext<LiveStatus | undefined>(undefined);

/**
 * Keeps the signed-in viewer's page live while it is mounted: one
 * connection to the viewer's channel of signals, closed when it unmounts,
 * as it does on signing out. Without `options`, as in a build without the
 * signal hosts, nothing connects, the page is not live, and no status is
 * shown.
 */
export function LiveUpdatesProvider(props: {
  readonly options: LiveUpdatesOptions | undefined;
  readonly children: ReactNode;
}) {
  const { controller } = useSession();
  const { options } = props;
  const [listeners] = useState(() => new Set<(update: LiveUpdate) => void>());
  const [subscribe] = useState((): SubscribeToUpdates => (listener) => {
    // Wrapped, so that subscribing the same function twice counts twice.
    const entry = (update: LiveUpdate) => listener(update);
    listeners.add(entry);
    return () => listeners.delete(entry);
  });
  const [status, setStatus] = useState<LiveStatus | undefined>(undefined);

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
      (update) => {
        for (const listener of [...listeners]) {
          listener(update);
        }
      },
      setStatus,
    );
    live.start();
    return () => live.stop();
  }, [options, controller, listeners]);

  return (
    <LiveUpdatesContext.Provider value={subscribe}>
      <LiveStatusContext.Provider value={status}>
        {props.children}
      </LiveStatusContext.Provider>
    </LiveUpdatesContext.Provider>
  );
}

/**
 * Calls `onUpdate` each time the page showing the organization
 * `organizationId` should fetch again: because the server has new
 * activity for the viewer, or has finished importing that organization.
 * Outside a {@link LiveUpdatesProvider}, it is never called.
 */
export function useLiveUpdates(
  organizationId: string,
  onUpdate: () => void,
): void {
  const subscribe = useContext(LiveUpdatesContext);
  const latest = useRef({ organizationId, onUpdate });
  useEffect(() => {
    latest.current = { organizationId, onUpdate };
  }, [organizationId, onUpdate]);
  useEffect(
    () =>
      subscribe?.((update) => {
        if (concerns(update, latest.current.organizationId)) {
          latest.current.onUpdate();
        }
      }),
    [subscribe],
  );
}

/**
 * Whether the page is live, to show: `undefined` while nothing is to be
 * shown, as before connecting has taken long enough to show, or without
 * live updates.
 */
export function useLiveStatus(): LiveStatus | undefined {
  return useContext(LiveStatusContext);
}
