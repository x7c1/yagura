/**
 * One attribute of one element, such as the root element's `data-theme`,
 * which the page's style sheets select on.
 */
export interface ElementAttribute {
  /** Sets the attribute to `value`, or removes it when `value` is `undefined`. */
  set(value: string | undefined): void;
}

/** An attribute of an element of a page's document. */
export class DomElementAttribute implements ElementAttribute {
  readonly #element: Element;
  readonly #name: string;

  constructor(element: Element, name: string) {
    this.#element = element;
    this.#name = name;
  }

  set(value: string | undefined): void {
    if (value === undefined) {
      this.#element.removeAttribute(this.#name);
    } else {
      this.#element.setAttribute(this.#name, value);
    }
  }
}

/** An attribute held in memory, absent at first. */
export class MemoryElementAttribute implements ElementAttribute {
  #value: string | undefined;

  /** The value last set, or `undefined` when absent, for a test to see. */
  get(): string | undefined {
    return this.#value;
  }

  set(value: string | undefined): void {
    this.#value = value;
  }
}
