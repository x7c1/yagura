import { mockLogin } from "@yagura/api-mocks";
import { DomElementAttribute, MemoryStore } from "@yagura/browser";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import indexHtml from "../index.html?raw";
import { App } from "./App";
import {
  ThemeController,
  themeAttributeName,
  themeStorageKey,
} from "./features/theme";
import {
  menuButton,
  openMenu,
  signOut,
  testController,
  testWidths,
} from "./test-support";

const root = document.documentElement;

/**
 * A theme controller over the test document's root element, as the app's
 * is over the page's, and the store it keeps the choice in.
 */
function theme(stored?: string) {
  const store = new MemoryStore();
  if (stored !== undefined) {
    store.set(themeStorageKey, stored);
  }
  const controller = new ThemeController({
    store,
    root: new DomElementAttribute(root, themeAttributeName),
  });
  return { controller, store };
}

/** The theme options in the open header menu. */
function themeOptions(): HTMLElement[] {
  const group = within(screen.getByRole("menu")).getByRole("group", {
    name: "Theme",
  });
  return within(group).getAllByRole("menuitemradio");
}

/**
 * The names of the theme options checked in the open header menu, joined
 * with commas, so that more than one checked shows.
 */
function checkedTheme(): string {
  return themeOptions()
    .filter((option) => option.getAttribute("aria-checked") === "true")
    .map((option) => option.textContent?.replace("✓", ""))
    .join(", ");
}

/** The items of `menu`, the theme options and "Sign out", in order. */
function menuItems(menu: HTMLElement): HTMLElement[] {
  return [...menu.querySelectorAll<HTMLElement>('[role^="menuitem"]')];
}

/** Chooses `name` in the open header menu. */
function choose(name: "System" | "Light" | "Dark"): void {
  fireEvent.click(
    within(screen.getByRole("menu")).getByRole("menuitemradio", { name }),
  );
}

/** Renders the app signed in, and waits for the header to show the login. */
async function renderSignedIn(themeController: ThemeController) {
  const { controller } = testController({ signedIn: true });
  render(
    <App session={controller} widths={testWidths()} theme={themeController} />,
  );
  expect(await screen.findByText(mockLogin)).toBeInTheDocument();
}

