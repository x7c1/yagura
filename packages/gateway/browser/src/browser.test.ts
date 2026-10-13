import { describe, expect, it } from "vitest";
import {
  DomElementAttribute,
  ManualTimer,
  MemoryElementAttribute,
  MemoryElementWidths,
  MemoryLocation,
  MemoryStore,
  ResizeObserverWidths,
  WebStorageStore,
} from ".";

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

  it("pushes history entries and moves back and forward through them", () => {
    const location = new MemoryLocation("http://localhost:5173/");
    const popped: string[] = [];
    const unsubscribe = location.onPopState(() =>
      popped.push(location.pathname),
    );

    location.push("/members");
    expect(location.href).toBe("http://localhost:5173/members");
    expect(popped).toEqual([]);

    location.back();
    expect(location.pathname).toBe("/");
    location.forward();
    expect(location.pathname).toBe("/members");
    expect(popped).toEqual(["/", "/members"]);

    unsubscribe();
    location.back();
    expect(popped).toEqual(["/", "/members"]);
    expect(() => location.back()).toThrow();
    expect(() => location.push("https://github.com/")).toThrow();
  });

  it("drops the entries after the current one on a push, and keeps them on a replace", () => {
    const location = new MemoryLocation("http://localhost:5173/");
    location.push("/a");
    location.push("/b");
    location.back();
    location.replace("/c");
    expect(location.entries).toEqual([
      "http://localhost:5173/",
      "http://localhost:5173/c",
      "http://localhost:5173/b",
    ]);
    location.push("/d");
    expect(location.entries).toEqual([
      "http://localhost:5173/",
      "http://localhost:5173/c",
      "http://localhost:5173/d",
    ]);
    expect(() => location.forward()).toThrow();
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

describe("ResizeObserverWidths", () => {
  it("reports the width now, then each change, until unsubscribed", () => {
    let callback: ResizeObserverCallback | undefined;
    let disconnected = false;
    const observer = {
      observe: () => {},
      disconnect: () => (disconnected = true),
    } as unknown as ResizeObserver;
    const widths = new ResizeObserverWidths((created) => {
      callback = created;
      return observer;
    });
    const element = {
      getBoundingClientRect: () => ({ width: 640 }),
    } as unknown as Element;
    const resize = (inlineSize: number) =>
      callback?.(
        [{ borderBoxSize: [{ inlineSize }] } as unknown as ResizeObserverEntry],
        observer,
      );
    const seen: number[] = [];

    const unsubscribe = widths.observe(element, (width) => seen.push(width));
    resize(640);
    resize(375);

    expect(seen).toEqual([640, 375]);
    unsubscribe();
    expect(disconnected).toBe(true);
  });
});

describe("MemoryElementWidths", () => {
  it("reports its width now and on each change, until unsubscribed", () => {
    const widths = new MemoryElementWidths(640);
    const element = {} as Element;
    const seen: number[] = [];

    const unsubscribe = widths.observe(element, (width) => seen.push(width));
    widths.width = 375;
    unsubscribe();
    widths.width = 1280;

    expect(seen).toEqual([640, 375]);
    expect(widths.observing).toBe(0);
  });
});

describe("DomElementAttribute", () => {
  it("sets and removes the attribute on the element", () => {
    const attributes = new Map<string, string>();
    // Enough of an element for the attribute's calls, as the tests run
    // without a document.
    const element = {
      setAttribute: (name: string, value: string) => {
        attributes.set(name, value);
      },
      removeAttribute: (name: string) => {
        attributes.delete(name);
      },
    } as unknown as Element;
    const attribute = new DomElementAttribute(element, "data-theme");

    attribute.set("dark");
    expect(attributes.get("data-theme")).toBe("dark");
    attribute.set(undefined);
    expect(attributes.has("data-theme")).toBe(false);
  });
});

describe("MemoryElementAttribute", () => {
  it("starts absent and keeps what is set", () => {
    const attribute = new MemoryElementAttribute();
    expect(attribute.get()).toBeUndefined();
    attribute.set("light");
    expect(attribute.get()).toBe("light");
    attribute.set(undefined);
    expect(attribute.get()).toBeUndefined();
  });
});
