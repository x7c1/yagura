import type { ReactNode } from "react";
import { buttonStyles } from "../../shared";
import { useSession } from "./session-context";
import type { SessionError, SignInFailureReason } from "./session-controller";
import styles from "./SignInScreen.module.css";

/**
 * The note on the sign-in screen when `DELETE /session` failed: the refresh
 * cookie may still be set, so that the next page load would restore the
 * session. Reloading restores that same session, if it is still there, and
 * signing out of it sends the request once more; signing in through GitHub
 * instead would start a new session and leave the old one's tokens
 * unrevoked.
 */
export const signOutUnconfirmedNote =
  "You are signed out in this browser, but Yagura could not reach the " +
  "server to end your session, so it may sign you back in the next time " +
  "you open it. To end it, reload this page and, if you are signed in " +
  "again, sign out once more.";

/**
 * What a signed-out visitor sees: the app's name and what it is, the
 * sign-in button with a note on what signing in gives the app, and the last
 * sign-in's or sign-out's failure above the button. While the session is
 * being restored, the same screen says it is loading in the button's place,
 * so that the button does not flash before a restored session replaces the
 * screen.
 */
export function SignInScreen() {
  const { controller, state } = useSession();
  switch (state.status) {
    case "pending":
      return (
        <SignInFrame>
          <Progress>Loading…</Progress>
        </SignInFrame>
      );
    case "signed-out":
      return (
        <SignInFrame>
          {state.error && <SessionFailure error={state.error} />}
          <button
            type="button"
            className={`${buttonStyles.primary} ${styles.signIn}`}
            onClick={() => void controller.signIn()}
          >
            Sign in with GitHub
          </button>
        </SignInFrame>
      );
    case "signed-in":
      return null;
  }
}

/**
 * What happened to the viewer, in their terms, and what they can do about
 * it with what the screen offers: signing in again, or reloading. What
 * failed in technical terms is in the console.
 */
function SessionFailure(props: { readonly error: SessionError }) {
  const { title, text } = describeSessionError(props.error);
  return (
    <div role="alert" className={styles.error}>
      <p className={styles.errorTitle}>{title}</p>
      <p>{text}</p>
    </div>
  );
}

interface Message {
  readonly title: string;
  readonly text: string;
}

function describeSessionError(error: SessionError): Message {
  switch (error.kind) {
    case "sign-in-failed":
      return describeSignInFailure(error.reason);
    case "session-lost":
      return {
        title: "You were signed out.",
        text:
          error.reason === "offline"
            ? "Yagura could not reach the network to keep your session. " +
              "Check your connection, then reload this page or sign in again."
            : "GitHub or Yagura is not working right now, so your session " +
              "could not be kept. Reload this page or sign in again in a moment.",
      };
    case "sign-out-unconfirmed":
      return {
        title: "Your sign-out may not be complete.",
        text: signOutUnconfirmedNote,
      };
  }
}

function describeSignInFailure(reason: SignInFailureReason): Message {
  if (reason === "cancelled") {
    return {
      title: "Sign-in cancelled.",
      text:
        "You cancelled the sign-in on GitHub. " +
        "Sign in again whenever you are ready.",
    };
  }
  const title = "Could not sign you in.";
  switch (reason) {
    case "stale":
      return {
        title,
        text:
          "This sign-in link is out of date, was already used, or was " +
          "opened in another tab. Please sign in again.",
      };
    case "storage":
      return {
        title,
        text:
          "Your browser is blocking the storage Yagura needs to sign in. " +
          "Allow this site to store data, then try again.",
      };
    case "offline":
      return {
        title,
        text:
          "Yagura could not reach the network. " +
          "Check your connection, then try signing in again.",
      };
    case "unavailable":
      return {
        title,
        text:
          "GitHub or Yagura is not working right now. " +
          "Try signing in again in a moment.",
      };
  }
}

/**
 * The centred panel every screen before the pages shares, with the app's
 * name as the page's one heading and the line that says what it is, the
 * same as the README's first line. `children` takes the button's place,
 * above the note on what signing in gives the app, which every state shows
 * so that the panel keeps its size from one to the next. The screen offers
 * no theme choice, as a visitor has no reason to make one before signing
 * in; a choice made earlier still applies.
 */
export function SignInFrame(props: { readonly children: ReactNode }) {
  return (
    <main className={styles.screen}>
      <div className={styles.panel}>
        <h1 className={styles.name}>Yagura</h1>
        <p className={styles.tagline}>
          See your organization's development activity on GitHub at a glance.
        </p>
        <div className={styles.action}>{props.children}</div>
        {/*
         * What signing in gives the app, from the README's promises: no more
         * than the visitor can see, read in their own browser, and nothing
         * kept on the server.
         */}
        <p className={styles.note}>
          Yagura only reads what you can already see on GitHub, right in your
          browser. The server stores nothing.
        </p>
      </div>
    </main>
  );
}

/** A muted note that something is under way, in the button's place. */
export function Progress(props: { readonly children: ReactNode }) {
  return (
    <p role="status" className={styles.progress}>
      {props.children}
    </p>
  );
}
