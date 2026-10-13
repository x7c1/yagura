import type { JsonStore, JsonValue } from "@yagura/browser";

/** The prefix of every cache key of the signed-in `login`. */
export function viewerCachePrefix(login: string): string {
  // A login cannot contain "/", so no viewer's prefix starts another's.
  return `${login}/`;
}

/**
 * The browser cache (docs/design/activity-view.md, "The browser cache") as
 * one signed-in viewer sees it: every key is under the viewer's
 * {@link viewerCachePrefix}, so that one viewer never reads another's
 * entries.
 *
 * The cache only saves requests, so it never fails: a failing store reads
 * as empty and ignores writes, with a warning in the console. Writes are
 * also ignored while `isCurrent` says the session is not confirmed as the
 * viewer: before the session is confirmed, so that an ended session never
 * writes, and after sign-out, so that a load finishing then does not store
 * anything again.
 */
export class ViewerCache {
  readonly #store: JsonStore;
  readonly #prefix: string;
  readonly #isCurrent: () => boolean;

  constructor(store: JsonStore, login: string, isCurrent: () => boolean) {
    this.#store = store;
    this.#prefix = viewerCachePrefix(login);
    this.#isCurrent = isCurrent;
  }

  /** The stored value, or `undefined` when it is absent or unreadable. */
  async get(key: string): Promise<unknown> {
    try {
      return await this.#store.get(this.#prefix + key);
    } catch (error) {
      warn(`read ${key}`, error);
      return undefined;
    }
  }

  async set(key: string, value: JsonValue): Promise<void> {
    if (!this.#isCurrent()) {
      return;
    }
    try {
      await this.#store.set(this.#prefix + key, value);
    } catch (error) {
      warn(`write ${key}`, error);
    }
  }
}

/** Deletes every entry of `login`; a failure is only warned about. */
export async function clearViewerCache(
  store: JsonStore,
  login: string,
): Promise<void> {
  try {
    await store.deleteByPrefix(viewerCachePrefix(login));
  } catch (error) {
    warn("clear the entries", error);
  }
}

function warn(action: string, error: unknown): void {
  console.warn(`Could not ${action} in the browser cache:`, error);
}
