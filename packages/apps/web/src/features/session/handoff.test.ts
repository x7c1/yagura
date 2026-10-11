import { MemoryStore } from "@yagura/browser";
import { describe, expect, it } from "vitest";
import {
  clearHandoff,
  HandoffStorageError,
  loadHandoff,
  saveHandoff,
} from "./handoff";

describe("sign-in handoff", () => {
  it("round-trips through the store and clears", () => {
    const store = new MemoryStore();
    saveHandoff(store, { state: "s", codeVerifier: "v" });
    expect(loadHandoff(store)).toEqual({ state: "s", codeVerifier: "v" });

    clearHandoff(store);
    expect(loadHandoff(store)).toBeUndefined();
    expect(store.size).toBe(0);
  });

  it("treats a corrupt entry as missing", () => {
    const store = new MemoryStore();
    store.set("yagura.sign-in-handoff", "{");
    expect(loadHandoff(store)).toBeUndefined();
  });

  it("reports a failing store as a storage error", () => {
    const store = new MemoryStore();
    store.get = () => {
      throw new Error("storage is blocked");
    };
    expect(() => loadHandoff(store)).toThrow(HandoffStorageError);
    expect(() => loadHandoff(store)).toThrow("storage is blocked");
  });
});
