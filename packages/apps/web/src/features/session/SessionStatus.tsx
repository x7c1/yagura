import { useEffect } from "react";
import { useSession } from "./session-context";

/** The sign-in button, or the signed-in login with a sign-out button. */
export function SessionStatus() {
  const { controller, state } = useSession();

  useEffect(() => {
    void controller.restore();
  }, [controller]);

  switch (state.status) {
    case "pending":
      return <p>Loading…</p>;
    case "signed-out":
      return (
        <div>
          {state.error && <p role="alert">{state.error}</p>}
          <button type="button" onClick={() => void controller.signIn()}>
            Sign in with GitHub
          </button>
        </div>
      );
    case "signed-in":
      return (
        <div>
          <span>{state.login}</span>{" "}
          <button type="button" onClick={() => void controller.signOut()}>
            Sign out
          </button>
        </div>
      );
  }
}
