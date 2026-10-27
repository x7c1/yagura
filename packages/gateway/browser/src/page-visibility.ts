import type { Unsubscribe } from "./page-location";

/** Whether the page is visible: its tab shown and its window not minimized. */
export interface PageVisibility {
  readonly visible: boolean;
  /** Calls `listener` each time the page is hidden or shown again. */
  onChange(listener: () => void): Unsubscribe;
}

/** The visibility of a document, from its `visibilitychange` events. */
export class DocumentVisibility implements PageVisibility {
  readonly #document: Document;

  constructor(document: Document) {
    this.#document = document;
  }

  get visible(): boolean {
    return this.#document.visibilityState === "visible";
  }

  onChange(listener: () => void): Unsubscribe {
    const handler = () => listener();
    this.#document.addEventListener("visibilitychange", handler);
    return () =>
      this.#document.removeEventListener("visibilitychange", handler);
  }
}

/** A visibility held in memory, changed by {@link set}. Visible at first. */
export class MemoryVisibility implements PageVisibility {
  readonly #listeners = new Set<() => void>();
  #visible = true;

  get visible(): boolean {
    return this.#visible;
  }

  /** The number of listeners subscribed, for checking that they stop. */
  get listeners(): number {
    return this.#listeners.size;
  }

  /** Hides or shows the page, telling the listeners when it changes. */
  set(visible: boolean): void {
    if (visible === this.#visible) {
      return;
    }
    this.#visible = visible;
    for (const listener of [...this.#listeners]) {
      listener();
    }
  }

  onChange(listener: () => void): Unsubscribe {
    const entry = () => listener();
    this.#listeners.add(entry);
    return () => this.#listeners.delete(entry);
  }
}
