# Architecture Decision Records

English | [繁體中文](../zh-TW/adr/README.md)

This directory records significant architecture and policy decisions. Each record describes the context, the decision and its consequences, and is never rewritten after acceptance; a later record supersedes it instead.

| ADR | Title | Status |
|---|---|---|
| [0001](0001-dependency-license-scope.md) | Dependency license scope | Accepted |
| [0002](0002-public-domain-and-data-licenses.md) | Permit SQLite and CDLA-Permissive-2.0 | Accepted |
| [0003](0003-language-and-toolchain.md) | Primary language and toolchain | Accepted |
| [0004](0004-web-first-release.md) | Web-first, screen-first 1.0 with self-hosted OpenStreetMap tiles | Accepted; map hosting superseded by 0006 |
| [0005](0005-modular-architecture.md) | Modular, layered application architecture | Accepted |
| [0006](0006-local-only-operation.md) | Local-only operation: downloaded maps and on-device place search | Accepted |

## Writing a Record

1. Copy [`template.md`](template.md) to `NNNN-short-title.md`, using the next number.
2. Add the Traditional Chinese translation under `docs/zh-TW/adr/` with the same file name.
3. Open a pull request with the status set to `Proposed`. The status changes to `Accepted` when the pull request is merged.
