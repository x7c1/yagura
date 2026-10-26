import { renderHook, waitFor } from "@testing-library/react";
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
