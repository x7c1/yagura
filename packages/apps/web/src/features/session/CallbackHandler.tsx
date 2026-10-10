import { useEffect } from "react";
import { useSession } from "./session-context";

/**
 * Completes the GitHub redirect on `/callback`, then calls `onDone` so the
 * app can leave the callback URL, success or not.
 */
export function CallbackHandler(props: { readonly onDone: () => void }) {
  const { controller } = useSession();
  const { onDone } = props;

  useEffect(() => {
    void controller.handleCallback(window.location.search).then(onDone);
  }, [controller, onDone]);

  return <p>Signing in…</p>;
}
