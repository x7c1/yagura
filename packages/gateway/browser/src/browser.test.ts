import { describe, expect, it, vi } from "vitest";
import {
  BroadcastTabChannel,
  DocumentVisibility,
  DomElementAttribute,
  ManualTimer,
  MemoryElementAttribute,
  MemoryElementWidths,
  MemoryLocation,
  MemoryStorageChanges,
  MemoryStore,
  MemoryTabChannel,
  MemoryVisibility,
  ResizeObserverWidths,
  WebStorageStore,
  WindowStorageChanges,
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

describe("MemoryTabChannel", () => {
  it("delivers a message to every other tab of the browser, not to its own", () => {
    const first = new MemoryTabChannel();
    const second = first.openTab();
    const third = second.openTab();
    const elsewhere = new MemoryTabChannel();
    const received: string[] = [];
    first.onMessage((message) => received.push(`first ${message}`));
    const unsubscribe = second.onMessage((message) =>
      received.push(`second ${message}`),
    );
    third.onMessage((message) => received.push(`third ${message}`));
    elsewhere.onMessage((message) => received.push(`elsewhere ${message}`));

    first.post("a");
    unsubscribe();
    third.post("b");

    expect(received).toEqual(["second a", "third a", "first b"]);
    expect(first.posted).toEqual(["a"]);
    expect(third.posted).toEqual(["b"]);
  });
});

describe("BroadcastTabChannel", () => {
  it("delivers a string message to the other channels of the same name", async () => {
    const opened: BroadcastChannel[] = [];
    const open = () => {
      const channel = new BroadcastChannel("yagura.test");
      opened.push(channel);
      return channel;
    };
    const first = new BroadcastTabChannel(open);
    const second = new BroadcastTabChannel(open);
    const own: string[] = [];
    const received: string[] = [];
    first.onMessage((message) => own.push(message));
    second.onMessage((message) => received.push(message));

    first.post("signed-out");

    await vi.waitFor(() => {
      expect(received).toEqual(["signed-out"]);
    });
    expect(own).toEqual([]);
    for (const channel of opened) {
      channel.close();
    }
  });

  it("does nothing when the browser cannot open a channel", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const channel = new BroadcastTabChannel(() => {
      throw new ReferenceError("BroadcastChannel is not defined");
    });

    channel.post("signed-out");
    channel.onMessage(() => {})();

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("WindowStorageChanges", () => {
  /** A `storage` event as the browser fires it, for `key` in `area`. */
  const storageEvent = (key: string | null, area: object) =>
    Object.assign(new Event("storage"), { key, storageArea: area });

  it("reports the key of each change to its own area, until unsubscribed", () => {
    const window = new EventTarget();
    const local = {} as Storage;
    const session = {} as Storage;
    const changes = new WindowStorageChanges(
      window as unknown as Window,
      () => local,
    );
    const keys: (string | null)[] = [];
    const unsubscribe = changes.onChange((key) => keys.push(key));

    window.dispatchEvent(storageEvent("yagura.theme", local));
    window.dispatchEvent(storageEvent("other", session));
    window.dispatchEvent(storageEvent(null, local));
    expect(keys).toEqual(["yagura.theme", null]);

    unsubscribe();
    window.dispatchEvent(storageEvent("yagura.theme", local));
    expect(keys).toEqual(["yagura.theme", null]);
  });

  it("ignores a change while its area cannot be reached", () => {
    const window = new EventTarget();
    const changes = new WindowStorageChanges(
      window as unknown as Window,
      () => {
        throw new Error("storage is blocked");
      },
    );
    const keys: (string | null)[] = [];
    changes.onChange((key) => keys.push(key));

    window.dispatchEvent(storageEvent("yagura.theme", {}));
    expect(keys).toEqual([]);
  });
});

describe("MemoryStorageChanges", () => {
  it("reports each change to its listeners, until unsubscribed", () => {
    const changes = new MemoryStorageChanges();
    const keys: (string | null)[] = [];
    const unsubscribe = changes.onChange((key) => keys.push(key));
    expect(changes.listeners).toBe(1);

    changes.change("yagura.theme");
    changes.change(null);
    unsubscribe();
    changes.change("yagura.theme");

    expect(keys).toEqual(["yagura.theme", null]);
    expect(changes.listeners).toBe(0);
  });
});

describe("DocumentVisibility", () => {
  it("reads the document's visibility, and reports each change until unsubscribed", () => {
    const document = Object.assign(new EventTarget(), {
      visibilityState: "visible",
    });
    const visibility = new DocumentVisibility(document as unknown as Document);
    const seen: boolean[] = [];
    const unsubscribe = visibility.onChange(() =>
      seen.push(visibility.visible),
    );

    document.visibilityState = "hidden";
    document.dispatchEvent(new Event("visibilitychange"));
    document.visibilityState = "visible";
    document.dispatchEvent(new Event("visibilitychange"));
    expect(seen).toEqual([false, true]);

    unsubscribe();
    document.dispatchEvent(new Event("visibilitychange"));
    expect(seen).toEqual([false, true]);
  });
});

describe("MemoryVisibility", () => {
  it("starts visible, and reports each change until unsubscribed", () => {
    const visibility = new MemoryVisibility();
    const seen: boolean[] = [];
    const unsubscribe = visibility.onChange(() =>
      seen.push(visibility.visible),
    );

    expect(visibility.visible).toBe(true);
    visibility.set(true);
    visibility.set(false);
    visibility.set(true);
    expect(seen).toEqual([false, true]);

    unsubscribe();
    expect(visibility.listeners).toBe(0);
  });
});
