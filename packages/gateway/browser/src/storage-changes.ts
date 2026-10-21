import type { Unsubscribe } from "./page-location";

/**
 * The changes that the browser's other tabs make to a storage area, such as
 * `localStorage`, which a tab is not told of otherwise. The tab's own
 * changes are not reported.
 */
export interface StorageChanges {
  /**
   * Calls `listener` with the key of each entry another tab sets or
   * removes, or `null` when another tab clears the whole area.
   */
  onChange(listener: (key: string | null) => void): Unsubscribe;
}

/**
 * The changes to a Web Storage area, from the window's `storage` events.
 * The area is obtained on every event, as {@link WebStorageStore} obtains
 * it, and an event for another area, or one that arrives while the area
 * cannot be reached, is ignored.
 */
export class WindowStorageChanges implements StorageChanges {
  readonly #window: Window;
  readonly #storage: () => Storage;

  constructor(window: Window, storage: () => Storage) {
    this.#window = window;
    this.#storage = storage;
  }

  onChange(listener: (key: string | null) => void): Unsubscribe {
    const handler = (event: StorageEvent) => {
      if (this.#isOwnArea(event)) {
        listener(event.key);
      }
    };
    this.#window.addEventListener("storage", handler);
    return () => this.#window.removeEventListener("storage", handler);
  }

  #isOwnArea(event: StorageEvent): boolean {
    try {
      return event.storageArea === this.#storage();
    } catch {
      return false;
    }
  }
}

/**
 * Storage changes held in memory, made by {@link change} as another tab
 * would make them.
 */
export class MemoryStorageChanges implements StorageChanges {
  readonly #listeners = new Set<(key: string | null) => void>();

  /** The number of listeners subscribed, for checking that they stop. */
  get listeners(): number {
    return this.#listeners.size;
  }

  onChange(listener: (key: string | null) => void): Unsubscribe {
    // Wrapped, so that subscribing the same function twice counts twice.
    const entry = (key: string | null) => listener(key);
    this.#listeners.add(entry);
    return () => this.#listeners.delete(entry);
  }

  /** Reports a change to `key`, or `null` for the area cleared. */
  change(key: string | null): void {
    for (const listener of [...this.#listeners]) {
      listener(key);
    }
  }
}
