/** A value that survives a JSON round trip. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/**
 * An asynchronous store of JSON values by string key. Every method may
 * reject when the underlying storage is unavailable (disabled, full, or
 * blocked by the browser).
 */
export interface JsonStore {
  /** The stored value, or `undefined` when the key is absent. */
  get(key: string): Promise<unknown>;
  set(key: string, value: JsonValue): Promise<void>;
  delete(key: string): Promise<void>;
  /** Deletes every entry whose key starts with `prefix`. */
  deleteByPrefix(prefix: string): Promise<void>;
}

/** The IndexedDB database {@link IndexedDbStore} uses, and its one store. */
const databaseName = "yagura";
const databaseVersion = 1;
const storeName = "entries";

/**
 * A store over one IndexedDB database with one object store. The factory
 * is obtained on first use, because merely reading `window.indexedDB` may
 * throw when the browser blocks storage; that failure then surfaces from
 * the operation that needed it. A failure to open the database is not
 * kept: the next operation tries again.
 */
export class IndexedDbStore implements JsonStore {
  readonly #factory: () => IDBFactory;
  #database: Promise<IDBDatabase> | undefined;

  constructor(factory: () => IDBFactory) {
    this.#factory = factory;
  }

  async get(key: string): Promise<unknown> {
    return this.#run("readonly", (store) => store.get(key));
  }

  async set(key: string, value: JsonValue): Promise<void> {
    await this.#run("readwrite", (store) => store.put(value, key));
  }

  async delete(key: string): Promise<void> {
    await this.#run("readwrite", (store) => store.delete(key));
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    await this.#run("readwrite", (store) => {
      // Keys sort as strings, so those with the prefix follow it directly.
      const request = store.openCursor(IDBKeyRange.lowerBound(prefix));
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor && String(cursor.key).startsWith(prefix)) {
          cursor.delete();
          cursor.continue();
        }
      };
      return request;
    });
  }

  /**
   * Runs one request in a transaction and resolves to its result once the
   * transaction has completed, so that a write has been committed.
   */
  async #run(
    mode: IDBTransactionMode,
    request: (store: IDBObjectStore) => IDBRequest,
  ): Promise<unknown> {
    const database = await this.#open();
    return new Promise((resolve, reject) => {
      const transaction = database.transaction(storeName, mode);
      const pending = request(transaction.objectStore(storeName));
      transaction.oncomplete = () => resolve(pending.result);
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
    });
  }

  #open(): Promise<IDBDatabase> {
    this.#database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.#factory().open(databaseName, databaseVersion);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(storeName);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error("Opening the IndexedDB database was blocked"));
    }).catch((error: unknown) => {
      this.#database = undefined;
      throw error;
    });
    return this.#database;
  }
}

/**
 * A store that keeps its entries in memory. Values go through a JSON round
 * trip, so that what comes back is what a real store would return.
 */
export class MemoryJsonStore implements JsonStore {
  readonly #entries = new Map<string, string>();

  /** The stored keys, in insertion order. */
  get keys(): readonly string[] {
    return [...this.#entries.keys()];
  }

  async get(key: string): Promise<unknown> {
    const text = this.#entries.get(key);
    return text === undefined ? undefined : JSON.parse(text);
  }

  async set(key: string, value: JsonValue): Promise<void> {
    this.#entries.set(key, JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    this.#entries.delete(key);
  }

  async deleteByPrefix(prefix: string): Promise<void> {
    for (const key of this.keys) {
      if (key.startsWith(prefix)) {
        this.#entries.delete(key);
      }
    }
  }
}
