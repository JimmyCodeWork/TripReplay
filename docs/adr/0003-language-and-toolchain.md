# 0003. Primary Language and Toolchain

English | [繁體中文](../zh-TW/adr/0003-language-and-toolchain.md)

| | |
|---|---|
| Status | Accepted |
| Date | 2026-10-19 |

## Context

The [Specification §5](../specification.md#5-architecture) proposes a shared code base for the domain model, timeline, renderer and UI across Web and five installed platforms. [ADR 0001](0001-dependency-license-scope.md) permits Apache-2.0 development tools. Milestone M0.2 requires the language and toolchain to be fixed before any product code or dependency is added.

## Decision

| Area | Choice | Version | License |
|---|---|---|---|
| Shared code | TypeScript, strict mode, ES modules | 7.0.2 | Apache-2.0 (development tool) |
| Tooling runtime | Node.js LTS | 24 | MIT (development tool) |
| Package manager | pnpm workspaces | 12.14.0 | MIT (development tool) |
| Lint and format | Biome | 2.5.15 | MIT OR Apache-2.0 (development tool) |
| Unit tests | Node.js test runner for tooling; Vitest for product packages once they exist | — | MIT (development tool) |
| Installed-platform shell | Rust, via the shell chosen in spike S4 | — | Decided at the architecture gate |
| Native mobile plugins | Kotlin (Android), Swift (iOS and macOS) | — | Decided at the architecture gate |

Conventions:

- **Repository layout.** A single monorepo: `packages/*` for the shared modules listed in the specification, `apps/*` for the Web build and platform shells, `tools/*` for repository tooling.
- **Exact versions.** Dependencies are saved with exact versions (`saveExact`), and the lockfile is committed.
- **Type safety.** `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` and `erasableSyntaxOnly` are enabled, so that tooling can run directly on Node.js without a build step.
- **Self-contained tooling.** The license check uses only the Node.js standard library, so the gate does not depend on the packages it checks.
- **Supply chain.** GitHub Actions are pinned to full commit SHAs and run with read-only permissions.
- **Rust dependencies.** `cargo-deny` will enforce the same allowlist once the first Rust crate is added.

The UI framework remains as proposed in the specification (React) and is confirmed at the architecture gate after spike S4.

## Alternatives Considered

- **C# with .NET (Avalonia or .NET MAUI).** Strong MIT-licensed ecosystem and maintainer familiarity. Rejected for the shared core: the Web build would ship a WebAssembly runtime, and the browser-native APIs this product depends on (WebCodecs, OPFS, WebGL/WebGPU map rendering) are first-class only in JavaScript.
- **ESLint and Prettier.** Mature, but two tools and a larger plugin dependency tree. Biome covers both with a single binary.
- **npm or Yarn.** pnpm's strict dependency isolation and built-in license listing suit the license gate.

## Consequences

- Contributors need Node.js 24 and pnpm 12; installation fails on older Node.js versions because `engineStrict` is enabled.
- TypeScript 7 is a native compiler; plugins that rely on the JavaScript compiler API of TypeScript 5 and earlier are not available.
- A second test runner (Vitest) will be introduced with the first product package, in a pull request that also adds it to the license inventory.
