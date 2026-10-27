import type { Unsubscribe } from "./page-location";

/** The browser's changes of network, as the window reports them. */
export type NetworkEvent = "online";

/** Tells when the browser comes back online. */
export interface NetworkEvents {
  /** Calls `listener` each time the browser reports `event`. */
  on(event: NetworkEvent, listener: () => void): Unsubscribe;
}

/** The network events of a window, from its `online` events. */
export class WindowNetworkEvents implements NetworkEvents {
  readonly #window: Window;

  constructor(window: Window) {
    this.#window = window;
  }

  on(event: NetworkEvent, listener: () => void): Unsubscribe {
    const handler = () => listener();
    this.#window.addEventListener(event, handler);
    return () => this.#window.removeEventListener(event, handler);
  }
}

/** Network events held in memory, reported by {@link report}. */
export class MemoryNetworkEvents implements NetworkEvents {
  readonly #listeners = new Set<{
    readonly event: NetworkEvent;
    readonly listener: () => void;
  }>();

  /** The number of listeners subscribed, for checking that they stop. */
  get listeners(): number {
    return this.#listeners.size;
  }

  on(event: NetworkEvent, listener: () => void): Unsubscribe {
    // Wrapped, so that subscribing the same function twice counts twice.
    const entry = { event, listener };
    this.#listeners.add(entry);
    return () => this.#listeners.delete(entry);
  }

  /** Reports `event` to the listeners subscribed to it. */
  report(event: NetworkEvent): void {
    for (const entry of [...this.#listeners]) {
      if (entry.event === event) {
        entry.listener();
      }
    }
  }
}
