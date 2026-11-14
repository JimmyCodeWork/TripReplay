// The TripReplay MCP server (docs/adr/0012-mcp-server.md). An agent such as Claude Desktop or
// Claude Code starts it and talks MCP over standard input and output; the trip itself stays in the
// browser, where TripReplay connects to this server on 127.0.0.1 once the user turns on MCP and
// enters the pairing code. Each tool call is run by TripReplay on the open trip.

import { createInterface } from "node:readline";
import { agentTools } from "@tripreplay/app";
import { BRIDGE_PORT, DEFAULT_ORIGINS, startBridge } from "./bridge.ts";
import { loadPairingCode, pairingFile } from "./pairing.ts";
import { createServer, type ToolDefinition, ToolError } from "./protocol.ts";

const VERSION = "0.1.0";

/** Labels of the tools for people, in English like the protocol's other texts. */
const TITLES: Readonly<Record<string, string>> = {
  get_trip: "Read the trip",
  rename_trip: "Rename the trip",
  add_stop: "Add a stop",
  update_stop: "Edit a stop",
  set_day_note: "Set a day's line",
  set_media_note: "Set a photo or video note",
  set_photo_duration: "Set a photo's duration",
  set_timing: "Set the recap timing",
};

const STATUS_TOOL = "tripreplay_status";

const log = (message: string) => process.stderr.write(`[tripreplay-mcp] ${message}\n`);

const code = loadPairingCode(pairingFile());
const port = Number(process.env.TRIPREPLAY_MCP_PORT) || BRIDGE_PORT;
const origins = [
  ...DEFAULT_ORIGINS,
  ...(process.env.TRIPREPLAY_MCP_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
];
const bridge = await startBridge({ code, port, origins, log });

const howToConnect = () =>
  bridge.listening()
    ? `Open a trip in TripReplay in the browser on this computer, select MCP at the top of the trip, and enter the pairing code ${code}. The code stays the same, so this is needed only once in that browser.`
    : `This server could not listen on 127.0.0.1:${port}, probably because another TripReplay MCP server is running; close the other agent session or set TRIPREPLAY_MCP_PORT.`;

// The trip's tools as TripReplay defines them; this server only passes their calls on.
const tripTools: ToolDefinition[] = agentTools({
  project: () => {
    throw new Error("unused");
  },
  dispatch: () => {
    throw new Error("unused");
  },
  newId: () => "",
}).map((tool) => ({
  name: tool.name,
  title: TITLES[tool.name] ?? tool.name,
  description: tool.description,
  inputSchema: tool.inputSchema,
  readOnly: tool.readOnly,
}));

const tools: ToolDefinition[] = [
  {
    name: STATUS_TOOL,
    title: "Connection to TripReplay",
    description:
      "Tells whether TripReplay is connected, and if not, how the user connects it, with the pairing code to tell them. Call it when another tool says TripReplay is not connected.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    readOnly: true,
  },
  ...tripTools,
];

const handle = createServer({
  name: "tripreplay",
  version: VERSION,
  instructions:
    "Tools for TripReplay, which turns a trip's itinerary, photos and videos into an animated map recap. The tools read and edit the trip open in TripReplay in the user's browser; each change can be undone there with Undo. Call get_trip first for the ids the other tools take. If TripReplay is not connected, call tripreplay_status and tell the user how to connect it.",
  tools: () => tools,
  async call(name, input) {
    if (name === STATUS_TOOL) {
      return bridge.connected()
        ? { connected: true }
        : { connected: false, pairingCode: code, howToConnect: howToConnect() };
    }
    if (!bridge.connected()) throw new ToolError(`TripReplay is not connected. ${howToConnect()}`);
    return bridge.call(name, input);
  },
});

const lines = createInterface({ input: process.stdin, crlfDelay: Number.POSITIVE_INFINITY });
lines.on("line", (line) => {
  if (line.trim() === "") return;
  let message: unknown;
  try {
    message = JSON.parse(line);
  } catch {
    process.stdout.write(
      `${JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } })}\n`,
    );
    return;
  }
  void handle(message).then((response) => {
    if (response) process.stdout.write(`${JSON.stringify(response)}\n`);
  });
});
lines.on("close", () => {
  void bridge.close().then(() => process.exit(0));
});
log(`Ready. Pairing code ${code} (kept in ${pairingFile()}).`);
