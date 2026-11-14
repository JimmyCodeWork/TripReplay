// The Model Context Protocol, as much of it as a server of tools needs
// (https://modelcontextprotocol.io/specification): JSON-RPC 2.0 messages for initialization,
// listing tools and calling them. Transport-independent and without side effects, so it is tested
// on its own.

/** Protocol versions this server speaks, newest first; it answers in the client's when it can. */
export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;

export interface ToolDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: object;
  readonly readOnly: boolean;
}

/** An error a tool reports to the agent, as a result rather than a protocol error. */
export class ToolError extends Error {
  override name = "ToolError";
}

export interface ServerOptions {
  readonly name: string;
  readonly version: string;
  /** Told to the agent at initialization: what the server is for and how to start. */
  readonly instructions: string;
  readonly tools: () => readonly ToolDefinition[];
  /** Runs a tool; throws `ToolError` (or any error) for the agent to read. */
  readonly call: (name: string, input: Record<string, unknown>) => Promise<unknown>;
}

type Id = string | number;
interface Request {
  readonly jsonrpc: "2.0";
  readonly id?: Id;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}
export type Response =
  | { readonly jsonrpc: "2.0"; readonly id: Id; readonly result: unknown }
  | { readonly jsonrpc: "2.0"; readonly id: Id | null; readonly error: { code: number; message: string } };

const failure = (id: Id | null, code: number, message: string): Response => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
});

/**
 * Handles one message from the client and returns the response, or undefined for a notification,
 * which gets none.
 */
export function createServer(options: ServerOptions): (message: unknown) => Promise<Response | undefined> {
  return async (message) => {
    const request = message as Partial<Request> | null;
    if (request?.jsonrpc !== "2.0" || typeof request.method !== "string") {
      return failure(null, -32600, "Invalid request");
    }
    const { id, method, params = {} } = request;
    if (id === undefined) return undefined;
    switch (method) {
      case "initialize": {
        const asked = params.protocolVersion;
        const version = PROTOCOL_VERSIONS.find((v) => v === asked) ?? PROTOCOL_VERSIONS[0];
        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: version,
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: options.name, version: options.version },
            instructions: options.instructions,
          },
        };
      }
      case "ping":
        return { jsonrpc: "2.0", id, result: {} };
      case "tools/list":
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: options.tools().map((tool) => ({
              name: tool.name,
              title: tool.title,
              description: tool.description,
              inputSchema: tool.inputSchema,
              annotations: { readOnlyHint: tool.readOnly },
            })),
          },
        };
      case "tools/call": {
        const name = params.name;
        if (typeof name !== "string" || !options.tools().some((tool) => tool.name === name)) {
          return failure(id, -32602, `Unknown tool: ${String(name)}`);
        }
        const input = (params.arguments ?? {}) as Record<string, unknown>;
        try {
          const value = await options.call(name, input);
          return {
            jsonrpc: "2.0",
            id,
            result: { content: [{ type: "text", text: JSON.stringify(value, null, 2) }], isError: false },
          };
        } catch (error) {
          const text = error instanceof Error ? error.message : String(error);
          return { jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError: true } };
        }
      }
      default:
        return failure(id, -32601, `Method not found: ${method}`);
    }
  };
}
