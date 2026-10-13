import type { ElementWidths } from "@yagura/browser";
import { useCallback, useEffect, useLayoutEffect, useState } from "react";
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
  SignInScreen,
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

  // Restore the session on page load, but not on the callback, whose
  // outcome becomes the session instead. It runs before the first paint, so
  // that a remembered last viewer's pages are drawn at once, with no
  // "Loading…" screen shown before them.
  const { session } = props;
  useLayoutEffect(() => {
    if (!onCallback) {
      void session.restore();
    }
  }, [session, onCallback]);

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
    <SessionProvider controller={session}>
      <ElementWidthsProvider widths={props.widths}>
        {onCallback ? (
          <CallbackHandler onDone={leaveCallback} />
        ) : (
          <Screen page={page} onNavigate={navigate} />
        )}
      </ElementWidthsProvider>
    </SessionProvider>
  );
}

/**
 * While signed in, `page` in the page frame; otherwise the sign-in screen,
 * which has no frame of its own.
 */
function Screen(props: {
  readonly page: Page;
  readonly onNavigate: (page: Page) => void;
}) {
  const { state } = useSession();
  return state.status === "signed-in" ? (
    <SignedInPage {...props} login={state.login} />
  ) : (
    <SignInScreen />
  );
}

/**
 * The page frame: the header with the tabs and the session, the
 * organization's members on `page`, and the footer. The page's name is in
 * the document title, so that the browser's tab and history tell the pages
 * apart.
 */
function SignedInPage(props: {
  readonly page: Page;
  readonly onNavigate: (page: Page) => void;
  readonly login: string;
}) {
  // Where the organization is shown, beside the login in the header. The
  // members' view, which loads the organizations, draws it there.
  const [organizationSlot, setOrganizationSlot] = useState<HTMLElement | null>(
    null,
  );

  useEffect(() => {
    const previous = document.title;
    document.title = `${pageLabels[props.page]} · Yagura`;
    return () => {
      document.title = previous;
    };
  }, [props.page]);

  return (
    <>
      <header className={styles.header}>
        <div className={styles.bar}>
          {/*
           * The app's name heads the page for assistive tech only; it is
           * shown in the footer, out of the way of what the page is for.
           */}
          <h1 className={styles.visuallyHidden}>Yagura</h1>
          <div className={styles.tabs}>
            <PageTabs current={props.page} onNavigate={props.onNavigate} />
          </div>
          <div className={styles.session}>
            <SessionStatus
              organization={
                <span
                  ref={setOrganizationSlot}
                  className={styles.organizationSlot}
                />
              }
            />
          </div>
        </div>
      </header>
      <main className={styles.main}>
        <OrganizationMembers
          key={props.login}
          page={props.page}
          organizationSlot={organizationSlot}
        />
      </main>
      <footer className={styles.footer}>
        Powered by{" "}
        <a href="https://github.com/x7c1/yagura" className={styles.footerLink}>
          Yagura
        </a>
      </footer>
    </>
  );
}
