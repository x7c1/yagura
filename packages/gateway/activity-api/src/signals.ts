import type { CancelTimer, Timer } from "@yagura/browser";

// The viewer's channel of signals over AWS AppSync Events' WebSocket
// protocol (see docs/design/activity-api.md, "Signals"). The app needs only
// a small part of it: connect, subscribe to one channel, and be told of
// what is published to it, so it speaks the protocol itself rather than
// through an AppSync client library.

/** What the server publishes to the viewer's channel: ids only. */
export type Signal = ActivitySignal | ImportedSignal;

/**
 * What the server publishes when it records activity in a repository the
 * viewer can see.
 */
export interface ActivitySignal {
  readonly repositoryId: string;
  readonly pullRequestId: string;
  /** The kind of activity, such as `pushed`. */
  readonly kind: string;
}

/**
 * What the server publishes when it has finished importing an
 * organization the viewer can use.
 */
export interface ImportedSignal {
  readonly kind: "imported";
  /** The organization's id, as `GET /activity/organizations` lists it. */
  readonly organizationId: string;
}

/** Whether `signal` says that an organization's import has finished. */
export function isImportedSignal(signal: Signal): signal is ImportedSignal {
  return signal.kind === "imported" && "organizationId" in signal;
}

/** What a connection needs: the signal token and its channel. */
export interface SignalSubscriptionToken {
  readonly token: string;
  readonly channel: string;
}

/** What a connection tells of. */
export interface SignalHandlers {
  /** The subscription is in place: what is published from now on arrives. */
  readonly onSubscribed: () => void;
  /**
   * Something was published to the channel: the signal, or `undefined`
   * when it could not be read, or the service reports that it failed to
   * deliver one.
   */
  readonly onSignal: (signal: Signal | undefined) => void;
  /**
   * The connection is gone, for whatever reason, and delivers nothing
   * more. Called at most once, and never after {@link SignalConnection.close}.
   */
  readonly onClosed: (reason: unknown) => void;
}

/** An open connection, subscribed or on its way to be. */
export interface SignalConnection {
  /** Closes the connection; its handlers are called no more. */
  close(): void;
}

/** Connects to the viewer's channel of signals. */
export interface SignalConnector {
  connect(
    token: SignalSubscriptionToken,
    handlers: SignalHandlers,
  ): SignalConnection;
}

/** What a WebSocket tells the connector. */
export interface SocketListeners {
  readonly onOpen: () => void;
  /** A text message. */
  readonly onMessage: (data: string) => void;
  /** The socket closed, cleanly or not; an error is always followed by it. */
  readonly onClose: () => void;
}

/** The part of a WebSocket the connector uses. */
export interface SignalSocket {
  send(data: string): void;
  close(): void;
}

/** Opens a WebSocket to `url`, offering `protocols`. */
export type OpenSocket = (
  url: string,
  protocols: readonly string[],
  listeners: SocketListeners,
) => SignalSocket;

/** Opens a browser WebSocket. */
const openWebSocket: OpenSocket = (url, protocols, listeners) => {
  const socket = new WebSocket(url, [...protocols]);
  socket.addEventListener("open", () => listeners.onOpen());
  socket.addEventListener("message", (event: MessageEvent) => {
    if (typeof event.data === "string") {
      listeners.onMessage(event.data);
    }
  });
  socket.addEventListener("close", () => listeners.onClose());
  return {
    send: (data) => socket.send(data),
    close: () => socket.close(),
  };
};

/** The subprotocol every AppSync Events WebSocket connection offers. */
const appSyncEventsProtocol = "aws-appsync-event-ws";

/**
 * How long the connection waits for a keep-alive when `connection_ack`
 * does not say: the five minutes AppSync Events documents.
 */
const defaultConnectionTimeoutMs = 300_000;

export interface AppSyncSignalConnectorOptions {
  /** The AppSync Events API's HTTP host, which authorizes the connection. */
  readonly httpHost: string;
  /** The AppSync Events API's realtime host, which the socket connects to. */
  readonly realtimeHost: string;
  /** Times the keep-alive messages. */
  readonly timer: Timer;
  /** Defaults to {@link openWebSocket}. */
  readonly openSocket?: OpenSocket;
  /** The subscription's id. Defaults to a random UUID. */
  readonly newId?: () => string;
}

