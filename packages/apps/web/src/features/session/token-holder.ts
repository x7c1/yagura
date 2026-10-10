import type { SessionTokens } from "@yagura/session-api";

/** Refresh this long before the access token actually expires. */
const refreshMarginMs = 60_000;

/**
 * Holds the access token in memory only and schedules a refresh before it
 * expires.
 */
export class TokenHolder {
  #accessToken: string | undefined;
  #timer: ReturnType<typeof setTimeout> | undefined;
  readonly #onExpiring: () => void;

  /** `onExpiring` is called shortly before the held token expires. */
  constructor(onExpiring: () => void) {
    this.#onExpiring = onExpiring;
  }

  get accessToken(): string | undefined {
    return this.#accessToken;
  }

  set(tokens: SessionTokens): void {
    this.clear();
    this.#accessToken = tokens.accessToken;
    const delay = Math.max(0, tokens.expiresIn * 1000 - refreshMarginMs);
    this.#timer = setTimeout(() => {
      this.#timer = undefined;
      this.#onExpiring();
    }, delay);
  }

  clear(): void {
    this.#accessToken = undefined;
    if (this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
  }
}
