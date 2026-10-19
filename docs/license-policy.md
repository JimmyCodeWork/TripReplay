# Dependency License Policy

English | [繁體中文](zh-TW/license-policy.md)

| | |
|---|---|
| Version | 0.2 (draft) |
| Date | 2026-10-19 |
| Status | In effect. No component has been admitted yet. |

TripReplay is released under the [MIT License](../LICENSE). Every component distributed with or required to build the application must also be available under the MIT License. This policy takes precedence over the [Product Specification](specification.md).

## 1. Principles

- "Open source", "free for commercial use", "MIT-compatible", "free of charge" and "public domain" are **not** equivalent to MIT. Only the MIT License satisfies this policy.
- No implementation, pinned versions or complete dependency inventory exists yet; the project therefore does not claim MIT-only compliance.
- Converting data formats or self-hosting a service does not change the license of the underlying data.
- The MIT License covers copyright only. It does not resolve codec patents or platform terms; the video pipeline must be reviewed for these separately.

## 2. Scope

Under the current strict interpretation, the following all require review:

- direct and transitive dependencies;
- native libraries, WASM modules and bundled binaries;
- map data and map styles;
- fonts, icons, music and sample media;
- build and packaging tools.

**Multi-licensed components:** a component qualifies only when MIT is an explicit option (for example, `MIT OR Apache-2.0`), in which case it is used under MIT. A conjunctive expression (`AND`) does not permit choosing a single license. Bundled content and dependencies are reviewed independently.

**Pending definition:** whether the operating system, browser, platform SDKs, system codecs and user-imported private media fall outside the scope of this policy. No exemption is assumed, and user media is never relicensed. If the runtime environment itself had to be MIT-licensed, the Windows, macOS and iOS targets could not be met.

## 3. Candidate Review

| Original candidate | Initial finding | Decision |
|---|---|---|
| MapLibre GL JS | BSD-3-Clause | Rejected. A map renderer must be re-selected. |
| OpenStreetMap data | ODbL | Rejected. Real-world map data requires an explicit MIT grant. |
| FFmpeg (including WASM builds) | LGPL or GPL depending on build configuration | Rejected. |
| Tauri | Core available under MIT | Under review. Its dependencies and platform tooling are not thereby MIT. |
| React, TypeScript, SQLite, PMTiles tooling and other candidates | No audit of pinned versions or full dependency trees | Under review. Not admitted. |
| Fonts, icons, styles, sample media | No per-item license evidence | Must not be included in any release artifact. |

The feature set, data model and timeline design remain valid. Real-world base maps, place search, offline maps, the platform shell and video export each require a compliant implementation before they can ship.

If no MIT-licensed map data can be found, an original schematic background released under MIT may be used to validate animation. Such a background does not satisfy the real-world map requirement.

## 4. Release Gate

A release may proceed only when all of the following are met:

1. All versions are pinned and lockfiles are committed.
2. An SBOM or equivalent inventory covers code, native dependencies, tools and assets.
3. Each entry records source, version, hash, SPDX identifier, LICENSE and NOTICE files, and evidence of the MIT election where applicable.
4. Third-party content embedded within files has been manually reviewed.
5. CI blocks unknown licenses, non-MIT licenses and unreviewed new dependencies.
6. The actual installers and Web build output are inspected, and all required copyright and MIT notices are retained.
7. Every version update triggers a new review.

## 5. References

Initial sources, retrieved 2026-10-19. License evidence must be archived for each pinned version during development.

- [MapLibre GL JS license](https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt)
- [OpenStreetMap copyright and license](https://www.openstreetmap.org/copyright)
- [FFmpeg legal](https://www.ffmpeg.org/legal.html)
- [Tauri architecture and licensing](https://tauri.app/concept/architecture/)
