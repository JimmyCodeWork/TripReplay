# License Feasibility Assessment

English | [繁體中文](zh-TW/license-assessment.md)

| | |
|---|---|
| Version | 0.1 (draft) |
| Date | 2026-10-19 |
| Status | For decision. Informs the open scope question in the [Dependency License Policy §2](license-policy.md#2-scope). |

## 1. Purpose

The [Dependency License Policy](license-policy.md) currently applies a strict MIT-only rule to every component, including transitive dependencies, native libraries, build tools, map data and fonts. This assessment samples the candidate ecosystem to determine whether that rule can be met, and sets out the scope options available to the project.

This is a point-in-time survey, not a compliance audit. Licenses were read from package registry metadata only; the LICENSE files, embedded third-party code and NOTICE requirements of each package have not been reviewed.

## 2. Method

- **npm:** `latest` metadata from registry.npmjs.org, plus a full transitive scan of a sample install (`@deck.gl/core`, `@deck.gl/layers`, `@deck.gl/geo-layers`, `react`, `react-dom`, `mp4-muxer`, `i18next`, `vite`, `vitest`, `esbuild`).
- **Rust:** latest published version metadata from crates.io.
- **.NET:** latest published version metadata from api.nuget.org.
- All data retrieved on 2026-10-19.

## 3. Findings

### 3.1 Map data and fonts

| Resource | License | Strict MIT |
|---|---|---|
| OpenStreetMap data | ODbL-1.0 | Fails |
| Natural Earth | Public domain | Fails (public domain is not MIT under the policy) |
| Protomaps basemap styles (`@protomaps/basemaps` 5.7.2) | BSD-3-Clause | Fails |
| Noto Sans TC (`@fontsource/noto-sans-tc`) | OFL-1.1 | Fails |

No source of real-world map data or CJK fonts under the MIT License was identified. **Under the strict rule, the application cannot ship real-world maps or bundled Traditional Chinese fonts.**

### 3.2 Web application stack

| Package | Version | License | Strict MIT |
|---|---|---|---|
| react, react-dom | 19.3.1 | MIT | Passes (package level) |
| @deck.gl/core | 9.4.0 | MIT | Passes (package level) |
| @luma.gl/core | 9.4.2 | MIT | Passes (package level) |
| @loaders.gl/mvt | 4.5.4 | MIT | Passes (package level) |
| mp4-muxer | 5.2.2 | MIT | Passes (package level) |
| mediabunny | 1.61.6 | MPL-2.0 | Fails |
| i18next | 26.5.2 | MIT | Passes (package level) |
| @formatjs/intl | 6.1.3 | MIT | Passes (package level) |
| pmtiles | 4.5.0 | BSD-3-Clause | Fails |
| leaflet | 1.9.4 | BSD-2-Clause | Fails |
| ol (OpenLayers) | 10.11.0 | BSD-2-Clause | Fails |
| d3-geo | 3.1.1 | ISC | Fails |
| idb | 8.0.4 | ISC | Fails |
| comlink | 4.4.2 | Apache-2.0 | Fails |
| @sqlite.org/sqlite-wasm | 3.53.4 | Apache-2.0 | Fails |
| sql.js | 1.15.0 | MIT | Passes (package level; embeds public-domain SQLite) |

**Transitive scan:** the sample install resolved 174 packages, of which 144 declare MIT. The remainder:

| License | Packages |
|---|---|
| Apache-2.0 | apache-arrow, flatbuffers, draco3d, h3-js, a5-js, long, detect-libc, expect-type |
| BSD-3-Clause | @mapbox/vector-tile, pbf, ieee754, source-map-js, @webgpu/types, md5, crypt, charenc, sprintf-js |
| ISC | earcut, @mapbox/martini, @mapbox/point-geometry, lz4js, inherits, picocolors |
| BSD-2-Clause | @mapbox/tiny-sdf |
| MPL-2.0 | lightningcss (Vite dependency) |
| 0BSD | tslib |
| MIT AND Zlib | pako |
| MIT OR GPL-3.0-or-later | jszip (passes by electing MIT) |

Packages licensed MIT at the top level still pull in non-MIT runtime code. deck.gl, for example, depends on earcut (ISC), pbf (BSD-3-Clause) and @mapbox/tiny-sdf (BSD-2-Clause).

### 3.3 Build and test tools

| Tool | Version | License | Strict MIT |
|---|---|---|---|
| typescript | 7.0.2 | Apache-2.0 | Fails |
| vite | 8.3.4 | MIT (depends on MPL-2.0 lightningcss) | Fails transitively |
| esbuild | 0.28.2 | MIT | Passes (package level) |
| rollup | 4.64.10 | MIT | Passes (package level) |
| vitest | 5.0.5 | MIT | Passes (package level) |
| @playwright/test | 1.64.1 | Apache-2.0 | Fails |
| @biomejs/biome | 2.5.15 | MIT OR Apache-2.0 | Passes by electing MIT |
| eslint, prettier | 10.13.0, 3.9.10 | MIT | Passes (package level) |

**Under the strict rule, TypeScript cannot be used**, even as a type checker that is never distributed.

### 3.4 Installed-application shells

| Component | Version | License | Strict MIT |
|---|---|---|---|
| tauri, wry | 3.0.0-alpha.5, 0.57.0 | Apache-2.0 OR MIT | Passes by electing MIT |
| tao (Tauri windowing) | 0.37.1 | Apache-2.0 | Fails |
| unicode-ident (ubiquitous Rust dependency) | 1.0.27 | (MIT OR Apache-2.0) AND Unicode-3.0 | Fails |
| ring | 0.17.14 | Apache-2.0 AND ISC | Fails |
| webpki-roots | 1.0.9 | CDLA-Permissive-2.0 | Fails |
| Avalonia (.NET) | 12.1.4 | MIT | Passes (package level; renders through native Skia, BSD-3-Clause) |
| SkiaSharp (.NET) | 4.156.0-preview | MIT | Passes (package level; wraps native Skia, BSD-3-Clause) |
| Microsoft.Maui.Controls (.NET) | 11.0.0-rc.2 | MIT | Passes (package level; no Linux or Web target) |
| Mapsui (.NET) | 5.2.0-beta.1 | MIT | Passes (package level; depends on NetTopologySuite, BSD-3-Clause) |

Tauri itself offers MIT, but its windowing layer `tao` is Apache-2.0 only, so **Tauri fails the strict rule**. Every surveyed native UI stack ultimately ships a native renderer or runtime that contains non-MIT code.

### 3.5 Platform components

On Linux, system WebViews (WebKitGTK) and media frameworks (GStreamer) are LGPL. On Windows, macOS, iOS and Android, the WebView, codecs and SDKs are proprietary or Apache-2.0. These cannot meet any MIT requirement and must be excluded as platform components if the project is to ship installed builds at all.

## 4. Conclusion

The strict rule as currently written cannot be met by a product that displays real-world maps, renders Traditional Chinese text, or ships an installed build on any platform. The three blockers are:

1. **Map data and fonts.** No MIT-licensed real-world map data or CJK font exists among mainstream sources.
2. **Build tooling.** TypeScript and the main browser test runner are Apache-2.0.
3. **Transitive runtime code.** Every surveyed map renderer and native shell depends on ISC, BSD or Apache-2.0 code.

## 5. Scope Options

| | A. Strict (current) | B. MIT for shipped code | C. Permissive allowlist |
|---|---|---|---|
| Project source code | MIT | MIT | MIT |
| Third-party code shipped in release artifacts | MIT only | MIT only | MIT, ISC, BSD-2-Clause, BSD-3-Clause, 0BSD, Zlib, Apache-2.0, Unicode-3.0 |
| Copyleft (GPL, LGPL, AGPL, MPL) in release artifacts | Prohibited | Prohibited | Prohibited |
| Build, test and development tools not shipped | Must be MIT | Exempt | Exempt |
| OS, browser, WebView, platform SDKs and system codecs | Undefined | Exempt as platform components | Exempt as platform components |
| Map data and fonts | Must be MIT and bundled | Never bundled; downloaded at runtime from a user-selected provider under that provider's terms; system fonts used for CJK text | Same as B, or bundled under a permitted data/font license (for example, OFL-1.1 for fonts) |
| User media | Not relicensed | Not relicensed | Not relicensed |
| Feasibility | **Not feasible** for the stated product | Feasible for the Web build; installed builds require project-written thin shells over system WebViews, and small non-MIT libraries (such as earcut and pbf) must be reimplemented | Feasible with mainstream libraries |
| Main cost | — | Significant reimplementation effort; Tauri is excluded | Larger NOTICE file; departs from a pure MIT dependency tree |

In every option, the TripReplay source code remains under the MIT License. Permissive licenses in option C are compatible with distributing the application under MIT, provided their notices are reproduced.

## 6. Recommendation

**Adopt option C**, with copyleft licenses prohibited in all release artifacts and runtime-downloaded map data handled as in option B. It keeps the project MIT-licensed, allows downstream reuse without copyleft obligations, and makes the product buildable with established libraries.

If a dependency tree that is MIT-only by construction is itself a project goal, adopt **option B**, and accept that Phase A must include reimplementing several small libraries and building native shells in-house rather than adopting Tauri.

Option A should be retired in either case.

## 7. Next Steps

1. Decide between options B and C, and amend the [Dependency License Policy](license-policy.md) accordingly.
2. Re-evaluate the platform shell: Tauri is admissible under C only.
3. Implement the CI license gate against the chosen allowlist before the first dependency is added.
4. Confirm that the chosen map provider's terms permit offline storage and use in exported video ([Specification §4.3](specification.md#43-offline-mode-rules)).
