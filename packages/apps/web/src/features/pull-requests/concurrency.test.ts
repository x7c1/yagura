import { describe, expect, it } from "vitest";
import { mapConcurrently } from "./concurrency";

/** A promise with its resolve and reject exposed. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("mapConcurrently", () => {
  it("runs at most `limit` calls at a time and keeps the order", async () => {
    const calls = new Map<number, ReturnType<typeof deferred<string>>>();
    const result = mapConcurrently([1, 2, 3, 4, 5, 6], 4, (n) => {
      const call = deferred<string>();
      calls.set(n, call);
      return call.promise;
    });

    await settle();
    expect([...calls.keys()]).toEqual([1, 2, 3, 4]);

    calls.get(2)?.resolve("two");
    await settle();
    expect([...calls.keys()]).toEqual([1, 2, 3, 4, 5]);

    for (const [n, call] of calls) {
      call.resolve(`#${n}`);
    }
    await settle();
    calls.get(6)?.resolve("#6");

    await expect(result).resolves.toEqual([
      "#1",
      "two",
      "#3",
      "#4",
      "#5",
      "#6",
    ]);
  });

  it("rejects with the first failure and starts no further calls", async () => {
    const started: number[] = [];
    const result = mapConcurrently([1, 2, 3, 4], 2, async (n) => {
      started.push(n);
      if (n === 1) {
        throw new Error("boom");
      }
      await settle();
      return n;
    });

    await expect(result).rejects.toThrow("boom");
    await settle();
    expect(started).toEqual([1, 2]);
  });

  it("resolves to an empty list for no items", async () => {
    await expect(mapConcurrently([], 4, async () => 1)).resolves.toEqual([]);
  });
});
