import { type WebSocket, WebSocketServer } from "ws";
import { codeMatches } from "./pairing.ts";
import { ToolError } from "./protocol.ts";

/** Port TripReplay connects to; the page allows only this one (docs/adr/0012-mcp-server.md). */
export const BRIDGE_PORT = 4174;

/** Pages that may connect: the project's site and TripReplay run on this computer. */
export const DEFAULT_ORIGINS = [
  "https://jimmycodework.github.io",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
] as const;

/** Close codes TripReplay understands. */
export const CLOSE = { wrongCode: 4001, replaced: 4002, noHello: 4003 } as const;

const HELLO_TIMEOUT_MS = 5_000;
const CALL_TIMEOUT_MS = 30_000;

/** Messages between this server and TripReplay, as JSON over the WebSocket. */
export type FromApp =
  | { readonly type: "hello"; readonly code: string }
  | { readonly type: "result"; readonly id: number; readonly ok: true; readonly value: unknown }
  | { readonly type: "result"; readonly id: number; readonly ok: false; readonly message: string };
export type ToApp =
  | { readonly type: "welcome" }
  | { readonly type: "call"; readonly id: number; readonly name: string; readonly input: Record<string, unknown> };

export interface BridgeOptions {
  readonly code: string;
  readonly port?: number;
  readonly origins?: readonly string[];
  /** Messages for the person running the server; never on standard output, which carries the protocol. */
  readonly log?: (message: string) => void;
}

export interface Bridge {
  /** Whether TripReplay is connected and paired. */
  connected(): boolean;
  /** Whether the bridge could listen; false when another server holds the port. */
  listening(): boolean;
  /** Runs a tool in TripReplay; throws `ToolError` when it is not connected or the tool fails. */
  call(name: string, input: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
}

/**
 * Listens on this computer only, for the TripReplay page that the user paired with the pairing
 * code. Pages of other origins are refused, and so is a connection that does not send the code in
 * time. One TripReplay is connected at a time; a newer one replaces it.
 */
export function startBridge({
  code,
  port = BRIDGE_PORT,
  origins = DEFAULT_ORIGINS,
  log = () => {},
}: BridgeOptions): Promise<Bridge> {
  const allowed = new Set(origins);
  let app: WebSocket | undefined;
  let listening = false;
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: NodeJS.Timeout }
  >();

  const server = new WebSocketServer({
    host: "127.0.0.1",
    port,
    verifyClient: ({ origin }: { origin: string }) => allowed.has(origin),
  });

  const failPending = (message: string) => {
    for (const [id, call] of pending) {
      clearTimeout(call.timer);
      call.reject(new ToolError(message));
      pending.delete(id);
    }
  };

  server.on("connection", (socket) => {
    let paired = false;
    const timer = setTimeout(() => socket.close(CLOSE.noHello, "Send the pairing code first"), HELLO_TIMEOUT_MS);
    socket.on("message", (data) => {
      let message: FromApp;
      try {
        message = JSON.parse(String(data)) as FromApp;
      } catch {
        return;
      }
      if (!paired) {
        clearTimeout(timer);
        if (message.type !== "hello" || !codeMatches(code, message.code)) {
          log("TripReplay sent a wrong pairing code.");
          socket.close(CLOSE.wrongCode, "Wrong pairing code");
          return;
        }
        paired = true;
        if (app && app !== socket) app.close(CLOSE.replaced, "Another TripReplay connected");
        app = socket;
        socket.send(JSON.stringify({ type: "welcome" } satisfies ToApp));
        log("TripReplay connected.");
        return;
      }
      if (message.type !== "result") return;
      const call = pending.get(message.id);
      if (!call) return;
      pending.delete(message.id);
      clearTimeout(call.timer);
      if (message.ok) call.resolve(message.value);
      else call.reject(new ToolError(message.message));
    });
    socket.on("close", () => {
      clearTimeout(timer);
      if (app === socket) {
        app = undefined;
        failPending("TripReplay disconnected before answering.");
        log("TripReplay disconnected.");
      }
    });
  });

  const bridge: Bridge = {
    connected: () => app !== undefined,
    listening: () => listening,
    call(name, input) {
      const socket = app;
      if (!socket) return Promise.reject(new ToolError("TripReplay is not connected."));
      const id = nextId++;
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new ToolError("TripReplay did not answer in time."));
        }, CALL_TIMEOUT_MS);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ type: "call", id, name, input } satisfies ToApp));
      });
    },
    close: () =>
      new Promise((resolve) => {
        failPending("The server is stopping.");
        for (const client of server.clients) client.terminate();
        server.close(() => resolve());
      }),
  };

  return new Promise((resolve) => {
    server.once("listening", () => {
      listening = true;
      resolve(bridge);
    });
    server.once("error", (error) => {
      log(`Cannot listen on 127.0.0.1:${port}: ${error.message}. Is another TripReplay MCP server running?`);
      resolve(bridge);
    });
  });
}
