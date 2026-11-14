import type { AgentTool } from "@tripreplay/app";

/**
 * The TripReplay MCP server on this computer (docs/adr/0012-mcp-server.md), which an agent such as
 * Claude Desktop starts; the page's Content Security Policy allows only this address.
 */
export const MCP_URL = "ws://127.0.0.1:4174";

/** Close codes of the server (apps/mcp/src/bridge.ts). */
const WRONG_CODE = 4001;
const REPLACED = 4002;
const RETRY_MS = 3_000;

export type McpStatus =
  /** Looking for the server, which runs only while the agent has it started. */
  | "waiting"
  | "connected"
  /** The server refused the pairing code; the user enters it again. */
  | "wrongCode"
  /** TripReplay in another tab or window took over the connection. */
  | "replaced";

export interface McpConnection {
  close(): void;
}

/**
 * Connects to the MCP server with the pairing code and runs its tool calls with `tools`, until
 * closed. While the server is not running, it tries again every few seconds.
 */
export function connectMcp(
  code: string,
  tools: () => readonly AgentTool[],
  onStatus: (status: McpStatus) => void,
  url = MCP_URL,
): McpConnection {
  let socket: WebSocket | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let closed = false;

  const open = () => {
    if (closed) return;
    onStatus("waiting");
    const current = new WebSocket(url);
    socket = current;
    current.addEventListener("open", () => current.send(JSON.stringify({ type: "hello", code })));
    current.addEventListener("message", (event) => {
      let message: { type?: string; id?: number; name?: string; input?: Record<string, unknown> };
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (message.type === "welcome") {
        onStatus("connected");
        return;
      }
      if (message.type !== "call" || typeof message.id !== "number") return;
      const tool = tools().find((candidate) => candidate.name === message.name);
      let answer: object;
      try {
        if (!tool) throw new Error(`TripReplay has no tool "${String(message.name)}"`);
        answer = { type: "result", id: message.id, ok: true, value: tool.run(message.input ?? {}) ?? null };
      } catch (error) {
        answer = {
          type: "result",
          id: message.id,
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        };
      }
      current.send(JSON.stringify(answer));
    });
    current.addEventListener("close", (event) => {
      if (socket !== current || closed) return;
      if (event.code === WRONG_CODE) onStatus("wrongCode");
      else if (event.code === REPLACED) onStatus("replaced");
      else {
        onStatus("waiting");
        retry = setTimeout(open, RETRY_MS);
      }
    });
  };

  open();
  return {
    close() {
      closed = true;
      clearTimeout(retry);
      socket?.close();
    },
  };
}
