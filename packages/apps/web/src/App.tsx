import type { ElementWidths } from "@yagura/browser";
import { useCallback, useEffect, useState } from "react";
import styles from "./App.module.css";
import { OrganizationMembers } from "./features/members";
import {
  pageAt,
  pageLabels,
  pagePaths,
  PageTabs,
  type Page,
} from "./features/pages";
import { ElementWidthsProvider } from "./shared";
import {
  CallbackHandler,
  SessionProvider,
  SessionStatus,
  useSession,
  type SessionController,
} from "./features/session";

export const callbackPath = "/callback";

export function App(props: {
  readonly session: SessionController;
  /** Where the views that are drawn to their width measure it. */
  readonly widths: ElementWidths;
}) {
  const { location } = props.session;
  const [pathname, setPathname] = useState(location.pathname);

  // The back and forward buttons move between the pages.
  useEffect(
    () => location.onPopState(() => setPathname(location.pathname)),
    [location],
  );

  const onCallback = pathname === callbackPath;
  // Any other path shows the activity, and its address becomes the
  // activity's own, in place of the current history entry.
  const known = pageAt(pathname);
  useEffect(() => {
    if (!onCallback && known === undefined) {
      location.replace(pagePaths.activity);
      setPathname(location.pathname);
    }
  }, [location, onCallback, known]);
  const page = known ?? "activity";

  // Drop the code and state from the address bar and the history entry.
  const leaveCallback = useCallback(() => {
    location.replace(pagePaths.activity);
    setPathname(location.pathname);
  }, [location]);

  const navigate = useCallback(
    (next: Page) => {
      // The current page's tab adds no history entry, as a link to the
      // current address does not.
      if (pagePaths[next] === location.pathname) {
        return;
      }
      location.push(pagePaths[next]);
      setPathname(location.pathname);
    },
    [location],
  );

  return (
    <SessionProvider controller={props.session}>
      <ElementWidthsProvider widths={props.widths}>
        <header className={styles.header}>
          <div className={styles.bar}>
            <h1 className={styles.title}>yagura</h1>
            {!onCallback && (
              <>
                <div className={styles.tabs}>
                  <SignedInTabs current={page} onNavigate={navigate} />
                </div>
                <div className={styles.session}>
                  <SessionStatus />
                </div>
              </>
            )}
          </div>
        </header>
        <main className={styles.main}>
          {onCallback ? (
            <CallbackHandler onDone={leaveCallback} />
          ) : (
            <Home page={page} />
          )}
        </main>
      </ElementWidthsProvider>
    </SessionProvider>
  );
}

/** While signed in, the tabs between the pages. */
function SignedInTabs(props: {
  readonly current: Page;
  readonly onNavigate: (page: Page) => void;
}) {
  const { state } = useSession();
  return state.status === "signed-in" ? <PageTabs {...props} /> : null;
}

/**
 * While signed in, the organization's members, on `page`, with the page's
 * name in the document title, so that the browser's tab and history tell
 * the pages apart.
 */
function Home(props: { readonly page: Page }) {
  const { state } = useSession();
  const signedIn = state.status === "signed-in";
  useEffect(() => {
    if (!signedIn) {
      return;
    }
    const previous = document.title;
    document.title = `${pageLabels[props.page]} · yagura`;
    return () => {
      document.title = previous;
    };
  }, [signedIn, props.page]);
  return signedIn ? (
    <OrganizationMembers key={state.login} page={props.page} />
  ) : null;
}
