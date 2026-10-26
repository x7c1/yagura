import { ManualTimer } from "@yagura/browser";
import { describe, expect, it } from "vitest";
import {
  AppSyncSignalConnector,
  base64Url,
  SignalConnectionError,
  type OpenSocket,
  type Signal,
  type SignalHandlers,
  type SocketListeners,
} from "./signals";

const httpHost = "example.appsync-api.us-east-1.amazonaws.com";
const realtimeHost = "example.appsync-realtime-api.us-east-1.amazonaws.com";
const token = { token: "signal-token-1", channel: "/viewers/1004" };
const subscriptionId = "subscription-1";

/** A WebSocket held in memory, standing for the AppSync Events endpoint. */
class FakeSocket {
  readonly url: string;
  readonly protocols: readonly string[];
  readonly listeners: SocketListeners;
  readonly sent: unknown[] = [];
  closed = false;

  constructor(
    url: string,
    protocols: readonly string[],
    listeners: SocketListeners,
  ) {
    this.url = url;
    this.protocols = protocols;
    this.listeners = listeners;
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {
    this.closed = true;
  }

  /** The service sends `message`. */
  receive(message: unknown): void {
    this.listeners.onMessage(JSON.stringify(message));
  }
}

function setup() {
  const sockets: FakeSocket[] = [];
  const openSocket: OpenSocket = (url, protocols, listeners) => {
    const socket = new FakeSocket(url, protocols, listeners);
    sockets.push(socket);
    return socket;
  };
  const timer = new ManualTimer();
  const connector = new AppSyncSignalConnector({
    httpHost,
    realtimeHost,
    timer,
    openSocket,
    newId: () => subscriptionId,
  });
  const events = {
    subscribed: 0,
    signals: [] as (Signal | undefined)[],
    closed: [] as unknown[],
  };
  const handlers: SignalHandlers = {
    onSubscribed: () => {
      events.subscribed += 1;
    },
    onSignal: (signal) => events.signals.push(signal),
    onClosed: (reason) => events.closed.push(reason),
  };
  const connection = connector.connect(token, handlers);
  const socket = sockets[0];
  if (socket === undefined) {
    throw new Error("No socket was opened");
  }
  return { socket, connection, timer, events };
}

/** Opens the socket, and acknowledges the connection and subscription. */
function subscribe(socket: FakeSocket, connectionTimeoutMs = 300_000): void {
  socket.listeners.onOpen();
  socket.receive({ type: "connection_ack", connectionTimeoutMs });
  socket.receive({ type: "subscribe_success", id: subscriptionId });
}

function decodeBase64Url(value: string): unknown {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  return JSON.parse(atob(base64));
}

const signal = { repositoryId: "r1", pullRequestId: "pr1", kind: "pushed" };

describe("AppSyncSignalConnector", () => {
  it("connects to the realtime endpoint with the authorization object as a subprotocol", () => {
    const { socket } = setup();

    expect(socket.url).toBe(`wss://${realtimeHost}/event/realtime`);
    const [protocol, header, ...rest] = socket.protocols;
    expect(protocol).toBe("aws-appsync-event-ws");
    expect(rest).toEqual([]);
    expect(header).toMatch(/^header-[A-Za-z0-9_-]+$/);
    expect(decodeBase64Url(header?.slice("header-".length) ?? "")).toEqual({
      host: httpHost,
      Authorization: "signal-token-1",
    });
  });

  it("sends connection_init once open, and subscribes to the channel on connection_ack", () => {
    const { socket, events } = setup();

    expect(socket.sent).toEqual([]);
    socket.listeners.onOpen();
    expect(socket.sent).toEqual([{ type: "connection_init" }]);
    socket.receive({ type: "connection_ack", connectionTimeoutMs: 300_000 });
    expect(socket.sent[1]).toEqual({
      type: "subscribe",
      id: subscriptionId,
      channel: "/viewers/1004",
      authorization: { host: httpHost, Authorization: "signal-token-1" },
    });
    expect(events.subscribed).toBe(0);
    socket.receive({ type: "subscribe_success", id: subscriptionId });
    expect(events.subscribed).toBe(1);
  });

  it("delivers the signals of data messages, whether the event is a string or a list of them", () => {
    const { socket, events } = setup();
    subscribe(socket);

    socket.receive({
      type: "data",
      id: subscriptionId,
      event: JSON.stringify(signal),
    });
    socket.receive({
      type: "data",
      id: subscriptionId,
      event: [
        JSON.stringify({ ...signal, kind: "merged" }),
        JSON.stringify({ ...signal, repositoryId: 7 }),
      ],
    });
    socket.receive({ type: "data", id: "another", event: "{}" });

    expect(events.signals).toEqual([
      signal,
      { ...signal, kind: "merged" },
      { ...signal, repositoryId: "7" },
    ]);
  });

  it("tells of an unreadable signal, and of one the service failed to deliver, without the signal", () => {
    const { socket, events } = setup();
    subscribe(socket);

    socket.receive({ type: "data", id: subscriptionId, event: "not json" });
    socket.receive({
      type: "broadcast_error",
      id: subscriptionId,
      errors: [{ errorType: "MessageProcessingError" }],
    });

    expect(events.signals).toEqual([undefined, undefined]);
    expect(events.closed).toEqual([]);
  });

  it("closes when no keep-alive arrives within the acknowledged timeout", () => {
    const { socket, timer, events } = setup();
    subscribe(socket, 10_000);

    timer.advance(9_000);
    socket.receive({ type: "ka" });
    timer.advance(9_000);
    expect(events.closed).toEqual([]);
    timer.advance(1_000);

    expect(socket.closed).toBe(true);
    expect(events.closed).toHaveLength(1);
    expect(events.closed[0]).toMatchObject({ type: "keep_alive_timeout" });
  });

  it.each(["subscribe_error", "connection_error", "error"])(
    "closes on %s, and tells why",
    (type) => {
      const { socket, events } = setup();
      socket.listeners.onOpen();
      socket.receive({ type: "connection_ack", connectionTimeoutMs: 300_000 });

      const errors = [{ errorType: "UnauthorizedException" }];
      socket.receive({ type, id: subscriptionId, errors });

      expect(socket.closed).toBe(true);
      expect(events.closed).toHaveLength(1);
      expect(events.closed[0]).toBeInstanceOf(SignalConnectionError);
      expect(events.closed[0]).toMatchObject({ type, errors });
    },
  );

  it("tells once when the socket closes", () => {
    const { socket, events } = setup();
    subscribe(socket);

    socket.listeners.onClose();
    socket.listeners.onClose();

    expect(events.closed).toHaveLength(1);
    expect(events.closed[0]).toMatchObject({ type: "closed" });
  });

  it("tells nothing more once the app closes the connection", () => {
    const { socket, connection, timer, events } = setup();
    subscribe(socket);

    connection.close();
    socket.listeners.onClose();
    socket.receive({
      type: "data",
      id: subscriptionId,
      event: JSON.stringify(signal),
    });
    timer.advance(600_000);

    expect(socket.closed).toBe(true);
    expect(events.closed).toEqual([]);
    expect(events.signals).toEqual([]);
    expect(timer.pending).toBe(0);
  });
});

describe("base64Url", () => {
  it("writes JSON in base64url without padding", () => {
    // `{"a":"??>"}` is `eyJhIjoiPz8+In0=` in plain base64.
    expect(base64Url({ a: "??>" })).toBe("eyJhIjoiPz8-In0");
  });
});
