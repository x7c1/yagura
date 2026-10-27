import { useCallback, useEffect, useRef, useState } from "react";
import { classifyLoadFailure, type LoadFailure } from "./load-failure";

/** Where a value comes from: the browser cache first, then a fetch. */
export interface StoredThenFetchedSource<T> {
  /** What the cache holds, or `undefined` when it holds nothing to draw. */
  readonly stored: () => Promise<T | undefined>;
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
  /**
   * Fetches again, keeping what is drawn, without reading the cache
   * first, as when the server signals new activity. While a fetch runs,
   * it is not started at once: one more fetch follows the running one,
   * however many refreshes were asked for meanwhile, so that no two
   * fetches run at once.
   */
  readonly refresh: () => void;
}

/** One run of the effect: a load, a retry, or a refresh. */
interface Attempt {
  readonly count: number;
  /** Whether the cache is read before the fetch. */
  readonly readStored: boolean;
}

interface State<T> {
  readonly source: StoredThenFetchedSource<T>;
  readonly value: T | undefined;
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
 * `refresh` fetches again without reading the cache, and never while a
 * fetch for the same source runs.
 */
export function useStoredThenFetched<T>(
  source: StoredThenFetchedSource<T>,
): StoredThenFetched<T> {
  const [state, setState] = useState<State<T>>(() => initial(source));
  const [attempt, setAttempt] = useState<Attempt>({
    count: 0,
    readStored: true,
  });
  // Whether a fetch for the current source runs, and whether a refresh
  // waits for it to end.
  const running = useRef(false);
  const queued = useRef(false);

  const refreshNow = useCallback(
    () => setAttempt(({ count }) => ({ count: count + 1, readStored: false })),
    [],
  );

  useEffect(() => {
    let current = true;
    running.current = true;
    // A retry keeps what this source drew; a new source starts afresh.
    setState((prev) =>
      prev.source === source
        ? { ...prev, running: true, error: undefined }
        : initial(source),
    );
    const settled = () => {
      running.current = false;
      if (queued.current) {
        queued.current = false;
        refreshNow();
      }
    };
    void (async () => {
      // The cache only saves waiting: a failing read is drawn as nothing.
      // `try` also catches a source that throws instead of rejecting, as
      // one does when the viewer signed out before this effect ran.
      if (attempt.readStored) {
        let stored: T | undefined;
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
            value: sameOrNext(prev.value, stored),
          }));
        }
      }
      try {
        const value = await source.fetch();
        if (current) {
          setState((prev) => ({
            ...prev,
            value: sameOrNext(prev.value, value),
            running: false,
          }));
          settled();
        }
      } catch (error) {
        if (current) {
          console.warn("Could not fetch:", error);
          setState((prev) => ({
            ...prev,
            running: false,
            error: classifyLoadFailure(error),
          }));
          settled();
        }
      }
    })();
    return () => {
      current = false;
      running.current = false;
      queued.current = false;
    };
  }, [source, attempt, refreshNow]);

  const retry = useCallback(
    () => setAttempt(({ count }) => ({ count: count + 1, readStored: true })),
    [],
  );
  const refresh = useCallback(() => {
    if (running.current) {
      queued.current = true;
    } else {
      refreshNow();
    }
  }, [refreshNow]);
  // Until the effect has run for a new source, nothing of it is drawn.
  const shown = state.source === source ? state : initial(source);
  return {
    value: shown.value,
    updating: shown.running && shown.value !== undefined,
    error: shown.error,
    retry,
    refresh,
  };
}

function initial<T>(source: StoredThenFetchedSource<T>): State<T> {
  return {
    source,
    value: undefined,
    running: true,
    error: undefined,
  };
}

function sameOrNext<T>(prev: T | undefined, next: T): T {
  return prev !== undefined && JSON.stringify(prev) === JSON.stringify(next)
    ? prev
    : next;
}
