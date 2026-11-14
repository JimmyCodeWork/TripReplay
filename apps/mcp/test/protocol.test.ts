import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createServer, PROTOCOL_VERSIONS, ToolError } from "../src/protocol.ts";

const server = createServer({
  name: "tripreplay",
  version: "0.1.0",
  instructions: "Use get_trip first.",
  tools: () => [
    {
      name: "get_trip",
      title: "Read the trip",
      description: "Reads the trip.",
      inputSchema: { type: "object" },
      readOnly: true,
    },
  ],
  async call(_name, input) {
    if (input.fail) throw new ToolError("No trip is open.");
    return { title: "Kyoto" };
  },
});

describe("MCP protocol", () => {
  it("initializes in the client's protocol version when it knows it, else its newest", async () => {
    const known = await server({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18" },
    });
    assert.deepEqual((known as { result: { protocolVersion: string } }).result.protocolVersion, "2025-06-18");
    const unknown = await server({
      jsonrpc: "2.0",
      id: 2,
      method: "initialize",
      params: { protocolVersion: "1999-01-01" },
    });
    const result = (unknown as { result: { protocolVersion: string; capabilities: unknown; instructions: string } })
      .result;
    assert.equal(result.protocolVersion, PROTOCOL_VERSIONS[0]);
    assert.deepEqual(result.capabilities, { tools: { listChanged: false } });
    assert.equal(result.instructions, "Use get_trip first.");
  });

  it("answers no notification, and pings", async () => {
    assert.equal(await server({ jsonrpc: "2.0", method: "notifications/initialized" }), undefined);
    assert.deepEqual(await server({ jsonrpc: "2.0", id: 3, method: "ping" }), { jsonrpc: "2.0", id: 3, result: {} });
  });

  it("lists tools with their read-only hint", async () => {
    const response = (await server({ jsonrpc: "2.0", id: 4, method: "tools/list" })) as {
      result: { tools: { name: string; annotations: { readOnlyHint: boolean } }[] };
    };
    assert.deepEqual(
      response.result.tools.map((t) => [t.name, t.annotations.readOnlyHint]),
      [["get_trip", true]],
    );
  });

  it("returns a tool's result as text, and its failure as an error result for the agent", async () => {
    const ok = (await server({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "get_trip" } })) as {
      result: { content: { text: string }[]; isError: boolean };
    };
    assert.equal(ok.result.isError, false);
    assert.deepEqual(JSON.parse(ok.result.content[0]?.text ?? ""), { title: "Kyoto" });
    const failed = (await server({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: { name: "get_trip", arguments: { fail: true } },
    })) as { result: { content: { text: string }[]; isError: boolean } };
    assert.equal(failed.result.isError, true);
    assert.equal(failed.result.content[0]?.text, "No trip is open.");
  });

  it("reports unknown tools, unknown methods and invalid requests as protocol errors", async () => {
    const tool = (await server({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "nope" } })) as {
      error: { code: number };
    };
    assert.equal(tool.error.code, -32602);
    const method = (await server({ jsonrpc: "2.0", id: 8, method: "resources/list" })) as { error: { code: number } };
    assert.equal(method.error.code, -32601);
    const invalid = (await server({ id: 9 })) as { error: { code: number } };
    assert.equal(invalid.error.code, -32600);
  });
});
