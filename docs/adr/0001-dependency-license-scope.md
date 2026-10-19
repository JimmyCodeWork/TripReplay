# 0001. Dependency License Scope

English | [繁體中文](../zh-TW/adr/0001-dependency-license-scope.md)

| | |
|---|---|
| Status | Accepted |
| Date | 2026-10-19 |

## Context

TripReplay is released under the MIT License. Version 0.2 of the [Dependency License Policy](../license-policy.md) required every component — including transitive dependencies, build tools, map data and fonts — to be MIT-licensed. The [License Feasibility Assessment](../license-assessment.md) found that this rule cannot be met by a product that shows real-world maps, renders Traditional Chinese text, or ships installed builds: no MIT-licensed map data or CJK font was found, TypeScript is Apache-2.0, Tauri's windowing layer is Apache-2.0, and every surveyed map renderer depends on ISC, BSD or Apache-2.0 code.

## Decision

Adopt option C of the assessment:

- TripReplay's own source code remains MIT-licensed.
- Release artifacts may contain third-party code under MIT, ISC, BSD-2-Clause, BSD-3-Clause, 0BSD, Zlib, Apache-2.0 and Unicode-3.0; assets may additionally use OFL-1.1 and CC0-1.0.
- Copyleft licenses are prohibited in release artifacts.
- Development tools that are not shipped, and platform components that are not bundled, are exempt.
- Map data is never bundled; it is downloaded at runtime under the selected provider's terms.

The policy text is the authoritative statement of this decision.

## Alternatives Considered

- **Option A — strict MIT for everything.** Rejected: not feasible for the specified product.
- **Option B — MIT-only for shipped code, tools and platform exempt.** Rejected: feasible only with substantial reimplementation of small libraries and in-house native shells, at a cost disproportionate to its benefit over option C.

## Consequences

- Mainstream libraries such as MapLibre GL JS, deck.gl, React and Tauri become admissible, subject to per-version review.
- TypeScript can be used as the primary language for shared code.
- Release artifacts must carry a generated `THIRD-PARTY-NOTICES` file, including Apache-2.0 `NOTICE` contents.
- Downstream users can reuse TripReplay without copyleft obligations.
- Public-domain code (notably SQLite) and CDLA-Permissive-2.0 data remain open questions for a future amendment.
