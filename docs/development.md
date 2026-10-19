# Development Guide

English | [繁體中文](zh-TW/development.md)

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 24 (LTS) | See [`.node-version`](../.node-version). Older versions are rejected at install time. |
| pnpm | 12.14.0 | Pinned in `package.json`; run `corepack enable` to use the pinned version automatically. |
| Git | Any recent version | Commits must be signed off (`git commit -s`). |

## Getting Started

```sh
corepack enable
pnpm install --frozen-lockfile
```

## Commands

| Command | Purpose |
|---|---|
| `pnpm run lint` | Check formatting and lint rules (Biome); fails on any issue |
| `pnpm run format` | Apply formatting and safe lint fixes |
| `pnpm run typecheck` | Type-check all TypeScript sources |
| `pnpm test` | Run the tests of every workspace package |
| `pnpm run license:check` | Verify installed dependencies against the license policy |

CI runs `lint`, `typecheck`, `test` and `license:check` on every pull request and on every push to `main` ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)).

## Repository Layout

| Path | Contents |
|---|---|
| `apps/` | Web build and platform shells (not yet created) |
| `packages/` | Shared modules: `domain`, `timeline`, `renderer`, `offline`, `project-package`, `ui` (not yet created) |
| `tools/license-check/` | License check used by CI |
| `licenses/` | Machine-readable license policy and dependency inventory |
| `docs/` | Specification, policies, roadmap and architecture decision records; Traditional Chinese under `docs/zh-TW/` |

## License Check

The license check enforces the [Dependency License Policy](license-policy.md) using two files:

- [`licenses/policy.json`](../licenses/policy.json) lists the permitted SPDX identifiers for `code` and, additionally, for `asset` components. It mirrors policy §3 and is changed only together with the policy.
- [`licenses/inventory.json`](../licenses/inventory.json) records the review of every component.

### Rules

| Dependency type | Rule |
|---|---|
| Production (`dependencies`), including all transitive dependencies | Each `name@version` must appear in `release`, with `declared` equal to the package's declared license, and the license must be permitted for its `category` |
| Development (`devDependencies`), direct only | Each package name must appear in `development`. Licenses are not restricted, because development tools are not shipped. |
| Inventory | Entries for packages that are no longer installed fail the check, so the inventory always matches the lockfile |

### Inventory entry format

```json
{
  "release": {
    "earcut@3.2.4": { "declared": "ISC", "category": "code" },
    "legacy-pkg@1.0.0": {
      "declared": "MIT/X11",
      "resolved": "MIT",
      "category": "code",
      "note": "Declared value is not valid SPDX; LICENSE file reviewed and is the MIT License."
    }
  },
  "development": ["@biomejs/biome", "typescript"]
}
```

| Field | Meaning |
|---|---|
| `declared` | The license string exactly as the package declares it. If it changes on upgrade, the check fails until the entry is reviewed again. |
| `resolved` | Optional. The SPDX expression determined by review, used when `declared` is not valid SPDX. |
| `category` | `code`, or `asset` for fonts, images and data. |
| `note` | Optional. Review notes, such as embedded third-party code or the elected option of an `OR` expression. |

### Adding or upgrading a dependency

1. Open a dependency request issue and obtain approval.
2. Install the package with `pnpm add`.
3. Run `pnpm run license:check`. It lists every new `name@version` that needs review.
4. Review each listed package — including its LICENSE file and any embedded third-party code — and add an entry for it.
5. Commit `package.json`, `pnpm-lock.yaml` and `licenses/inventory.json` together.

The diff of `licenses/inventory.json` is the review record; reviewers check it against the packages' actual license files.
