import type {
  ElementAttribute,
  KeyValueStore,
  StorageChanges,
  Unsubscribe,
} from "@yagura/browser";

/**
 * The theme the viewer chose: `system` follows the operating system's
 * colour scheme, and `light` and `dark` override it.
 */
export type ThemeChoice = "system" | "light" | "dark";

/** The choices in the order the header's menu offers them. */
export const themeChoices: readonly ThemeChoice[] = ["system", "light", "dark"];

/**
 * The `localStorage` key of an explicit choice; System is stored as its
 * absence. The early script in `index.html` reads the same key, to apply
 * the choice before the first paint, and a test keeps the two the same.
 */
export const themeStorageKey = "yagura.theme";

/**
 * The attribute on the root element that `global.css` selects the theme
 * on: `light` or `dark`, or absent to follow the operating system.
 */
export const themeAttributeName = "data-theme";

export interface ThemeControllerOptions {
  /**
   * Keeps the choice across page loads, tabs and sign-outs (`localStorage`
   * in the browser): it is the browser's preference, not the viewer's.
   */
  readonly store: KeyValueStore;
  /**
   * The changes the browser's other tabs make to `store`, so that a choice
   * made in one tab applies in every other.
   */
  readonly changes: StorageChanges;
  /** The root element's {@link themeAttributeName} attribute. */
  readonly root: ElementAttribute;
}

/**
 * Owns the theme choice: applies it to the root element, where the style
 * sheets pick it up, and stores it. Framework-free; the React binding
 * subscribes to it.
 */
export class ThemeController {
  readonly #store: KeyValueStore;
  readonly #changes: StorageChanges;
  readonly #root: ElementAttribute;
  readonly #listeners = new Set<() => void>();
  #choice: ThemeChoice = "system";

  constructor(options: ThemeControllerOptions) {
    this.#store = options.store;
    this.#changes = options.changes;
    this.#root = options.root;
  }

  get choice(): ThemeChoice {
    return this.#choice;
  }

  subscribe(listener: () => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /**
   * Applies the stored choice, as the early script in `index.html` already
   * has, so that the root element and the menu agree with it. A missing,
   * unknown or unreadable value is System.
   */
  restore(): void {
    this.#apply(this.#read());
  }

  /**
   * Applies the choice another tab stores, or forgets, from now until the
   * returned function is called, as {@link restore} applies it on load.
   */
  followOtherTabs(): Unsubscribe {
    return this.#changes.onChange((key) => {
      // `null`: the other tab cleared the whole store, the choice with it.
      if (key === themeStorageKey || key === null) {
        this.restore();
      }
    });
  }

  /**
   * Applies `choice` and stores it, or forgets the stored one for System.
   * A store that fails only loses the choice for later page loads; this
   * page still takes it.
   */
  choose(choice: ThemeChoice): void {
    this.#apply(choice);
    try {
      if (choice === "system") {
        this.#store.remove(themeStorageKey);
      } else {
        this.#store.set(themeStorageKey, choice);
      }
    } catch (error) {
      warn("store", error);
    }
  }

  #read(): ThemeChoice {
    try {
      const stored = this.#store.get(themeStorageKey);
      return stored === "light" || stored === "dark" ? stored : "system";
    } catch (error) {
      warn("read", error);
      return "system";
    }
  }

  #apply(choice: ThemeChoice): void {
    this.#root.set(choice === "system" ? undefined : choice);
    if (choice !== this.#choice) {
      this.#choice = choice;
      for (const listener of [...this.#listeners]) {
        listener();
      }
    }
  }
}

function warn(action: string, error: unknown): void {
  console.warn(`Could not ${action} the theme:`, error);
}
