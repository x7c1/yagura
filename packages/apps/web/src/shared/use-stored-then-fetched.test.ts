import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  useStoredThenFetched,
  type StoredThenFetchedSource,
} from "./use-stored-then-fetched";

describe("useStoredThenFetched", () => {
  const rejections: unknown[] = [];
  const onRejection = (reason: unknown) => rejections.push(reason);

  afterEach(() => {
    process.off("unhandledRejection", onRejection);
    rejections.length = 0;
  });

  it("draws the fetched value when reading the cache throws synchronously", async () => {
    process.on("unhandledRejection", onRejection);
    // As `viewerCache` does when the viewer signed out before the effect ran.
    const source: StoredThenFetchedSource<string> = {
      stored: () => {
        throw new Error("Not signed in");
      },
      fetch: () => Promise.resolve("fetched"),
    };

    const { result } = renderHook(() => useStoredThenFetched(source));

    await waitFor(() => expect(result.current.value).toBe("fetched"));
    expect(result.current.error).toBeUndefined();
    // Let a rejection that escaped the hook be reported before checking.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(rejections).toEqual([]);
  });
});

describe("useStoredThenFetched, drawing the stored value first", () => {
  it("draws the stored value as updating, then replaces it with the fetched one", async () => {
    let answer!: (value: string) => void;
    const source: StoredThenFetchedSource<string> = {
      stored: () => Promise.resolve("stored"),
      fetch: () =>
        new Promise((resolve) => {
          answer = resolve;
        }),
    };

    const { result } = renderHook(() => useStoredThenFetched(source));

    await waitFor(() => expect(result.current.value).toBe("stored"));
    expect(result.current.updating).toBe(true);
    answer("fetched");
    await waitFor(() => expect(result.current.value).toBe("fetched"));
    expect(result.current.updating).toBe(false);
  });

  it("keeps the stored value when the fetch fails, and retries", async () => {
    let attempts = 0;
    const source: StoredThenFetchedSource<string> = {
      stored: () => Promise.resolve("stored"),
      fetch: () => {
        attempts += 1;
        return attempts === 1
          ? Promise.reject(new Error("offline"))
          : Promise.resolve("fetched");
      },
    };

    const { result } = renderHook(() => useStoredThenFetched(source));

    await waitFor(() => expect(result.current.error).toBe("unavailable"));
    expect(result.current.value).toBe("stored");
    expect(result.current.updating).toBe(false);
    result.current.retry();
    await waitFor(() => expect(result.current.value).toBe("fetched"));
    expect(result.current.error).toBeUndefined();
  });
});

describe("useStoredThenFetched, refreshing", () => {
  it("fetches again without reading the cache, keeping what is drawn as updating", async () => {
    let reads = 0;
    let fetches = 0;
    let answer!: (value: string) => void;
    const source: StoredThenFetchedSource<string> = {
      stored: () => {
        reads += 1;
        return Promise.resolve("stored");
      },
      fetch: () => {
        fetches += 1;
        return fetches === 1
          ? Promise.resolve("first")
          : new Promise((resolve) => {
              answer = resolve;
            });
      },
    };

    const { result } = renderHook(() => useStoredThenFetched(source));
    await waitFor(() => expect(result.current.value).toBe("first"));
    act(() => result.current.refresh());

    await waitFor(() => expect(result.current.updating).toBe(true));
    expect(result.current.value).toBe("first");
    expect(reads).toBe(1);
    act(() => answer("second"));
    await waitFor(() => expect(result.current.value).toBe("second"));
    expect(result.current.updating).toBe(false);
  });

  it("runs one more fetch after the running one, however many refreshes are asked for", async () => {
    const answers: ((value: string) => void)[] = [];
    const source: StoredThenFetchedSource<string> = {
      stored: () => Promise.resolve(undefined),
      fetch: () =>
        new Promise((resolve) => {
          answers.push(resolve);
        }),
    };

    const { result } = renderHook(() => useStoredThenFetched(source));
    await waitFor(() => expect(answers).toHaveLength(1));
    act(() => {
      result.current.refresh();
      result.current.refresh();
      result.current.refresh();
    });
    expect(answers).toHaveLength(1);

    act(() => answers[0]?.("first"));
    await waitFor(() => expect(answers).toHaveLength(2));
    expect(result.current.value).toBe("first");
    act(() => answers[1]?.("second"));
    await waitFor(() => expect(result.current.value).toBe("second"));
    expect(answers).toHaveLength(2);
  });
});
