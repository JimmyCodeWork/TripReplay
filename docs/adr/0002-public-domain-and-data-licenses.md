# 0002. Permit SQLite and CDLA-Permissive-2.0

English | [繁體中文](../zh-TW/adr/0002-public-domain-and-data-licenses.md)

| | |
|---|---|
| Status | Accepted |
| Date | 2026-10-19 |

## Context

[ADR 0001](0001-dependency-license-scope.md) left two questions open:

- **SQLite** is dedicated to the public domain under its own terms (SPDX `blessing`). It is the planned storage engine for installed builds ([Specification §5](../specification.md#5-architecture)) and is embedded by most bindings, such as `sql.js` and `rusqlite`.
- **CDLA-Permissive-2.0** covers data such as the Mozilla root certificate bundle distributed as `webpki-roots`, a transitive dependency of Tauri's networking stack.

Neither license imposes copyleft obligations.

## Decision

Amend the [Dependency License Policy](../license-policy.md) to version 0.4:

- Add `blessing` to the permitted code licenses.
- Add `CDLA-Permissive-2.0` to the permitted asset licenses, and classify components that consist primarily of data, such as certificate bundles, as assets.

General public-domain dedications other than `blessing` and `CC0-1.0` remain outside the allowlist and require a further amendment.

## Alternatives Considered

- **Exclude SQLite** and use IndexedDB-only or custom storage on installed builds. Rejected: it discards a mature, transactional engine for no licensing benefit.
- **Replace `webpki-roots`** with platform certificate stores. Not required by policy; may still be chosen on technical grounds.

## Consequences

- SQLite bindings and Tauri become admissible, subject to per-version review.
- The SQLite source embedded by a binding must be noted in the inventory entry of that binding.
- `THIRD-PARTY-NOTICES` must include the CDLA-Permissive-2.0 text when such data is shipped.
