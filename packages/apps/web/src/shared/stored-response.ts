import type { JsonValue } from "@yagura/browser";
import { isRecord } from "./is-record";
import type { StoredThenFetchedSource } from "./use-stored-then-fetched";
import type { ViewerCache } from "./viewer-cache";

/**
 * How long a stored response is drawn after it was stored. Without an
 * expiry, what a viewer can no longer see on GitHub would stay on screen
 * until the next answer replaced it; the expiry bounds how long that can
 * last when the page is not opened for a while.
 */
export const storedLifeMs = 7 * 24 * 60 * 60 * 1000;

/** How a response is written to the browser cache and read back. */
export interface ResponseCodec<T> {
  readonly encode: (value: T) => JsonValue;
  /** The stored value, or `undefined` when it is not readable as one. */
  readonly decode: (value: unknown) => T | undefined;
}

/** What a {@link storedThenFetched} source needs. */
export interface StoredResponseOptions<T> {
  /** The viewer's part of the browser cache, asked for on every use. */
  readonly cache: () => ViewerCache;
  /** The cache key, under the viewer's prefix. */
  readonly key: string;
  readonly codec: ResponseCodec<T>;
  readonly now: () => Date;
  /** Asks the API for the response. */
  readonly fetch: () => Promise<T>;
}

/**
 * A source that draws the last response stored under `key` at once,
 * unless it was stored more than {@link storedLifeMs} ago, then asks the
 * API again and stores its answer in place of the last one.
 */
export function storedThenFetched<T>(
  options: StoredResponseOptions<T>,
): StoredThenFetchedSource<T> {
  const { key, codec, now } = options;
  return {
    stored: async () => {
      const entry = await options.cache().get(key);
      if (
        !isRecord(entry) ||
        typeof entry.storedAt !== "number" ||
        now().getTime() - entry.storedAt >= storedLifeMs
      ) {
        return undefined;
      }
      return codec.decode(entry.response);
    },
    fetch: async () => {
      const response = await options.fetch();
      await options.cache().set(key, {
        storedAt: now().getTime(),
        response: codec.encode(response),
      });
      return response;
    },
  };
}
