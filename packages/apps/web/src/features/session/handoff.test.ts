import { afterEach, describe, expect, it } from "vitest";
import { clearHandoff, loadHandoff, saveHandoff } from "./handoff";

afterEach(() => {
  sessionStorage.clear();
});

describe("sign-in handoff", () => {
  it("round-trips through sessionStorage and clears", () => {
    saveHandoff({ state: "s", codeVerifier: "v" });
    expect(loadHandoff()).toEqual({ state: "s", codeVerifier: "v" });

    clearHandoff();
    expect(loadHandoff()).toBeUndefined();
    expect(sessionStorage.length).toBe(0);
  });

  it("treats a corrupt entry as missing", () => {
    sessionStorage.setItem("yagura.sign-in-handoff", "{");
    expect(loadHandoff()).toBeUndefined();
  });
});
