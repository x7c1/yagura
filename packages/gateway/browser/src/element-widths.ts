import type { Unsubscribe } from "./page-location";

/** Reports the widths of elements as they are laid out. */
export interface ElementWidths {
  /**
   * Calls `listener` with `element`'s border-box width in CSS pixels, once
   * right away and again whenever the width changes, until unsubscribed.
   */
  observe(element: Element, listener: (width: number) => void): Unsubscribe;
}

/** The widths of a page's elements, through `ResizeObserver`. */
export class ResizeObserverWidths implements ElementWidths {
  readonly #create: (callback: ResizeObserverCallback) => ResizeObserver;

  constructor(create: (callback: ResizeObserverCallback) => ResizeObserver) {
    this.#create = create;
  }

  observe(element: Element, listener: (width: number) => void): Unsubscribe {
    let last = element.getBoundingClientRect().width;
    listener(last);
    const observer = this.#create((entries) => {
      for (const entry of entries) {
        const width =
          entry.borderBoxSize[0]?.inlineSize ?? entry.contentRect.width;
        if (width !== last) {
          last = width;
          listener(width);
        }
      }
    });
    observer.observe(element, { box: "border-box" });
    return () => observer.disconnect();
  }
}

/**
 * Widths held in memory: every element observed is `width` wide, and
 * setting `width` tells every listener, as a resize of the page would.
 */
export class MemoryElementWidths implements ElementWidths {
  #width: number;
  readonly #listeners = new Set<(width: number) => void>();

  constructor(width: number) {
    this.#width = width;
  }

  get width(): number {
    return this.#width;
  }

  set width(width: number) {
    this.#width = width;
    for (const listener of [...this.#listeners]) {
      listener(width);
    }
  }

  /** The number of observations not yet unsubscribed. */
  get observing(): number {
    return this.#listeners.size;
  }

  observe(_element: Element, listener: (width: number) => void): Unsubscribe {
    // Wrapped, so that observing with the same function twice counts twice.
    const entry = (width: number) => listener(width);
    this.#listeners.add(entry);
    entry(this.#width);
    return () => {
      this.#listeners.delete(entry);
    };
  }
}