/**
 * The authorization object AppSync Events reads for Lambda authorization:
 * the HTTP host and the signal token, as is.
 */
export interface SignalAuthorization {
  readonly host: string;
  readonly Authorization: string;
}

/**
 * Connects to AppSync Events' realtime endpoint,
 * `wss://<realtime host>/event/realtime`, offering the
 * `aws-appsync-event-ws` subprotocol and the authorization object as a
 * `header-<base64url>` one; then sends `connection_init`, and on
 * `connection_ack` subscribes to the token's channel with the same
 * authorization object. It closes the connection, and tells why, when the
 * service reports a connection or subscription error, or sends no `ka`
 * (keep-alive) within the `connectionTimeoutMs` of its `connection_ack`.
 */
export class AppSyncSignalConnector implements SignalConnector {
  readonly #options: AppSyncSignalConnectorOptions;

  constructor(options: AppSyncSignalConnectorOptions) {
    this.#options = options;
  }

  connect(
    token: SignalSubscriptionToken,
    handlers: SignalHandlers,
  ): SignalConnection {
    const { httpHost, realtimeHost, timer } = this.#options;
    const openSocket = this.#options.openSocket ?? openWebSocket;
    const id = (this.#options.newId ?? (() => crypto.randomUUID()))();
    const authorization: SignalAuthorization = {
      host: httpHost,
      Authorization: token.token,
    };
    let socket: SignalSocket | undefined;
    let done = false;
    let cancelKeepAlive: CancelTimer | undefined;
    let timeoutMs = defaultConnectionTimeoutMs;

    const end = (): void => {
      done = true;
      cancelKeepAlive?.();
      cancelKeepAlive = undefined;
      socket?.close();
    };
    const fail = (reason: unknown): void => {
      if (!done) {
        end();
        handlers.onClosed(reason);
      }
    };
    const send = (message: object): void => {
      socket?.send(JSON.stringify(message));
    };
    const keepAlive = (): void => {
      cancelKeepAlive?.();
      cancelKeepAlive = timer.schedule(
        () => fail(new SignalConnectionError("keep_alive_timeout", undefined)),
        timeoutMs,
      );
    };

    const onMessage = (data: string): void => {
      if (done) {
        return;
      }
      const message = parseMessage(data);
      if (message === undefined) {
        return;
      }
      switch (message.type) {
        case "connection_ack":
          if (
            typeof message.connectionTimeoutMs === "number" &&
            message.connectionTimeoutMs > 0
          ) {
            timeoutMs = message.connectionTimeoutMs;
          }
          keepAlive();
          send({
            type: "subscribe",
            id,
            channel: token.channel,
            authorization,
          });
          return;
        case "ka":
          keepAlive();
          return;
        case "subscribe_success":
          if (message.id === id) {
            handlers.onSubscribed();
          }
          return;
        case "data":
          if (message.id === id) {
            for (const signal of readEvents(message.event)) {
              if (done) {
                return;
              }
              handlers.onSignal(signal);
            }
          }
          return;
        case "broadcast_error":
          if (message.id === id) {
            handlers.onSignal(undefined);
          }
          return;
        case "connection_error":
        case "subscribe_error":
        case "error":
          fail(new SignalConnectionError(message.type, message.errors));
          return;
        default:
          return;
      }
    };

    try {
      socket = openSocket(
        `wss://${realtimeHost}/event/realtime`,
        [appSyncEventsProtocol, `header-${base64Url(authorization)}`],
        {
          onOpen: () => {
            if (!done) {
              send({ type: "connection_init" });
            }
          },
          onMessage,
          onClose: () => fail(new SignalConnectionError("closed", undefined)),
        },
      );
    } catch (error) {
      // As `new WebSocket` throws for a URL it refuses. Told once the
      // caller holds the connection, as any other failure is.
      queueMicrotask(() => fail(error));
    }
    return { close: end };
  }
}

/**
 * Why a connection to the channel of signals closed: the type of the error
 * message the service sent (`connection_error`, `subscribe_error`,
 * `error`), `keep_alive_timeout`, or `closed` when the socket closed.
 */
export class SignalConnectionError extends Error {
  readonly type: string;
  readonly errors: unknown;

