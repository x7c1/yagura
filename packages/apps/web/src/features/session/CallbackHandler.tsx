import { useEffect } from "react";
import { useSession } from "./session-context";
import { Progress, SignInFrame } from "./SignInScreen";

/**
 * Completes the GitHub redirect on `/callback`, then calls `onDone` so the
 * app can leave the callback URL, success or not. Meanwhile it shows the
 * sign-in screen with "Signing in…" in the button's place.
 */
export function CallbackHandler(props: { readonly onDone: () => void }) {
  const { controller } = useSession();
  const { onDone } = props;

  useEffect(() => {
    void controller.handleCallback(controller.location.search).then(onDone);
  }, [controller, onDone]);

  return (
    <SignInFrame>
      <Progress>Signing in…</Progress>
    </SignInFrame>
  );
}
