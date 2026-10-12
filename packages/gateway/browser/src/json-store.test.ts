import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { IndexedDbStore, MemoryJsonStore, type JsonStore } from ".";

function describeStore(name: string, create: () => JsonStore) {
  describe(name, () => {
    it("sets, gets, and deletes values", async () => {
      const store = create();
      await expect(store.get("k")).resolves.toBeUndefined();

      await store.set("k", { day: "2026-10-12", ids: ["PR_1"], n: 1 });
      await expect(store.get("k")).resolves.toEqual({
        day: "2026-10-12",
        ids: ["PR_1"],
        n: 1,
      });

      await store.delete("k");
      await expect(store.get("k")).resolves.toBeUndefined();
    });

    it("deletes by key prefix, leaving the other keys", async () => {
      const store = create();
      for (const key of ["alice/a", "alice/b", "alice", "alicia/a", "bob/a"]) {
        await store.set(key, key);
      }

      await store.deleteByPrefix("alice/");

      for (const key of ["alice/a", "alice/b"]) {
        await expect(store.get(key)).resolves.toBeUndefined();
      }
      for (const key of ["alice", "alicia/a", "bob/a"]) {
        await expect(store.get(key)).resolves.toBe(key);
      }
    });
  });
}

describeStore("IndexedDbStore", () => {
  const factory = new IDBFactory();
  return new IndexedDbStore(() => factory);
});

describeStore("MemoryJsonStore", () => new MemoryJsonStore());

describe("IndexedDbStore", () => {
  it("keeps values in the database across store instances", async () => {
    const factory = new IDBFactory();
    await new IndexedDbStore(() => factory).set("k", [1, 2]);

    await expect(new IndexedDbStore(() => factory).get("k")).resolves.toEqual([
      1, 2,
    ]);
  });

  it("surfaces a failure to reach IndexedDB from the operation, and tries again", async () => {
    let blocked = true;
    const factory = new IDBFactory();
    const store = new IndexedDbStore(() => {
      if (blocked) {
        throw new Error("storage is blocked");
      }
      return factory;
    });

    await expect(store.get("k")).rejects.toThrow("storage is blocked");
    blocked = false;
    await expect(store.get("k")).resolves.toBeUndefined();
  });
});
