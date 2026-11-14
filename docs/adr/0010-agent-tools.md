# 0010. Tools for the Browser's AI Agent, Offered Through WebMCP

English | [繁體中文](../zh-TW/adr/0010-agent-tools.md)

| | |
|---|---|
| Status | Accepted |
| Date | 2026-11-14 |

## Context

The maintainer asked for an MCP server for the desktop version, so that an AI agent can help write a trip: plan its stops, write the journal and notes, and adjust the timing.

The Web application keeps its trips in the browser's storage (IndexedDB and the origin private file system), which a separate MCP server process cannot read. Three ways were weighed:

- **A local MCP server that reads and writes backup files.** It works offline and changes nothing in the application, but every change takes an export and a restore.
- **A local MCP server that the open application connects to.** Changes appear at once, but the application would open a connection, even if only to the same computer, which [ADR 0006](0006-local-only-operation.md) rules out, and the connection would need pairing and protection.
- **WebMCP.** The page registers tools with the browser (`document.modelContext.registerTool`, [WebMCP draft](https://webmachinelearning.github.io/webmcp/)), and the browser's own agent calls them. The tools run in the page, on the trip as it is being edited.

The maintainer chose WebMCP. In November 2026 it is an origin trial in Chrome 149 to 156 and not enabled by default in any browser. Chrome first offered it as `navigator.modelContext`, then moved it to `document.modelContext`. The Android System WebView does not offer it.

## Decision

1. **WebMCP only.** The Web application offers tools through `document.modelContext`, or `navigator.modelContext` in browsers that have it there. TripReplay runs no MCP server and opens no connection; the browser passes the agent's calls to the page.
2. **Off until the user turns it on.** An **AI agent** button in the workspace bar, shown only where the browser offers WebMCP, turns the tools on or off. The choice is kept in the browser's local storage. The tools are offered only while a trip is open and the tools are on.
3. **The open trip, and its text only.** One tool reads the trip: its title, dates, day lines, stops with their locations and journal entries, and the file names, notes and durations of its photos and videos. The others rename the trip, add a stop, change a stop (name, location, journal, day and position), set a day's line, set the note of a photo or video, set a photo's duration, and set the recap timing. No tool reads or sends photos, videos or music, removes anything, imports files, or opens another trip.
4. **Every change goes through the editor.** A tool dispatches the same commands as the interface, so each change is validated, saved and one step to undo. Wrong input is refused with a message that tells the agent what to fix.
5. **The definitions are independent of WebMCP.** The `app` package defines the tools with their JSON Schemas; the Web shell registers them. Another way of offering them later reuses the definitions.

## Alternatives Considered

- **A local MCP server for backup files.** Not chosen: every change takes an export and a restore, and the maintainer preferred to work in the open trip.
- **A local server that the application connects to.** Not chosen: it adds a network connection to an application that makes none while the user works ([ADR 0006](0006-local-only-operation.md)), and needs pairing and protection against other local programs.
- **Tools that remove stops or media, or import files.** Left out of the first version, so that an agent cannot lose work or add files the user did not choose.

## Consequences

- With the tools on, the browser's agent reads the text of the open trip, including stop locations, and the agent's provider may receive it. The [Privacy Statement](../privacy.md) says so. TripReplay itself still sends nothing.
- The text of a trip may come from someone else, for example in a restored backup, so the reading tool is marked as returning untrusted content.
- WebMCP is a draft. The tools follow its November 2026 shape and are tested against a stand-in of `document.modelContext`; a change in the draft or in Chrome can require changes here.
- A browser may keep a tool after it was withdrawn. The tools therefore look up the open trip when called, and refuse while no trip is open or the tools are off.
- During the origin trial, Chrome offers WebMCP on a website only when the website's origin is registered for the trial and the page carries its token, or when the user turns on `chrome://flags/#enable-webmcp-testing`. No token is part of the application yet; registering one is the maintainer's step for the website they publish.
- The Android application does not offer the tools.
