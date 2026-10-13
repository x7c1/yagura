/** Stops what a subscription started. */
export type Unsubscribe = () => void;

/** The page's address and its history entry. */
export interface PageLocation {
  readonly href: string;
  readonly origin: string;
  readonly pathname: string;
  /** The query string including its leading `?`, or `""`. */
  readonly search: string;
  /** Loads another URL, leaving the current page. */
  assign(url: URL | string): void;
  /**
   * Replaces the current history entry with `url` (same origin) without
   * loading it.
   */
  replace(url: string): void;
  /**
   * Adds a history entry for `url` (same origin) after the current one, and
   * moves to it without loading it.
   */
  push(url: string): void;
  /**
   * Calls `listener` whenever the user moves to another history entry of
   * this page (the back and forward buttons), after the location has moved.
   */
  onPopState(listener: () => void): Unsubscribe;
}

/** The location of a browser window. */
export class WindowLocation implements PageLocation {
  readonly #window: Window;

  constructor(window: Window) {
    this.#window = window;
  }

  get href(): string {
    return this.#window.location.href;
  }

  get origin(): string {
    return this.#window.location.origin;
  }

  get pathname(): string {
    return this.#window.location.pathname;
  }

  get search(): string {
    return this.#window.location.search;
  }

  assign(url: URL | string): void {
    this.#window.location.assign(url);
  }

  replace(url: string): void {
    this.#window.history.replaceState(null, "", url);
  }

  push(url: string): void {
    this.#window.history.pushState(null, "", url);
  }

  onPopState(listener: () => void): Unsubscribe {
    const handler = () => listener();
    this.#window.addEventListener("popstate", handler);
    return () => this.#window.removeEventListener("popstate", handler);
  }
}

/**
 * A location held in memory, with a history stack as a browser tab keeps
 * one. `assign` and `replace` both move the current URL; `assigned` lists
 * every URL passed to `assign`, in order. `back` and `forward` stand in for
 * the browser's buttons: they move within the stack and notify the
 * `onPopState` listeners.
 */
export class MemoryLocation implements PageLocation {
  /** The history entries, oldest first. */
  readonly #entries: URL[];
  #index = 0;
  readonly #assigned: URL[] = [];
  readonly #popStateListeners = new Set<() => void>();

  constructor(url: URL | string) {
    this.#entries = [new URL(url)];
  }

  get #url(): URL {
    const url = this.#entries[this.#index];
    if (url === undefined) {
      throw new Error(`No history entry at ${this.#index}`);
    }
    return url;
  }

  get href(): string {
    return this.#url.href;
  }

  get origin(): string {
    return this.#url.origin;
  }

  get pathname(): string {
    return this.#url.pathname;
  }

  get search(): string {
    return this.#url.search;
  }

  get assigned(): readonly URL[] {
    return this.#assigned;
  }

  /** The URLs of the history entries, oldest first. */
  get entries(): readonly string[] {
    return this.#entries.map(String);
  }

  assign(url: URL | string): void {
    const next = new URL(url, this.#url);
    this.#entries.splice(this.#index + 1, Infinity, next);
    this.#index += 1;
    this.#assigned.push(next);
  }

  replace(url: string): void {
    this.#entries[this.#index] = this.#sameOrigin(url);
  }

  push(url: string): void {
    const next = this.#sameOrigin(url);
    this.#entries.splice(this.#index + 1, Infinity, next);
    this.#index += 1;
  }

  onPopState(listener: () => void): Unsubscribe {
    // Wrapped, so that subscribing the same function twice counts twice.
    const entry = () => listener();
    this.#popStateListeners.add(entry);
    return () => this.#popStateListeners.delete(entry);
  }

  /** Moves to the previous history entry, as the back button does. */
  back(): void {
    this.#go(-1);
  }

  /** Moves to the next history entry, as the forward button does. */
  forward(): void {
    this.#go(1);
  }

  #go(delta: number): void {
    const index = this.#index + delta;
    if (index < 0 || index >= this.#entries.length) {
      throw new Error(`No history entry to move ${delta} to`);
    }
    this.#index = index;
    for (const listener of [...this.#popStateListeners]) {
      listener();
    }
  }

  #sameOrigin(url: string): URL {
    const next = new URL(url, this.#url);
    if (next.origin !== this.#url.origin) {
      throw new Error(`Cannot move from ${this.#url.origin} to ${next.origin}`);
    }
    return next;
  }
}
