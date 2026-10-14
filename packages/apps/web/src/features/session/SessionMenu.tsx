import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { themeChoices, useTheme, type ThemeChoice } from "../theme";
import { useSession } from "./session-context";
import styles from "./SessionMenu.module.css";

const themeLabels: Readonly<Record<ThemeChoice, string>> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

/**
 * The menu at the right end of the header, behind a "more" button: the
 * theme choice, then "Sign out". Neither is used on every visit, so they
 * are kept out of view until asked for.
 *
 * It follows the WAI-ARIA menu button pattern: Enter, Space, a click or an
 * arrow key on the button opens the menu and moves focus into it, the arrow
 * keys, Home and End move between the items, and Escape closes it and
 * returns focus to the button. Tab, or a click outside, closes it and
 * leaves focus where it went. Choosing a theme applies it at once and keeps
 * the menu open, so that the viewer sees the result and can choose again;
 * choosing "Sign out" closes it.
 */
export function SessionMenu() {
  const { controller: session } = useSession();
  const { controller: theme, choice } = useTheme();
  const [open, setOpen] = useState(false);
  // The item to focus once the menu is drawn: the first or the last.
  const [initialFocus, setInitialFocus] = useState<"first" | "last">("first");
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const themeLabelId = useId();

  /** The menu's items, in the order they are drawn. */
  const items = useCallback(
    (): HTMLElement[] => [
      ...(menuRef.current?.querySelectorAll<HTMLElement>(
        '[role^="menuitem"]',
      ) ?? []),
    ],
    [],
  );

  const openMenu = (focus: "first" | "last") => {
    setInitialFocus(focus);
    setOpen(true);
  };

  const closeMenu = useCallback((returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) {
      buttonRef.current?.focus();
    }
  }, []);

  // Move focus into the menu as it opens.
  useEffect(() => {
    if (!open) {
      return;
    }
    const all = items();
    (initialFocus === "first" ? all[0] : all[all.length - 1])?.focus();
  }, [open, initialFocus, items]);

  // A press anywhere outside the button and the menu closes the menu,
  // leaving focus to whatever the press gives it.
  useEffect(() => {
    const container = containerRef.current;
    if (!open || container === null) {
      return;
    }
    const document = container.ownerDocument;
    const onPointerDown = (event: PointerEvent) => {
      if (!container.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const onButtonKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      openMenu(event.key === "ArrowDown" ? "first" : "last");
    }
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const all = items();
    const current = all.indexOf(event.target as HTMLElement);
    const focusAt = (index: number) => {
      event.preventDefault();
      all[(index + all.length) % all.length]?.focus();
    };
    switch (event.key) {
      case "ArrowDown":
        focusAt(current + 1);
        break;
      case "ArrowUp":
        focusAt(current - 1);
        break;
      case "Home":
        focusAt(0);
        break;
      case "End":
        focusAt(all.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        closeMenu(true);
        break;
      case "Tab":
        // Focus moves on as Tab moves it, and the menu is left behind.
        setOpen(false);
        break;
    }
  };

  return (
    <div
      ref={containerRef}
      className={styles.container}
      onBlur={(event) => {
        // Focus that leaves for elsewhere on the page closes the menu.
        const next = event.relatedTarget as Node | null;
        if (next !== null && !event.currentTarget.contains(next)) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-label="Menu"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={styles.button}
        onClick={() => (open ? closeMenu(false) : openMenu("first"))}
        onKeyDown={onButtonKeyDown}
      >
        {/* A vertical ellipsis, drawn as three dots in the text colour. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          width="16"
          height="16"
          className={styles.icon}
        >
          <circle cx="8" cy="3" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="8" cy="13" r="1.5" />
        </svg>
      </button>
      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Menu"
          className={styles.menu}
          onKeyDown={onMenuKeyDown}
        >
          <div role="group" aria-labelledby={themeLabelId}>
            <div id={themeLabelId} className={styles.groupLabel}>
              Theme
            </div>
            {themeChoices.map((option) => (
              <button
                key={option}
                type="button"
                role="menuitemradio"
                aria-checked={choice === option}
                tabIndex={-1}
                className={styles.item}
                onClick={() => theme.choose(option)}
              >
                {/*
                 * The current choice is marked with a check as well as by
                 * `aria-checked`, so that it is not told by colour alone.
                 */}
                <span aria-hidden="true" className={styles.check}>
                  {choice === option ? "✓" : ""}
                </span>
                {themeLabels[option]}
              </button>
            ))}
          </div>
          <div role="separator" className={styles.separator} />
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            className={styles.item}
            onClick={() => {
              closeMenu(false);
              void session.signOut();
            }}
          >
            <span aria-hidden="true" className={styles.check} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
