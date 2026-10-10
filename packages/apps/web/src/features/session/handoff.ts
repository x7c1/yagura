// The `state` and PKCE verifier must survive the round trip through GitHub.
// sessionStorage is the only browser storage the app uses, and only for these
// two short-lived values; tokens never go here.

const storageKey = "yagura.sign-in-handoff";

export interface SignInHandoff {
  readonly state: string;
  readonly codeVerifier: string;
}

export function saveHandoff(handoff: SignInHandoff): void {
  sessionStorage.setItem(storageKey, JSON.stringify(handoff));
}

export function loadHandoff(): SignInHandoff | undefined {
  const raw = sessionStorage.getItem(storageKey);
  if (raw === null) {
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

export function clearHandoff(): void {
  sessionStorage.removeItem(storageKey);
}
