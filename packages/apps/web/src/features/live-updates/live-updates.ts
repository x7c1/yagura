import type {
  CancelTimer,
  PageVisibility,
  Timer,
  Unsubscribe,
} from "@yagura/browser";
import {
  isImportedSignal,
  type Signal,
  type SignalConnection,
  type SignalConnector,
  type SignalToken,
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

/** Why the view should fetch again, gathered over a burst. */
export interface LiveUpdate {
  /**
   * Whether the activity of any organization may have changed: on a
   * signal of activity, or one that could not be read, and whenever
   * signals may have been missed.
   */
  readonly anyOrganization: boolean;
  /** The ids of the organizations whose import has finished. */
  readonly imported: ReadonlySet<string>;
}

/** Whether the view of the organization `organizationId` should fetch on `update`. */
export function concerns(update: LiveUpdate, organizationId: string): boolean {
  return update.anyOrganization || update.imported.has(organizationId);
}

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
 * when the view should fetch again, and for which organizations (see
 * docs/design/activity-view.md, "Live updates"): when a signal arrives, a
 * burst of them gathered into one; when the connection is back after it
 * dropped; and when the page is shown again after it was hidden,
 * connecting again at once if the connection is gone.
 *
 * Each connection gets a fresh token from `requestToken`. A failed token
 * request or connection is tried again after a wait that grows with each
 * failure, and is only warned about in the console: without the
 * connection, the page works as one that is not live.
 */
export class LiveUpdates {
  readonly #options: LiveUpdatesOptions;
  readonly #requestToken: () => Promise<SignalToken>;
  readonly #onUpdate: (update: LiveUpdate) => void;
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
  /** What the burst being gathered is for. */
  #anyOrganization = false;
  #imported = new Set<string>();
  #stopVisibility: Unsubscribe | undefined;

  constructor(
    options: LiveUpdatesOptions,
    requestToken: () => Promise<SignalToken>,
    onUpdate: (update: LiveUpdate) => void,
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
    this.#anyOrganization = false;
    this.#imported = new Set();
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
      onSignal: (signal) => this.#signaled(signal),
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

  /**
   * A signal arrived: the import of one organization, or activity, or one
   * that could not be read, which may be about any organization.
   */
  #signaled(signal: Signal | undefined): void {
    if (signal !== undefined && isImportedSignal(signal)) {
      this.#update(signal.organizationId);
    } else {
      this.#update();
    }
  }

  /**
   * Tells the view to fetch again, once for a burst of reasons: for the
   * organization `imported` only, or for any.
   */
  #update(imported?: string): void {
    if (!this.#running) {
      return;
    }
    if (imported === undefined) {
      this.#anyOrganization = true;
    } else {
      this.#imported.add(imported);
    }
    if (this.#cancelBurst !== undefined) {
      return;
    }
    this.#cancelBurst = this.#options.timer.schedule(() => {
      const update: LiveUpdate = {
        anyOrganization: this.#anyOrganization,
        imported: this.#imported,
      };
      this.#cancelBurst = undefined;
      this.#anyOrganization = false;
      this.#imported = new Set();
      this.#onUpdate(update);
    }, burstMs);
  }
}
