import type {
  CancelTimer,
  NetworkEvents,
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

/**
 * How long connecting may take before the page shows that it is
 * connecting: a connection normally subscribes within about a second, so
 * that a page loaded on a working network never shows it.
 */
export const connectingGraceMs = 3_000;

/**
 * How long the page must have been hidden for its connection to be
 * replaced when it is shown again: a phone may have cut a hidden tab's
 * network without the socket ever reporting that it closed.
 */
export const longAbsenceMs = 60_000;

/**
 * Whether the page is live, as its header shows it: subscribed to the
 * viewer's channel, connecting (from asking for a token until subscribed),
 * or waiting to connect again after a failure or a dropped connection.
 * Before any of these is shown, it is starting: a placeholder for a
 * status not known yet, so that the dot is drawn from the start.
 */
export type LiveStatus = "starting" | "live" | "connecting" | "not-live";

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
  /** Tells when the browser is back online, to connect again at once. */
  readonly network: NetworkEvents;
  /**
   * The current time in milliseconds, which measures how long the page was
   * hidden. Defaults to `Date.now`.
   */
  readonly now?: () => number;
  /** A number in [0, 1) that spreads the waits. Defaults to `Math.random`. */
  readonly random?: () => number;
}

/**
 * Keeps one connection to the viewer's channel of signals open, and says
 * when the view should fetch again, and for which organizations (see
 * docs/design/activity-view.md, "Live updates"): when a signal arrives, a
 * burst of them gathered into one; when the connection is back after it
 * dropped; and when the page is shown again after it was hidden,
 * connecting again at once if the connection is gone, or replacing it
 * after a long absence. It also connects again at once when the browser
 * comes back online while waiting to retry, and tells `onStatus` whether
 * the page is live, showing "starting" in place of "connecting" for a
 * moment at first.
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
  readonly #onStatus: (status: LiveStatus | undefined) => void;
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
  #stopOnline: Unsubscribe | undefined;
  /** When the page was last hidden, while it still is. */
  #hiddenAt: number | undefined;
  /** Where the connection is, whether or not it is shown yet. */
  #status: Exclude<LiveStatus, "starting"> = "connecting";
  /** Whether a status other than "starting" was shown since the start. */
  #statusShown = false;
  #cancelGrace: CancelTimer | undefined;

  /**
   * `onStatus` is told each status to show: "starting" at the start, until
   * another status is shown, and `undefined` for none once stopped.
   */
  constructor(
    options: LiveUpdatesOptions,
    requestToken: () => Promise<SignalToken>,
    onUpdate: (update: LiveUpdate) => void,
    onStatus: (status: LiveStatus | undefined) => void = () => {},
  ) {
    this.#options = options;
    this.#requestToken = requestToken;
    this.#onUpdate = onUpdate;
    this.#onStatus = onStatus;
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
    this.#hiddenAt = this.#options.visibility.visible ? undefined : this.#now();
    this.#statusShown = false;
    this.#stopVisibility = this.#options.visibility.onChange(() =>
      this.#visibilityChanged(),
    );
    this.#stopOnline = this.#options.network.on("online", () =>
      this.#connectNowIfWaiting(),
    );
    this.#onStatus("starting");
    this.#cancelGrace = this.#options.timer.schedule(() => {
      this.#cancelGrace = undefined;
      this.#show();
    }, connectingGraceMs);
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
    this.#stopOnline?.();
    this.#stopOnline = undefined;
    this.#cancelGrace?.();
    this.#cancelGrace = undefined;
    this.#cancelRetry?.();
    this.#cancelRetry = undefined;
    this.#cancelBurst?.();
    this.#cancelBurst = undefined;
    this.#anyOrganization = false;
    this.#imported = new Set();
    this.#connection?.close();
    this.#connection = undefined;
    this.#connecting = false;
    this.#status = "connecting";
    this.#onStatus(undefined);
  }

  #now(): number {
    return (this.#options.now ?? Date.now)();
  }

  #visibilityChanged(): void {
    const now = this.#now();
    if (!this.#options.visibility.visible) {
      this.#hiddenAt ??= now;
      return;
    }
    const hiddenAt = this.#hiddenAt;
    this.#hiddenAt = undefined;
    this.#shown(hiddenAt !== undefined && now - hiddenAt >= longAbsenceMs);
  }

  /**
   * The page is shown again: update, and connect at once if need be. After
   * a long absence, the connection is replaced, as it may be gone without
   * having said so.
   */
  #shown(longAbsence: boolean): void {
    this.#update();
    if (longAbsence && this.#connection !== undefined) {
      const connection = this.#connection;
      this.#connection = undefined;
      connection.close();
      void this.#connect();
      return;
    }
    this.#connectNowIfWaiting();
  }

  /** Connects at once, if waiting to connect again. */
  #connectNowIfWaiting(): void {
    if (this.#cancelRetry !== undefined) {
      this.#cancelRetry();
      this.#cancelRetry = undefined;
      void this.#connect();
    }
  }

  /**
   * Sets the status, and shows it unless it is "connecting" while
   * "starting" is still shown, held back until the grace period ends.
   */
  #setStatus(status: Exclude<LiveStatus, "starting">): void {
    this.#status = status;
    if (status !== "connecting" || this.#statusShown) {
      this.#show();
    }
  }

  /** Shows the status, from now on, as it changes. */
  #show(): void {
    this.#cancelGrace?.();
    this.#cancelGrace = undefined;
    this.#statusShown = true;
    this.#onStatus(this.#status);
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
    this.#setStatus("connecting");
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
        this.#setStatus("live");
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
    this.#setStatus("not-live");
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
