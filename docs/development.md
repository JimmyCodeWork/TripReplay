# Development Guide

English | [繁體中文](zh-TW/development.md)

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 24 (LTS) | See [`.node-version`](../.node-version). Older versions are rejected at install time. |
| pnpm | 12.14.0 | Pinned in `package.json`; run `corepack enable` to use the pinned version automatically. |
| Git | Any recent version | |
| Docker | Optional | Required only for `pnpm run verify:clean`. |

## Getting Started

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run hooks:install   # optional; see Local Verification
```

## Commands

| Command | Purpose |
|---|---|
| `pnpm run verify` | Run every check that CI runs, in the same order |
| `pnpm run verify:clean` | Run `verify` in a clean Linux container (requires Docker) |
| `pnpm run hooks:install` | Enable the repository's Git hooks |
| `pnpm run lint` | Check formatting and lint rules (Biome); fails on any issue |
| `pnpm run format` | Apply formatting and safe lint fixes |
| `pnpm run typecheck` | Type-check all TypeScript sources: core, application and tools without DOM types (`tsconfig.json`), adapters with them (`tsconfig.browser.json`) |
| `pnpm test` | Run the tests of every workspace package |
| `pnpm run test:browser` | Run the adapter tests in headless Chromium (Playwright); see [Browser tests](#browser-tests) |
| `pnpm run deps:check` | Verify package boundaries (see [Application Architecture §5](architecture.md#5-rules)) |
| `pnpm run i18n:check` | Verify the message catalogs (see [Localization §3](localization.md#3-message-catalogs)) |
| `pnpm run license:check` | Verify installed dependencies against the license policy |

`verify` runs `lint`, `typecheck`, `test`, `deps:check`, `i18n:check` and `license:check`, stopping at the first failure.

## Local Verification

All checks run locally. The CI workflow ([`.github/workflows/ci.yml`](../.github/workflows/ci.yml)) runs the same `pnpm run verify` command on every pull request and every push to `main`, followed by `pnpm run test:browser`, so a change that passes locally passes in CI.

### Browser tests

Adapter packages test their browser APIs (OPFS, IndexedDB, WebGL) in headless Chromium through Vitest browser mode and Playwright. Install the browser once with `pnpm --filter @tripreplay/storage exec playwright install chromium`. Where the download is not possible, set `CHROMIUM_PATH` to an existing Chromium executable instead. WebGL uses SwiftShader, a software implementation, so no GPU is required. These tests are not part of `verify`, so that `verify` needs no browser.

### Levels

| Level | Command | When to use |
|---|---|---|
| 1. Working tree | `pnpm run verify` | During development and before every push |
| 2. Clean container | `pnpm run verify:clean` | Before merging into `main`, after changing dependencies or tooling, or when results differ between machines |

`verify:clean` copies the working tree, excluding `node_modules`, `.git` and local files, into a `node:24` Debian container, installs dependencies from the lockfile, and runs `verify`. It reproduces the CI environment on any host, including Windows and macOS, and leaves no image behind. Dependencies are cached between runs.

### Git hooks

`pnpm run hooks:install` sets `core.hooksPath` to [`.githooks/`](../.githooks) for this clone only. The hooks are POSIX shell scripts and also run on Windows under Git for Windows.

| Hook | Runs | Purpose |
|---|---|---|
| `pre-commit` | `pnpm run lint` | Catch formatting and lint errors before committing |
| `pre-push` | `pnpm run verify` | Block pushes that would fail CI |

To bypass a hook once, add `--no-verify` to `git commit` or `git push`. To disable the hooks, run `git config --unset core.hooksPath`.

## Repository Layout

| Path | Contents |
|---|---|
| `apps/` | Web build and platform shells (not yet created) |
| `packages/` | Product packages: `domain`, `themes`, `i18n`, `timeline`, `app`, `renderer`, `map`, `storage`, `ui`; others planned as defined in the [Application Architecture §3](architecture.md#3-packages) |
| `packages/domain/` | Data model, invariants and pure editing operations |
| `packages/themes/` | Built-in recap themes as data |
| `packages/timeline/` | Timeline compiler and `renderAt`, which describes each frame of the recap |
| `packages/app/` | Editor state, commands with undo and redo, autosave, and the ports adapters implement |
| `packages/renderer/` | Drawing of the recap frames; defines the `MapLayer` port |
| `packages/map/` | Base map drawn with MapLibre GL JS from PMTiles files on the device, resumable region downloads from Overture Maps, and place search in the downloaded maps |
| `packages/storage/` | Projects and the list of map regions in IndexedDB, media in OPFS, with crash-safe imports, start-up recovery and the [project package](project-package.md) |
| `packages/i18n/` | Locale resolution, message catalogs (`locales/`) and message formatting |
| `packages/ui/` | Screens and components in React, starting with the maps dialog |
| `tools/deps-check/` | Package boundary check used by CI; allowed dependencies in `boundaries.json` |
| `tools/i18n-check/` | Message catalog check used by CI |
| `tools/license-check/` | License check used by CI |
| `tools/variants/` | Generates the variant-character table for place search from the OpenCC dictionaries |
| `tools/ci/` | Container definition for `verify:clean` |
| `.githooks/` | Optional Git hooks |
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
