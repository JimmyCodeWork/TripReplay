import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { WebSocket } from "ws";
import { type Bridge, CLOSE, startBridge } from "../src/bridge.ts";
import { codeMatches, loadPairingCode } from "../src/pairing.ts";
import { ToolError } from "../src/protocol.ts";

const PORT = 41_740 + Math.floor(Math.random() * 100);
const ORIGIN = "http://localhost:4173";

/** Connects as TripReplay would, from `origin`, and resolves once open or closed. */
function connect(origin = ORIGIN): Promise<{ socket: WebSocket; closed: Promise<number> }> {
  const socket = new WebSocket(`ws://127.0.0.1:${PORT}`, { origin });
  const closed = new Promise<number>((resolve) => socket.on("close", (code) => resolve(code)));
  return new Promise((resolve) => {
    socket.on("open", () => resolve({ socket, closed }));
    socket.on("error", () => resolve({ socket, closed }));
  });
}

const next = (socket: WebSocket) =>
  new Promise<{ type: string; id?: number; name?: string }>((resolve) =>
    socket.once("message", (data) => resolve(JSON.parse(String(data)))),
  );

describe("bridge", () => {
  let bridge: Bridge;
  before(async () => {
    bridge = await startBridge({ code: "123456", port: PORT });
  });
  after(async () => {
    await bridge.close();
  });

  it("refuses pages of other origins", async () => {
    const { socket } = await connect("https://example.com");
    assert.notEqual(socket.readyState, WebSocket.OPEN);
  });

  it("closes a connection with a wrong pairing code", async () => {
    const { socket, closed } = await connect();
    socket.send(JSON.stringify({ type: "hello", code: "000000" }));
    assert.equal(await closed, CLOSE.wrongCode);
    assert.equal(bridge.connected(), false);
  });

  it("refuses tool calls until TripReplay is connected", async () => {
    await assert.rejects(bridge.call("get_trip", {}), ToolError);
  });

  it("passes tool calls to the paired TripReplay and its answers back", async () => {
    const { socket } = await connect();
    socket.send(JSON.stringify({ type: "hello", code: "123 456" }));
    assert.equal((await next(socket)).type, "welcome");
    assert.equal(bridge.connected(), true);
    socket.on("message", (data) => {
      const call = JSON.parse(String(data)) as { id: number; name: string };
      socket.send(
        JSON.stringify(
          call.name === "get_trip"
            ? { type: "result", id: call.id, ok: true, value: { title: "Kyoto" } }
            : { type: "result", id: call.id, ok: false, message: "No such stop" },
        ),
      );
    });
    assert.deepEqual(await bridge.call("get_trip", {}), { title: "Kyoto" });
    await assert.rejects(bridge.call("update_stop", { stopId: "x" }), { message: "No such stop" });
    socket.close();
  });
});

describe("pairing code", () => {
  it("is made once, kept readable only by the user, and compared ignoring spaces", () => {
    const file = join(mkdtempSync(join(tmpdir(), "tripreplay-mcp-")), "TripReplay", "mcp.json");
    const code = loadPairingCode(file);
    assert.match(code, /^\d{6}$/);
    assert.equal(loadPairingCode(file), code);
    assert.equal(JSON.parse(readFileSync(file, "utf8")).code, code);
    if (process.platform !== "win32") assert.equal(statSync(file).mode & 0o777, 0o600);
    assert.equal(codeMatches(code, `${code.slice(0, 3)} ${code.slice(3)}`), true);
    assert.equal(codeMatches(code, "12345"), false);
    assert.equal(codeMatches(code, 123456), false);
  });
});
