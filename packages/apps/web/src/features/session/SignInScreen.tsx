import type { ReactNode } from "react";
import { buttonStyles } from "../../shared";
import { useSession } from "./session-context";
import styles from "./SignInScreen.module.css";

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
          {/*
           * The title stays general, since the failure may be a sign-in's
           * or a sign-out's that the server did not confirm.
           */}
          {state.error && (
            <div role="alert" className={styles.error}>
              <p className={styles.errorTitle}>Something went wrong.</p>
              <p>{state.error}</p>
            </div>
          )}
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
