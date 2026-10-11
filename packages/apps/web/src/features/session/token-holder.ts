import type { CancelTimer, Timer } from "@yagura/browser";
import type { SessionTokens } from "@yagura/session-api";

/** Refresh this long before the access token actually expires. */
const refreshMarginMs = 60_000;

/**
 * Holds the access token in memory only and schedules a refresh before it
 * expires.
 */
export class TokenHolder {
  #accessToken: string | undefined;
  #cancelRefresh: CancelTimer | undefined;
  readonly #timer: Timer;
  readonly #onExpiring: () => void;

  /** `onExpiring` is called through `timer` shortly before the token expires. */
  constructor(timer: Timer, onExpiring: () => void) {
    this.#timer = timer;
    this.#onExpiring = onExpiring;
  }

  get accessToken(): string | undefined {
    return this.#accessToken;
  }

  set(tokens: SessionTokens): void {
    this.clear();
    this.#accessToken = tokens.accessToken;
    const delay = Math.max(0, tokens.expiresIn * 1000 - refreshMarginMs);
    this.#cancelRefresh = this.#timer.schedule(() => {
      this.#cancelRefresh = undefined;
      this.#onExpiring();
    }, delay);
  }

  clear(): void {
    this.#accessToken = undefined;
    this.#cancelRefresh?.();
    this.#cancelRefresh = undefined;
  }
}
