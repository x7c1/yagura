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
