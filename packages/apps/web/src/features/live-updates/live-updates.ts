import type {
  CancelTimer,
  PageVisibility,
  Timer,
  Unsubscribe,
} from "@yagura/browser";
import type {
  SignalConnection,
  SignalConnector,
  SignalToken,
} from "@yagura/activity-api";

/**
 * How long signals are gathered into one update: a push often arrives as
 * several events, each with its signal, over a second or two.
 */
export const burstMs = 2_000;

/** The first wait before connecting again, doubled on each failure. */
export const firstRetryMs = 1_000;

/** The longest wait before connecting again. */
export const longestRetryMs = 60_000;

/** What live updates need of the browser, and where the signals come from. */
export interface LiveUpdatesOptions {
  readonly connector: SignalConnector;
  /** Times the waits before connecting again, and gathers bursts. */
  readonly timer: Timer;
  readonly visibility: PageVisibility;
  /** A number in [0, 1) that spreads the waits. Defaults to `Math.random`. */
  readonly random?: () => number;
}

/**
 * Keeps one connection to the viewer's channel of signals open, and says
 * when the view should fetch again (see docs/design/activity-view.md,
 * "Live updates"): when a signal arrives, a burst of them gathered into
 * one; when the connection is back after it dropped; and when the page is
 * shown again after it was hidden, connecting again at once if the
 * connection is gone.
 *
 * Each connection gets a fresh token from `requestToken`. A failed token
 * request or connection is tried again after a wait that grows with each
 * failure, and is only warned about in the console: without the
 * connection, the page works as one that is not live.
 */
export class LiveUpdates {
  readonly #options: LiveUpdatesOptions;
  readonly #requestToken: () => Promise<SignalToken>;
  readonly #onUpdate: () => void;
  #running = false;
  /** Counts starts and stops, so that a stale token request is dropped. */
  #generation = 0;
  #connection: SignalConnection | undefined;
  #connecting = false;
  /** Whether a connection was tried since the start. */
  #tried = false;
  /** The failures since the last subscription, which set the next wait. */
  #failures = 0;
  #cancelRetry: CancelTimer | undefined;
  #cancelBurst: CancelTimer | undefined;
  #stopVisibility: Unsubscribe | undefined;

  constructor(
    options: LiveUpdatesOptions,
    requestToken: () => Promise<SignalToken>,
    onUpdate: () => void,
  ) {
    this.#options = options;
    this.#requestToken = requestToken;
    this.#onUpdate = onUpdate;
  }

  /** Connects, and keeps connected until {@link stop}. */
  start(): void {
    if (this.#running) {
      return;
    }
    this.#running = true;
    this.#generation += 1;
    this.#tried = false;
    this.#failures = 0;
    this.#stopVisibility = this.#options.visibility.onChange(() => {
      if (this.#options.visibility.visible) {
        this.#shown();
      }
    });
    void this.#connect();
  }

  /** Closes the connection, and stops connecting and updating. */
  stop(): void {
    if (!this.#running) {
      return;
    }
    this.#running = false;
    this.#generation += 1;
    this.#stopVisibility?.();
    this.#stopVisibility = undefined;
    this.#cancelRetry?.();
    this.#cancelRetry = undefined;
    this.#cancelBurst?.();
    this.#cancelBurst = undefined;
    this.#connection?.close();
    this.#connection = undefined;
    this.#connecting = false;
  }

  /** The page is shown again: update, and connect at once if need be. */
  #shown(): void {
    this.#update();
    if (this.#cancelRetry !== undefined) {
      this.#cancelRetry();
      this.#cancelRetry = undefined;
      void this.#connect();
    }
  }

  async #connect(): Promise<void> {
    if (!this.#running || this.#connection || this.#connecting) {
      return;
    }
    const generation = this.#generation;
    // Signals sent while no connection was subscribed are lost: once
    // subscribed again, the view fetches what it missed.
    const missed = this.#tried;
    this.#tried = true;
    this.#connecting = true;
    let token: SignalToken;
    try {
      token = await this.#requestToken();
    } catch (error) {
      if (generation === this.#generation) {
        this.#connecting = false;
        console.warn("Could not get a token for live updates:", error);
        this.#retry();
      }
      return;
    }
    if (generation !== this.#generation) {
      return;
    }
    this.#connecting = false;
    const connection = this.#options.connector.connect(token, {
      onSubscribed: () => {
        this.#failures = 0;
        if (missed) {
          this.#update();
        }
      },
      onSignal: () => this.#update(),
      onClosed: (reason) => {
        if (this.#connection !== connection) {
          return;
        }
        this.#connection = undefined;
        console.warn("The connection for live updates closed:", reason);
        this.#retry();
      },
    });
    this.#connection = connection;
  }

  /** Connects again after a wait that grows with each failure. */
  #retry(): void {
    if (!this.#running) {
      return;
    }
    const ceiling = Math.min(
      longestRetryMs,
      firstRetryMs * 2 ** this.#failures,
    );
    this.#failures += 1;
    // Half the ceiling, and up to as much again at random, so that tabs
    // that lost their connections together do not come back together.
    const random = this.#options.random ?? Math.random;
    const delay = ceiling / 2 + (ceiling / 2) * random();
    this.#cancelRetry = this.#options.timer.schedule(() => {
      this.#cancelRetry = undefined;
      void this.#connect();
    }, delay);
  }

  /** Tells the view to fetch again, once for a burst of reasons. */
  #update(): void {
    if (!this.#running || this.#cancelBurst !== undefined) {
      return;
    }
    this.#cancelBurst = this.#options.timer.schedule(() => {
      this.#cancelBurst = undefined;
      this.#onUpdate();
    }, burstMs);
  }
}
