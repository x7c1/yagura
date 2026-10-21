import { useCallback, useEffect, useState } from "react";
import { classifyLoadFailure, type LoadFailure } from "./load-failure";

/** A value read from the browser cache, without any request. */
export interface Stored<T> {
  readonly value: T;
  /**
   * Whether the fetch is known to request nothing, the stored value being
   * within its short life, so that it is not shown as updating.
   */
  readonly fresh: boolean;
}

/** Where a value comes from: the browser cache first, then a fetch. */
export interface StoredThenFetchedSource<T> {
  /** What the cache holds, or `undefined` when it holds nothing to draw. */
  readonly stored: () => Promise<Stored<T> | undefined>;
  /** The up-to-date value. */
  readonly fetch: () => Promise<T>;
}

export interface StoredThenFetched<T> {
  /**
   * The value to draw: the fetched one once it arrived, else the stored
   * one, else `undefined` (nothing to draw yet).
   */
  readonly value: T | undefined;
  /** Whether a fetch that may change `value` is running behind it. */
  readonly updating: boolean;
  /**
   * Why the last fetch failed, until a retry starts. The failure itself
   * goes to the console.
   */
  readonly error: LoadFailure | undefined;
  /** Runs the fetch again, keeping what is drawn. */
  readonly retry: () => void;
}

interface State<T> {
  readonly source: StoredThenFetchedSource<T>;
  readonly value: T | undefined;
  readonly fresh: boolean;
  readonly running: boolean;
  readonly error: LoadFailure | undefined;
}

/**
 * Draws what the browser cache holds at once and brings it up to date
 * behind it (stale-while-revalidate): on mount and whenever `source`
 * changes (memoize it), reads `source.stored` and then runs
 * `source.fetch`, whose result replaces the stored one. `retry` reads and
 * fetches again without clearing what is drawn.
 *
 * A fetched value equal to the drawn one (as JSON) keeps the drawn object,
 * so that what depends on its identity is not loaded again. A result that
 * arrives after `source` changed or the component unmounted is dropped.
 */
export function useStoredThenFetched<T>(
  source: StoredThenFetchedSource<T>,
): StoredThenFetched<T> {
  const [state, setState] = useState<State<T>>(() => initial(source));
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    // A retry keeps what this source drew; a new source starts afresh.
    setState((prev) =>
      prev.source === source
        ? { ...prev, running: true, error: undefined }
        : initial(source),
    );
    void (async () => {
      // The cache only saves requests: a failing read is drawn as nothing.
      // `try` also catches a source that throws instead of rejecting, as
      // one does when the viewer signed out before this effect ran.
      let stored: Stored<T> | undefined;
      try {
        stored = await source.stored();
      } catch {
        stored = undefined;
      }
      if (!current) {
        return;
      }
      if (stored !== undefined) {
        setState((prev) => ({
          ...prev,
          value: sameOrNext(prev.value, stored.value),
          fresh: stored.fresh,
        }));
      }
      try {
        const value = await source.fetch();
        if (current) {
          setState((prev) => ({
            ...prev,
            value: sameOrNext(prev.value, value),
            running: false,
          }));
        }
      } catch (error) {
        if (current) {
          console.warn("Could not fetch:", error);
          setState((prev) => ({
            ...prev,
            running: false,
            error: classifyLoadFailure(error),
          }));
        }
      }
    })();
    return () => {
      current = false;
    };
  }, [source, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  // Until the effect has run for a new source, nothing of it is drawn.
  const shown = state.source === source ? state : initial(source);
  return {
    value: shown.value,
    updating: shown.running && shown.value !== undefined && !shown.fresh,
    error: shown.error,
    retry,
  };
}

function initial<T>(source: StoredThenFetchedSource<T>): State<T> {
  return {
    source,
    value: undefined,
    fresh: false,
    running: true,
    error: undefined,
  };
}

function sameOrNext<T>(prev: T | undefined, next: T): T {
  return prev !== undefined && JSON.stringify(prev) === JSON.stringify(next)
    ? prev
    : next;
}
