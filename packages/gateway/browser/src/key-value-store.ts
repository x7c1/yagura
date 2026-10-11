/**
 * A string key-value store. Every method may throw when the underlying
 * storage is unavailable (disabled, full, or blocked by the browser).
 */
export interface KeyValueStore {
  /** The stored value, or `undefined` when the key is absent. */
  get(key: string): string | undefined;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/**
 * A store over a Web Storage area such as `sessionStorage`. The area is
 * obtained on every call, because merely reading `window.sessionStorage`
 * throws when the browser blocks storage; that failure then surfaces from
 * the operation that needed it.
 */
export class WebStorageStore implements KeyValueStore {
  readonly #storage: () => Storage;

  constructor(storage: () => Storage) {
    this.#storage = storage;
  }

  get(key: string): string | undefined {
    return this.#storage().getItem(key) ?? undefined;
  }

  set(key: string, value: string): void {
    this.#storage().setItem(key, value);
  }

  remove(key: string): void {
    this.#storage().removeItem(key);
  }
}

/** A store that keeps its entries in memory. */
export class MemoryStore implements KeyValueStore {
  readonly #entries = new Map<string, string>();

  get size(): number {
    return this.#entries.size;
  }

  get(key: string): string | undefined {
    return this.#entries.get(key);
  }

  set(key: string, value: string): void {
    this.#entries.set(key, value);
  }

  remove(key: string): void {
    this.#entries.delete(key);
  }
}
