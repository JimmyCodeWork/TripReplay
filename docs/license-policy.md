# Dependency License Policy

English | [繁體中文](zh-TW/license-policy.md)

| | |
|---|---|
| Version | 0.4 |
| Date | 2026-10-19 |
| Status | In effect. No component has been admitted yet. |

TripReplay is released under the [MIT License](../LICENSE). This policy defines which third-party components may be shipped with the application and how their license obligations are met. It takes precedence over the [Product Specification](specification.md). The rationale for the current scope is recorded in the [License Feasibility Assessment](license-assessment.md) and [ADR 0001](adr/0001-dependency-license-scope.md) and [ADR 0002](adr/0002-public-domain-and-data-licenses.md).

## 1. Principles

- TripReplay's own source code is, and remains, licensed under the MIT License.
- Release artifacts may contain third-party components only under the permissive licenses listed in §3. Copyleft licenses are prohibited in release artifacts.
- No component is admitted on the basis of a package's top-level license alone. Transitive dependencies, embedded code and bundled assets are reviewed individually.
- Converting data formats or self-hosting a service does not change the license of the underlying data.
- Copyright licenses do not resolve codec patents or platform terms; the video pipeline is reviewed for these separately.
- No implementation, pinned versions or dependency inventory exists yet; the project therefore does not yet claim compliance with this policy.

## 2. Scope

| Category | Rule |
|---|---|
| **Release artifacts** — installers, app bundles, the deployed Web build, and anything they contain or load from the project's own origin | Subject to §3 and §4 |
| **Development tools** — compilers, type checkers, bundlers, linters, test runners and CI tooling that are not shipped | Exempt from §3, provided their output does not embed non-permitted code. Runtime helpers injected by a tool (for example, `tslib`) are release artifacts. |
| **Platform components** — operating systems, browsers, system WebViews, platform SDKs and system codecs | Exempt, provided they are used as supplied by the platform and never bundled. On Linux, LGPL system libraries such as WebKitGTK and GStreamer must be dynamically linked from the system and must not be bundled into the package. |
| **Map data** | Never bundled in release artifacts. Downloaded at runtime from a provider whose terms permit offline storage and use in exported video, and used under those terms with the required attribution. |
| **User media** | Outside this policy. User content is never relicensed. |

## 3. Permitted Licenses

### 3.1 Code

| SPDX identifier | Additional obligations |
|---|---|
| MIT | Retain copyright and license notice |
| ISC | Retain copyright and license notice |
| BSD-2-Clause | Retain copyright and license notice |
| BSD-3-Clause | Retain copyright and license notice; do not use contributors' names for endorsement |
| 0BSD | None |
| Zlib | Do not misrepresent origin; mark altered versions |
| Apache-2.0 | Include the license text; retain `NOTICE` contents; mark modified files |
| Unicode-3.0 | Retain copyright and license notice |
| blessing | None. This is the SQLite public-domain dedication; embedded copies of SQLite are recorded in the inventory note. |

### 3.2 Fonts, icons, images and other assets

Any license in §3.1, plus:

| SPDX identifier | Additional obligations |
|---|---|
| OFL-1.1 | Bundle the license; do not sell the font by itself; respect Reserved Font Names when subsetting or modifying |
| CC0-1.0 | None |
| CDLA-Permissive-2.0 | Include the license text when distributing the data |

Components that consist primarily of data, such as certificate bundles (for example, `webpki-roots`) or lookup tables, are classified as assets.

### 3.3 Multi-licensed components

- `OR` expressions: admissible if at least one option is permitted. The component is used under that option, and the election is recorded.
- `AND` expressions: admissible only if every term is permitted. For example, `(MIT OR Apache-2.0) AND Unicode-3.0` is admissible.
- Bundled content and dependencies are reviewed independently of the declared expression.

### 3.4 Prohibited in release artifacts

