# 0012. A Local MCP Server for AI Agents, Connected by Choice

English | [繁體中文](../zh-TW/adr/0012-mcp-server.md)

| | |
|---|---|
| Status | Accepted. Amends decision 3 of [ADR 0006](0006-local-only-operation.md): with MCP turned on, the Web application connects to a server on the same computer |
| Date | 2026-11-14 |

## Context

[ADR 0010](0010-agent-tools.md) offers the open trip to the browser's own AI agent through WebMCP. In November 2026 no browser enables WebMCP by default, while agents such as Claude Desktop and Claude Code already take tools from MCP servers. The maintainer asked for an MCP server, switchable and off by default.

An MCP server is a program on the computer, and TripReplay keeps its trips in the browser's storage, which such a program cannot read. Three ways were weighed:

- **A server that edits backup files.** No connection is needed, but every change takes a backup and a restore.
- **A server that the open TripReplay connects to.** Changes are made in the open trip, as with WebMCP, but the page opens a connection, to the same computer only.
- **Reading the browser's storage files from outside.** Rejected outright: it depends on the browser's internal formats and would bypass the application.

## Decision

1. **A local MCP server, `apps/mcp`.** A Node.js program that an agent starts and talks to over standard input and output. It implements the part of MCP that a server of tools needs (initialization, listing and calling tools), without the MCP SDK, so that it adds only `ws` (MIT) as a dependency. It offers the tools of ADR 0010, from the same definitions in the `app` package, and a `tripreplay_status` tool that tells whether TripReplay is connected and how to connect it.
2. **The trip stays in the browser.** The server listens on `127.0.0.1:4174` for a WebSocket from TripReplay and passes each tool call to it; TripReplay runs the tool on the open trip through the editor, so every change is validated, saved and one step to undo, and answers.
3. **Off until the user turns it on.** An **MCP** button in the workspace bar of the Web application (not the Android application) turns the connection on or off; the choice is kept in the browser. While it is on and a trip is open, TripReplay looks for the server every few seconds; the server runs only while the agent has it started.
4. **Paired with a code.** The server keeps a six-digit pairing code in the user's configuration directory, readable only by the user, and tells it to the agent when TripReplay is not connected; the agent tells the user, who enters it in TripReplay once in that browser. The server refuses a connection without the right code, and pages of other origins than the project's site and TripReplay at `localhost:4173`; more origins can be added with `TRIPREPLAY_MCP_ORIGINS`. One TripReplay is connected at a time.
5. **The page allows only this address.** The Content Security Policy adds `ws://127.0.0.1:4174` to the allowed connections, and nothing else.

## Alternatives Considered

- **The MCP SDK.** Not used: a server of tools needs little of the protocol, and the SDK brings an HTTP stack and many packages to review for a stdio server.
- **A server that edits backup files.** Not chosen as the first: every change takes a backup and a restore. It remains possible later.
- **No pairing, relying on the origin check.** Rejected: other programs on the computer can send any origin. The code keeps them from driving TripReplay.

## Consequences

- With MCP on, the agent reads the open trip's text and its provider may receive it, as with WebMCP. The [Privacy Statement](../privacy.md) says so.
- The Web application makes one more kind of connection, to its own computer only, and only while the user has MCP on. It still sends nothing to any other server.
- Browsers may ask for permission before a website connects to the user's own computer, for example Chrome's local network access prompt.
- Using the server needs Node.js 24 and a copy of the source, installed with the launchers in `launch/`, and an entry in the agent's configuration ([User Guide §5](../user-guide.md#5-write-the-journal)).