afterEach(() => {
  root.removeAttribute(themeAttributeName);
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("The sign-in screen", () => {
  it("offers no theme choice, but the stored one applies", async () => {
    const { controller } = testController();

    render(
      <App
        session={controller}
        widths={testWidths()}
        theme={theme("dark").controller}
      />,
    );
    await screen.findByRole("button", { name: "Sign in with GitHub" });

    expect(root).toHaveAttribute(themeAttributeName, "dark");
    expect(screen.queryByText("Theme")).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Menu" })).toBeNull();
    expect(screen.queryByText("Dark")).not.toBeInTheDocument();
  });
});

describe("The header menu", () => {
  it("is closed behind a button, with no Sign out in view, and the footer holds no theme choice", async () => {
    await renderSignedIn(theme().controller);

    const button = menuButton();
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByText("Sign out")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Sign out" }),
    ).not.toBeInTheDocument();

    const footer = screen.getByRole("contentinfo");
    expect(footer).toHaveTextContent(/^Powered by Yagura$/);
    expect(within(footer).queryByText("Theme")).not.toBeInTheDocument();
    expect(within(footer).queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("offers System, Light and Dark, System checked, then Sign out", async () => {
    await renderSignedIn(theme().controller);

    const menu = openMenu();
    expect(menuButton()).toHaveAttribute("aria-expanded", "true");
    expect(checkedTheme()).toBe("System");
    expect(root).not.toHaveAttribute(themeAttributeName);

    const items = menuItems(menu);
    expect(items.map((item) => item.textContent)).toEqual([
      "✓System",
      "Light",
      "Dark",
      "Sign out",
    ]);
    expect(within(menu).getByRole("separator")).toBeInTheDocument();
    // Opening the menu moves focus to its first item.
    expect(items[0]).toHaveFocus();
  });

  it("sets the chosen theme on the root element and stores it, and System forgets it", async () => {
    const { controller: themeController, store } = theme();
    await renderSignedIn(themeController);
    openMenu();

    choose("Dark");
    expect(root).toHaveAttribute(themeAttributeName, "dark");
    expect(store.get(themeStorageKey)).toBe("dark");
    // The menu stays open, so that the viewer sees the result.
    expect(checkedTheme()).toBe("Dark");

    choose("Light");
    expect(root).toHaveAttribute(themeAttributeName, "light");
    expect(store.get(themeStorageKey)).toBe("light");
    expect(checkedTheme()).toBe("Light");

    choose("System");
    expect(root).not.toHaveAttribute(themeAttributeName);
    expect(store.get(themeStorageKey)).toBeUndefined();
    expect(checkedTheme()).toBe("System");
  });

  it("checks the stored choice", async () => {
    await renderSignedIn(theme("dark").controller);

    expect(root).toHaveAttribute(themeAttributeName, "dark");
    openMenu();
    expect(checkedTheme()).toBe("Dark");
  });

  it("follows the system when the stored choice is unknown or unreadable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = new MemoryStore();
    vi.spyOn(store, "get").mockImplementation(() => {
      throw new Error("storage is blocked");
    });
    const themeController = new ThemeController({
      store,
      root: new DomElementAttribute(root, themeAttributeName),
    });

    await renderSignedIn(themeController);

    expect(root).not.toHaveAttribute(themeAttributeName);
    expect(warn).toHaveBeenCalled();
    openMenu();
    expect(checkedTheme()).toBe("System");

    const unknown = new ThemeController({
      store: theme("sepia").store,
      root: new DomElementAttribute(root, themeAttributeName),
    });
    unknown.restore();
    expect(unknown.choice).toBe("system");
    expect(root).not.toHaveAttribute(themeAttributeName);
  });

  it("moves between the items with the arrow keys, Home and End", async () => {
    await renderSignedIn(theme().controller);

    // The up arrow on the button opens the menu at its last item.
    fireEvent.keyDown(menuButton(), { key: "ArrowUp" });
    const menu = screen.getByRole("menu");
    const items = menuItems(menu);
    expect(items[3]).toHaveFocus();

    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowDown" });
    expect(items[1]).toHaveFocus();
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowUp" });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(document.activeElement as Element, { key: "ArrowUp" });
    expect(items[3]).toHaveFocus();
    fireEvent.keyDown(document.activeElement as Element, { key: "Home" });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(document.activeElement as Element, { key: "End" });
    expect(items[3]).toHaveFocus();
  });

  it("closes on Escape and returns focus to the button", async () => {
    await renderSignedIn(theme().controller);

    fireEvent.keyDown(menuButton(), { key: "ArrowDown" });
    expect(menuItems(screen.getByRole("menu"))[0]).toHaveFocus();

    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(menuButton()).toHaveAttribute("aria-expanded", "false");
    expect(menuButton()).toHaveFocus();
  });

  it("closes on Tab, on a click outside, and on a second click on the button", async () => {
    await renderSignedIn(theme().controller);

    openMenu();
    fireEvent.keyDown(document.activeElement as Element, { key: "Tab" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    openMenu();
    fireEvent.pointerDown(screen.getByRole("main"));
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    openMenu();
    fireEvent.click(menuButton());
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("signs out, and the choice is kept", async () => {
    // The session remembers the last viewer in the same store as the theme,
    // as the app keeps both in `localStorage`, so that signing out is seen
    // to clear the viewer's key and leave the theme's.
    const { controller: themeController, store } = theme();
    const { controller } = testController({
      signedIn: true,
      lastViewer: store,
    });

    render(
      <App
        session={controller}
        widths={testWidths()}
        theme={themeController}
      />,
    );
    expect(await screen.findByText(mockLogin)).toBeInTheDocument();
    expect(store.get("yagura.last-viewer")).toBe(mockLogin);
    openMenu();
    choose("Dark");

    signOut();
    await screen.findByRole("button", { name: "Sign in with GitHub" });

    expect(store.get("yagura.last-viewer")).toBeUndefined();
    expect(store.get(themeStorageKey)).toBe("dark");
    expect(root).toHaveAttribute(themeAttributeName, "dark");
  });
});

describe("The early script in index.html", () => {
  /** Runs the inline script of `index.html`, as the browser does on load. */
  function runEarlyScript(): void {
    const script = /<script>([\s\S]*?)<\/script>/.exec(indexHtml)?.[1];
    if (script === undefined) {
      throw new Error("No inline script in index.html");
    }
    new Function(script)();
  }

  it("applies the choice stored under the app's key", () => {
    localStorage.setItem(themeStorageKey, "dark");
    runEarlyScript();
    expect(root).toHaveAttribute(themeAttributeName, "dark");

    localStorage.setItem(themeStorageKey, "light");
    runEarlyScript();
    expect(root).toHaveAttribute(themeAttributeName, "light");
  });

  it("leaves the page following the system without a valid choice", () => {
    runEarlyScript();
    expect(root).not.toHaveAttribute(themeAttributeName);

    localStorage.setItem(themeStorageKey, "sepia");
    runEarlyScript();
    expect(root).not.toHaveAttribute(themeAttributeName);
  });

  it("tolerates blocked storage", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage is blocked");
    });
    expect(runEarlyScript).not.toThrow();
    expect(root).not.toHaveAttribute(themeAttributeName);
  });
});
