import type { Unsubscribe } from "./page-location";

/**
 * A channel between the tabs of one browser that show the same origin, for
 * telling the others what happened in this one. A message is delivered to
 * every other tab's channel of the same name, never back to the tab that
 * posted it. Delivery is best effort: a tab that is asleep, or a browser
 * without the means, may never receive it.
 */
export interface TabChannel {
  /** Sends `message` to the other tabs. */
  post(message: string): void;
  /** Calls `listener` with each message another tab posts. */
  onMessage(listener: (message: string) => void): Unsubscribe;
}

/**
 * A channel over a `BroadcastChannel`, obtained once through `open`. When
 * the browser has no `BroadcastChannel`, or opening one throws, the channel
 * sends nothing and receives nothing, with a warning in the console: the
 * other tabs then learn what happened by other means.
 */
export class BroadcastTabChannel implements TabChannel {
  readonly #channel: BroadcastChannel | undefined;

  constructor(open: () => BroadcastChannel) {
    try {
      this.#channel = open();
    } catch (error) {
      console.warn("Could not open a channel to the other tabs:", error);
    }
  }

  post(message: string): void {
    try {
      this.#channel?.postMessage(message);
    } catch (error) {
      console.warn("Could not tell the other tabs:", error);
    }
  }

  onMessage(listener: (message: string) => void): Unsubscribe {
    const channel = this.#channel;
    if (channel === undefined) {
      return () => {};
    }
    const handler = (event: MessageEvent) => {
      // Only the app's own tabs post here, but a message of another shape
      // is ignored rather than trusted.
      if (typeof event.data === "string") {
        listener(event.data);
      }
    };
    channel.addEventListener("message", handler);
    return () => channel.removeEventListener("message", handler);
  }
}

/**
 * A channel held in memory, standing for one tab. The channels opened from
 * one another through {@link openTab} stand for tabs of the same browser:
 * a message posted on one is delivered, synchronously and in the order of
 * opening, to the listeners of every other, and never to its own.
 */
export class MemoryTabChannel implements TabChannel {
  readonly #tabs: Set<MemoryTabChannel>;
  readonly #listeners = new Set<(message: string) => void>();
  readonly #posted: string[] = [];

  /** Opens the first tab of a new browser, or another tab of `sibling`'s. */
  constructor(sibling?: MemoryTabChannel) {
    this.#tabs = sibling === undefined ? new Set() : sibling.#tabs;
    this.#tabs.add(this);
  }

  /** The messages this tab has posted, in order. */
  get posted(): readonly string[] {
    return this.#posted;
  }

  /** Opens another tab of the same browser. */
  openTab(): MemoryTabChannel {
    return new MemoryTabChannel(this);
  }

  post(message: string): void {
    this.#posted.push(message);
    for (const tab of this.#tabs) {
      if (tab !== this) {
        tab.#deliver(message);
      }
    }
  }

  onMessage(listener: (message: string) => void): Unsubscribe {
    // Wrapped, so that subscribing the same function twice counts twice.
    const entry = (message: string) => listener(message);
    this.#listeners.add(entry);
    return () => this.#listeners.delete(entry);
  }

  #deliver(message: string): void {
    for (const listener of [...this.#listeners]) {
      listener(message);
    }
  }
}
