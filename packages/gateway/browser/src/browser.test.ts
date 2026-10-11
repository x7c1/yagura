import { describe, expect, it } from "vitest";
import { ManualTimer, MemoryLocation, MemoryStore, WebStorageStore } from ".";

describe("MemoryStore", () => {
  it("sets, gets, and removes entries", () => {
    const store = new MemoryStore();
    expect(store.get("k")).toBeUndefined();
    store.set("k", "v");
    expect(store.get("k")).toBe("v");
    store.remove("k");
    expect(store.get("k")).toBeUndefined();
    expect(store.size).toBe(0);
  });
});

describe("WebStorageStore", () => {
  it("surfaces a failure to reach the storage from the operation", () => {
    const store = new WebStorageStore(() => {
      throw new Error("storage is blocked");
    });
    expect(() => store.get("k")).toThrow("storage is blocked");
  });
});

describe("MemoryLocation", () => {
  it("exposes the parts of its URL", () => {
    const location = new MemoryLocation(
      "http://localhost:5173/callback?code=c&state=s",
    );
    expect(location.origin).toBe("http://localhost:5173");
    expect(location.pathname).toBe("/callback");
    expect(location.search).toBe("?code=c&state=s");
  });

  it("records assigned URLs and replaces within the origin", () => {
    const location = new MemoryLocation("http://localhost:5173/callback?x=1");
    location.replace("/");
    expect(location.href).toBe("http://localhost:5173/");
    expect(location.assigned).toEqual([]);

    location.assign(new URL("https://github.com/login"));
    expect(location.href).toBe("https://github.com/login");
    expect(location.assigned.map(String)).toEqual(["https://github.com/login"]);
    expect(() => location.replace("http://localhost:5173/")).toThrow();
  });
});

describe("ManualTimer", () => {
  it("runs callbacks only when advanced past their delay, in due order", () => {
    const timer = new ManualTimer();
    const fired: string[] = [];
    timer.schedule(() => fired.push("b"), 200);
    timer.schedule(() => fired.push("a"), 100);

    timer.advance(99);
    expect(fired).toEqual([]);
    timer.advance(101);
    expect(fired).toEqual(["a", "b"]);
    expect(timer.pending).toBe(0);
  });

  it("does not run a cancelled callback", () => {
    const timer = new ManualTimer();
    let fired = false;
    const cancel = timer.schedule(() => (fired = true), 10);
    cancel();
    timer.advance(10);
    expect(fired).toBe(false);
  });

  it("runs callbacks scheduled by a callback when they fall due", () => {
    const timer = new ManualTimer();
    const fired: number[] = [];
    timer.schedule(() => {
      fired.push(timer.now);
      timer.schedule(() => fired.push(timer.now), 10);
    }, 10);

    timer.advance(30);
    expect(fired).toEqual([10, 20]);
    expect(timer.now).toBe(30);
  });
});
