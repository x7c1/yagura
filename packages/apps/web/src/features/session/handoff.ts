import type { KeyValueStore } from "@yagura/browser";

// The `state` and PKCE verifier must survive the round trip through GitHub.
// In the browser the store is the session-scoped Web Storage area, the only
// browser storage the app uses, and only for these two short-lived values;
// tokens never go here.

const storageKey = "yagura.sign-in-handoff";

export interface SignInHandoff {
  readonly state: string;
  readonly codeVerifier: string;
}

/** The store failed; the sign-in cannot carry its state across the redirect. */
export class HandoffStorageError extends Error {
  constructor(action: string, cause: unknown) {
    super(
      `Could not ${action} the sign-in state in browser storage: ` +
        (cause instanceof Error ? cause.message : String(cause)),
      { cause },
    );
    this.name = "HandoffStorageError";
  }
}

export function saveHandoff(
  store: KeyValueStore,
  handoff: SignInHandoff,
): void {
  try {
    store.set(storageKey, JSON.stringify(handoff));
  } catch (error) {
    throw new HandoffStorageError("save", error);
  }
}

export function loadHandoff(store: KeyValueStore): SignInHandoff | undefined {
  let raw: string | undefined;
  try {
    raw = store.get(storageKey);
  } catch (error) {
    throw new HandoffStorageError("read", error);
  }
  if (raw === undefined) {
    return undefined;
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value === "object" && value !== null) {
      const { state, codeVerifier } = value as Record<string, unknown>;
      if (typeof state === "string" && typeof codeVerifier === "string") {
        return { state, codeVerifier };
      }
    }
  } catch {
    // A corrupt entry is treated as missing.
  }
  return undefined;
}

export function clearHandoff(store: KeyValueStore): void {
  try {
    store.remove(storageKey);
  } catch (error) {
    throw new HandoffStorageError("clear", error);
  }
}
