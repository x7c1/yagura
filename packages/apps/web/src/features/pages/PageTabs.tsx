import type { MouseEvent } from "react";
import { pageLabels, pagePaths, type Page } from "./pages";
import styles from "./PageTabs.module.css";

/**
 * A link per page, the current one marked. A plain click calls `onNavigate`
 * instead of loading the page; a click that asks for a new tab or window
 * is left to the browser, as is anything else done with the links.
 */
export function PageTabs(props: {
  readonly current: Page;
  readonly onNavigate: (page: Page) => void;
}) {
  const { current, onNavigate } = props;
  return (
    <nav aria-label="Pages">
      <ul className={styles.tabs}>
        {(Object.keys(pageLabels) as Page[]).map((page) => (
          <li key={page}>
            <a
              href={pagePaths[page]}
              className={styles.tab}
              aria-current={page === current ? "page" : undefined}
              onClick={(event) => {
                if (isPlainClick(event)) {
                  event.preventDefault();
                  onNavigate(page);
                }
              }}
            >
              {pageLabels[page]}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function isPlainClick(event: MouseEvent): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}
