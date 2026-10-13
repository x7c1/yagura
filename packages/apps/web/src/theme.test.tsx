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
import { testController, testWidths } from "./test-support";

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

/** The theme control in `container`, or in the whole page. */
function themeControl(container: HTMLElement = document.body): HTMLElement {
  return within(container).getByRole("radiogroup", { name: "Theme" });
}

/** The name of the option checked in the theme control. */
function checkedTheme(container?: HTMLElement): string | undefined {
  return (
    within(themeControl(container))
      .getAllByRole<HTMLInputElement>("radio")
      .find((radio) => radio.checked)
      ?.closest("label")?.textContent ?? undefined
  );
}

function choose(name: "System" | "Light" | "Dark"): void {
  fireEvent.click(within(themeControl()).getByRole("radio", { name }));
}

afterEach(() => {
  root.removeAttribute(themeAttributeName);
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("The theme control", () => {
  it("offers System, Light and Dark under the sign-in panel, System chosen", async () => {
    const { controller } = testController();

    render(
      <App
        session={controller}
        widths={testWidths()}
        theme={theme().controller}
      />,
    );
    await screen.findByRole("button", { name: "Sign in with GitHub" });

    const radios = within(themeControl()).getAllByRole("radio");
    expect(radios.map((radio) => radio.closest("label")?.textContent)).toEqual([
      "System",
      "Light",
      "Dark",
    ]);
    expect(checkedTheme()).toBe("System");
    expect(root).not.toHaveAttribute(themeAttributeName);
  });

  it("offers the same choice in the footer while signed in", async () => {
    const { controller } = testController({ signedIn: true });

    render(
      <App
        session={controller}
        widths={testWidths()}
        theme={theme().controller}
      />,
    );
    expect(await screen.findByText(mockLogin)).toBeInTheDocument();

    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText(/Powered by/)).toBeInTheDocument();
    expect(checkedTheme(footer)).toBe("System");
    expect(
      within(themeControl(footer))
        .getAllByRole("radio")
        .map((radio) => {
          return radio.closest("label")?.textContent;
        }),
    ).toEqual(["System", "Light", "Dark"]);
  });

  it("sets the chosen theme on the root element and stores it, and System forgets it", async () => {
    const { controller } = testController();
    const { controller: themeController, store } = theme();

    render(
      <App
        session={controller}
        widths={testWidths()}
        theme={themeController}
      />,
    );
    await screen.findByRole("button", { name: "Sign in with GitHub" });

    choose("Dark");
    expect(root).toHaveAttribute(themeAttributeName, "dark");
    expect(store.get(themeStorageKey)).toBe("dark");
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

  it("applies the stored choice on start", async () => {
    const { controller } = testController();

    render(
      <App
        session={controller}
        widths={testWidths()}
        theme={theme("dark").controller}
      />,
    );

    expect(root).toHaveAttribute(themeAttributeName, "dark");
    expect(checkedTheme()).toBe("Dark");
    await screen.findByRole("button", { name: "Sign in with GitHub" });
  });

  it("follows the system when the stored choice is unknown or unreadable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { controller } = testController();
    const store = new MemoryStore();
    vi.spyOn(store, "get").mockImplementation(() => {
      throw new Error("storage is blocked");
    });
    const themeController = new ThemeController({
      store,
      root: new DomElementAttribute(root, themeAttributeName),
    });

    render(
      <App
        session={controller}
        widths={testWidths()}
        theme={themeController}
      />,
    );

    expect(root).not.toHaveAttribute(themeAttributeName);
    expect(checkedTheme()).toBe("System");
    expect(warn).toHaveBeenCalled();
    await screen.findByRole("button", { name: "Sign in with GitHub" });

    const unknown = new ThemeController({
      store: theme("sepia").store,
      root: new DomElementAttribute(root, themeAttributeName),
    });
    unknown.restore();
    expect(unknown.choice).toBe("system");
    expect(root).not.toHaveAttribute(themeAttributeName);
  });

  it("keeps the choice when the viewer signs out", async () => {
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
    choose("Dark");

    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByRole("button", { name: "Sign in with GitHub" });

    expect(store.get("yagura.last-viewer")).toBeUndefined();
    expect(store.get(themeStorageKey)).toBe("dark");
    expect(root).toHaveAttribute(themeAttributeName, "dark");
    expect(checkedTheme()).toBe("Dark");
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
