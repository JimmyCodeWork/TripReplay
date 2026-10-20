# 0005. Modular, Layered Application Architecture

English | [繁體中文](../zh-TW/adr/0005-modular-architecture.md)

| | |
|---|---|
| Status | Accepted |
| Date | 2026-10-20 |

## Context

Product code is about to start. The screens, the recap animation, the map engine and the storage technology are all likely to be revised after users try 1.0, and later releases add export, offline packages and installed builds. Code organized as a few large files would make each such change risky and expensive.

## Decision

Structure all product code as described in the [Application Architecture](../architecture.md):

- **Layers:** a pure core (`domain`, `timeline`, `themes`, `i18n`), an application layer (`app`) that owns state and commands and defines ports, adapters that implement the ports with browser APIs (`renderer`, `map`, `media`, `audio`, `storage`), a presentation layer (`ui`), and a composition root (`apps/web`).
- **Dependencies point inward only**, with no cycles and no imports of another package's internal files. This is enforced automatically.
- **`renderAt` returns a FrameDescription** instead of drawing, so that preview, playback and later export share one definition, and the drawing technology can change independently.
- **Every external technology sits behind a port**, so that it can be replaced by writing a new adapter.
- **React** is the UI framework, confined to `ui` and `apps/web`; application state uses a small store without a state-management library.

## Alternatives Considered

- **A single application package.** Rejected: simpler to start, but boundaries erode and changes to one area ripple through others.
- **Drawing inside the timeline.** Rejected: ties timing logic to one drawing technology and makes determinism hard to test.
- **A state-management library.** Not needed at the expected size; a small store keeps the dependency tree and the license review smaller. Can be revisited behind the `app` boundary.
- **No UI framework.** Rejected: the workspace has enough interactive state (drag and drop, dialogs, synchronized panels) that a component model pays for itself.

## Consequences

- More packages and more interfaces than a minimal implementation would need.
- Core logic is testable in Node.js without a browser.
- A dependency check is added to `pnpm run verify` when the first of these packages is created.
- Replacing the map engine, the storage technology or the UI framework is limited to the corresponding adapter or presentation package.