Including, but not limited to: GPL, LGPL, AGPL, MPL, EPL, CDDL, EUPL, SSPL, BUSL and any "Commons Clause" or non-commercial terms; CC BY-SA and CC BY-NC; ODbL-licensed databases; and components with no license or an unidentifiable license.

### 3.5 Amending the allowlist

Adding a license to §3 requires a pull request that amends this policy, states the obligations it introduces, and is approved by a maintainer. Exceptions are not granted per package.

### 3.6 Enforcement

[`licenses/policy.json`](../licenses/policy.json) is the machine-readable form of §3 and must be amended in the same pull request as this document. [`licenses/inventory.json`](../licenses/inventory.json) records every reviewed component shipped in release artifacts and every approved direct development dependency. CI rejects any installed component that is unreviewed, whose declared license has changed, or whose license is not permitted for its category. See the [Development Guide](development.md#license-check).

## 4. Candidate Review

| Candidate | License | Decision |
|---|---|---|
| MapLibre GL JS | BSD-3-Clause | Admissible. Pending pinned-version and transitive review. |
| deck.gl | MIT (transitive ISC, BSD and Apache-2.0) | Admissible. Pending pinned-version and transitive review. |
| OpenStreetMap data | ODbL-1.0 | Not bundled. Regional map files are downloaded by the user from a public source and stored on the device ([ADR 0006](adr/0006-local-only-operation.md)). Bulk download from the OpenStreetMap standard tile servers is prohibited. |
| PMTiles tooling | BSD-3-Clause | Admissible. Pending review. |
| FFmpeg (including WASM builds) | LGPL or GPL depending on build configuration | Prohibited. |
| mediabunny | MPL-2.0 | Prohibited. |
| mp4-muxer | MIT | Admissible. Pending review; maintenance status to be confirmed. |
| Tauri | Apache-2.0 OR MIT (transitive Apache-2.0, ISC, Unicode-3.0, CDLA-Permissive-2.0) | Admissible. Pending pinned-version and transitive review. |
| React | MIT | Admissible. Pending review. |
| TypeScript | Apache-2.0 | Development tool; exempt. |
| SQLite | blessing (public domain) | Admissible. Pending review of the binding used (for example, `sql.js` or `rusqlite`). |
| Noto Sans TC | OFL-1.1 | Admissible as a bundled font. |

The feature set, data model and timeline design in the [Product Specification](specification.md) remain valid.

## 5. Notices

- Release artifacts include a `THIRD-PARTY-NOTICES` file generated from the dependency inventory. It contains every required copyright notice, the full text of each license used, and the contents of every Apache-2.0 `NOTICE` file.
- Installed builds expose the notices from an "About" or "Licenses" screen; the Web build serves them at a stable path.
- Map attribution required by the provider is shown in the map view and, where the provider requires it, rendered into exported videos.

## 6. Release Gate

A release may proceed only when all of the following are met:

1. All versions are pinned and lockfiles are committed.
2. An SBOM covers every component in the release artifacts, including native libraries and assets.
3. Each entry records source, version, hash, SPDX expression, and, where applicable, the elected license option.
4. Third-party content embedded within files has been manually reviewed.
5. CI blocks prohibited licenses, unknown licenses and unreviewed new dependencies.
6. The actual installers and Web build output are inspected, and the generated `THIRD-PARTY-NOTICES` matches their contents.
7. Every version update triggers a new review of the changed components.

## 7. References

Retrieved 2026-10-19. License evidence must be archived for each pinned version during development.

- [MapLibre GL JS license](https://github.com/maplibre/maplibre-gl-js/blob/main/LICENSE.txt)
- [OpenStreetMap copyright and license](https://www.openstreetmap.org/copyright)
- [OSM Tile Usage Policy](https://operations.osmfoundation.org/policies/tiles/)
- [FFmpeg legal](https://www.ffmpeg.org/legal.html)
- [Tauri architecture and licensing](https://tauri.app/concept/architecture/)
- [SPDX License List](https://spdx.org/licenses/)