  constructor(type: string, errors: unknown) {
    super(
      `The connection to the channel of signals ended: ${type}` +
        (errors === undefined ? "" : ` ${JSON.stringify(errors)}`),
    );
    this.name = "SignalConnectionError";
    this.type = type;
    this.errors = errors;
  }
}

interface Message {
  readonly type: string;
  readonly id?: unknown;
  readonly connectionTimeoutMs?: unknown;
  readonly event?: unknown;
  readonly errors?: unknown;
}

function parseMessage(data: string): Message | undefined {
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return undefined;
  }
  return isRecord(value) && typeof value.type === "string"
    ? (value as unknown as Message)
    : undefined;
}

/**
 * The signals a `data` message carries. Each event is published as a
 * string of JSON; the message carries it as such, or a list of them.
 */
function readEvents(event: unknown): (Signal | undefined)[] {
  const events = Array.isArray(event) ? event : [event];
  if (events.length === 0) {
    return [undefined];
  }
  return events.map((item) => {
    if (typeof item !== "string") {
      return parseSignal(item);
    }
    try {
      return parseSignal(JSON.parse(item));
    } catch {
      return undefined;
    }
  });
}

/** A signal, or `undefined` when `value` is not one. Ids are kept as strings. */
function parseSignal(value: unknown): Signal | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  if (value.kind === "imported") {
    const organizationId = parseId(value.organizationId);
    return organizationId === undefined
      ? undefined
      : { kind: "imported", organizationId };
  }
  const repositoryId = parseId(value.repositoryId);
  const pullRequestId = parseId(value.pullRequestId);
  const { kind } = value;
  return repositoryId !== undefined &&
    pullRequestId !== undefined &&
    typeof kind === "string"
    ? { repositoryId, pullRequestId, kind }
    : undefined;
}

function parseId(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : undefined;
}

/** `value` as JSON, in base64url without padding, as AppSync Events reads it. */
export function base64Url(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * A connector held in memory, for tests: it records each connection, which
 * a test then subscribes, sends signals to, or closes as the service
 * would.
 */
export class MemorySignalConnector implements SignalConnector {
  readonly #connections: MemorySignalConnection[] = [];

  /** Every connection made, in order. */
  get connections(): readonly MemorySignalConnection[] {
    return this.#connections;
  }

  /** The connections not closed, by either side. */
  get open(): readonly MemorySignalConnection[] {
    return this.#connections.filter(({ closed }) => !closed);
  }

  connect(
    token: SignalSubscriptionToken,
    handlers: SignalHandlers,
  ): SignalConnection {
    const connection = new MemorySignalConnection(token, handlers);
    this.#connections.push(connection);
    return connection;
  }
}

/** A connection of a {@link MemorySignalConnector}. */
export class MemorySignalConnection implements SignalConnection {
  readonly token: SignalSubscriptionToken;
  readonly #handlers: SignalHandlers;
  #closed = false;
  /** Whether the app closed it, rather than the service. */
  #closedByApp = false;

  constructor(token: SignalSubscriptionToken, handlers: SignalHandlers) {
    this.token = token;
    this.#handlers = handlers;
  }

  get closed(): boolean {
    return this.#closed;
  }

  get closedByApp(): boolean {
    return this.#closedByApp;
  }

  close(): void {
    if (!this.#closed) {
      this.#closed = true;
      this.#closedByApp = true;
    }
  }

  /** The service confirms the subscription. */
  subscribed(): void {
    if (!this.#closed) {
      this.#handlers.onSubscribed();
    }
  }

  /** The service delivers `signal`. */
  signal(signal: Signal | undefined = undefined): void {
    if (!this.#closed) {
      this.#handlers.onSignal(signal);
    }
  }

  /** The connection drops, as on a network failure or a server close. */
  drop(reason: unknown = new SignalConnectionError("closed", undefined)): void {
    if (!this.#closed) {
      this.#closed = true;
      this.#handlers.onClosed(reason);
    }
  }
}
