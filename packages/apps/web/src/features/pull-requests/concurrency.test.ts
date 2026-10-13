import { describe, expect, it } from "vitest";
import { concurrencyLimit } from "./concurrency";

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

describe("concurrencyLimit", () => {
  it("runs at most `limit` tasks at a time, in the order given", async () => {
    const limit = concurrencyLimit(4);
    const started = new Map<number, ReturnType<typeof deferred<string>>>();
    const results = [1, 2, 3, 4, 5, 6].map((n) =>
      limit(() => {
        const call = deferred<string>();
        started.set(n, call);
        return call.promise;
      }),
    );

    expect([...started.keys()]).toEqual([1, 2, 3, 4]);

    started.get(2)?.resolve("two");
    await settle();
    expect([...started.keys()]).toEqual([1, 2, 3, 4, 5]);

    for (const [n, call] of started) {
      call.resolve(`#${n}`);
    }
    await settle();
    started.get(6)?.resolve("#6");

    await expect(Promise.all(results)).resolves.toEqual([
      "#1",
      "two",
      "#3",
      "#4",
      "#5",
      "#6",
    ]);
  });

  it("starts a task given ahead before those waiting", async () => {
    const limit = concurrencyLimit(1);
    const order: string[] = [];
    const run = (name: string, ahead = false) =>
      limit(
        async () => {
          order.push(name);
          await settle();
        },
        { ahead },
      );

    await Promise.all([run("first"), run("waiting"), run("ahead", true)]);

    expect(order).toEqual(["first", "ahead", "waiting"]);
  });

  it("rejects as the task does, and goes on with the next", async () => {
    const limit = concurrencyLimit(1);
    const failing = limit(async () => {
      throw new Error("boom");
    });
    const next = limit(async () => "next");

    await expect(failing).rejects.toThrow("boom");
    await expect(next).resolves.toBe("next");
  });
});
