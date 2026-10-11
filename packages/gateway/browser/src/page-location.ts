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
}

/**
 * A location held in memory. `assign` and `replace` both move the current
 * URL; `assigned` lists every URL passed to `assign`, in order.
 */
export class MemoryLocation implements PageLocation {
  #url: URL;
  readonly #assigned: URL[] = [];

  constructor(url: URL | string) {
    this.#url = new URL(url);
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

  assign(url: URL | string): void {
    this.#url = new URL(url, this.#url);
    this.#assigned.push(this.#url);
  }

  replace(url: string): void {
    const next = new URL(url, this.#url);
    if (next.origin !== this.#url.origin) {
      throw new Error(`Cannot replace ${this.#url.origin} with ${next.origin}`);
    }
    this.#url = next;
  }
}
