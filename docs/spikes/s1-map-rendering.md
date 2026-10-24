# Spike S1 — Map Rendering and Data

English | [繁體中文](../zh-TW/spikes/s1-map-rendering.md)

| | |
|---|---|
| Date | 2026-10-24 |
| Status | Partly complete. Renderer, tile format and labels answered; frame rate on reference devices, the map download source and on-device place search remain (see [Open points](#open-points)). Updated for [ADR 0006](../adr/0006-local-only-operation.md): maps are downloaded and used on the device, with no server. |
| Roadmap | [M1, S1](../roadmap.md#m1--technical-validation-phase-a) |

## Questions

1. Which renderer is admissible under the license policy, and can `renderAt` drive it?
2. Which map file format can be downloaded by region and read by range on the device?
3. Are Traditional Chinese labels rendered correctly?
4. How are place names searched on the device?

## Result

| Question | Answer |
|---|---|
| Renderer | **MapLibre GL JS** (BSD-3-Clause). Its runtime dependencies are MIT, ISC, BSD-2-Clause, BSD-3-Clause and MIT OR Apache-2.0, all on the allowlist. `renderAt` drives it frame by frame with `jumpTo`; its own animations are not used. |
| Map files | **PMTiles** (BSD-3-Clause reader): one file per region, read by range. The prototype read it over HTTP; the product reads the downloaded file from the device with the same access pattern. |
| Labels | Traditional Chinese labels render correctly through MapLibre's local ideograph rendering, without glyph files for CJK characters. |
| Place search | On the device, from the place names in the downloaded map (§5). Not yet measured. |

The prototype was a throwaway page driven by Playwright; as planned for spikes, it is not merged.

## 1. Rendering setup

- **Base map:** MapLibre draws the base map on its own canvas.
- **Overlays:** the route, stop markers, titles and attribution are drawn on a separate 2D canvas from the `FrameDescription`. Positions come from `map.project`. This keeps the `MapLayer` port narrow: the map engine only draws the base map for a camera.
- **Zoom:** camera zoom from the timeline is adjusted by `log2(actual width / reference width)`; the 512-pixel tiles match the timeline's `WORLD_SIZE`.
- **Longitudes:** MapLibre accepts the timeline's continuous longitudes (for example 188° after crossing the International Date Line, or 362° for Paris reached eastward). Camera, route and markers therefore stay in one coordinate frame, without wrapping logic in the renderer.
- **Export mode:** each frame waits for the map's `idle` event (tiles loaded and drawn) before it is captured. This is the basis for the fixed-step export in M5.

## 2. Findings that changed the code

- **Overview framing.** The timeline framed the smallest arc of longitude containing every stop. A route from Apia to Paris goes east over the Americas, so the closing overview cut off the last leg. The overview now frames the extent of the unwrapped route; tests cover this case and a route around the world.

## 3. Map files

The data hosts and tile tools (Geofabrik, Planetiler releases, Protomaps builds) were not reachable from the spike environment. The prototype therefore built a PMTiles v3 file from Natural Earth data (public domain) with a small throwaway writer: 11,383 tiles, zoom 0–7, 4 MB. The official PMTiles reader and MapLibre read it through range requests.

For the product ([ADR 0006](../adr/0006-local-only-operation.md)):

- **Regions:** each region (for example a country) is one PMTiles file derived from OpenStreetMap, downloaded once from a public source that the project does not operate, and stored in OPFS. Map files of this kind are produced with Planetiler and the Protomaps basemap schema; regional extracts of the planet build are a few megabytes to a few gigabytes depending on area and zoom range.
- **Download source:** to be chosen at the architecture gate. Its terms must permit downloading regional files, storing them and using them in exported video.
- **Date Line:** polygons crossing the International Date Line must be split in the map files. The prototype's own builder did not do this, which caused horizontal streaks.
- **Labels:** confirm that the map files carry Traditional Chinese names (for example `name:zh-Hant`) and how they fall back to `name:zh` and the local name.
- **Attribution:** "© OpenStreetMap contributors" is shown on the map and in every recap.

## 4. Labels and fonts

- MapLibre renders CJK ideographs with a local font (`localIdeographFontFamily`), so Traditional Chinese labels need no glyph files. The bundled Noto Sans TC (OFL-1.1) is used for this and for the overlay text, so that labels look the same on every platform.
- Latin labels still need glyph files (signed distance field PBFs) generated from a permissively licensed font such as Noto Sans. The generator must pass the dependency license policy; it is a build tool and is not shipped.
- Base-map place labels can collide with stop markers. The style should hide or offset labels near the current stop.

## 5. Place search on the device

The map files already contain the names of places, stations and points of interest, with their positions. After a region is downloaded, the application builds a place-name index from them and searches it on the device; no search request leaves the device. Stops can also be set from photo GPS, by a pin, or by pasting coordinates or a map link.

To be measured in a follow-up: index size and build time per region, search speed, and coverage of Traditional Chinese names. Searching only labels at low zoom levels misses small places, so the index must read the zoom levels that contain them.

## 6. Performance

Measured in headless Chromium with SwiftShader, a software WebGL implementation. These numbers show where time goes, not device performance.

| Measurement | Result |
|---|---|
| Work per frame in our code (`renderAt`, `jumpTo`, overlay drawing), 95th percentile | 2.1 ms |
| Real-time playback with software rendering | 10 fps |
| Export-style stepping (wait until tiles are drawn), median / 95th percentile | 197 ms / 556 ms per frame |

Our code uses about 6 % of a 33 ms frame budget; the rest is map rasterization, which a hardware GPU handles much faster. The 30 fps criterion can only be confirmed on the reference devices.

## Open points

- **Frame rate on reference devices** with hardware graphics, desktop and mobile, at 1080p, with a real OpenStreetMap basemap.
- **Map download source** and its terms; region size and update cadence (§3).
- **Place-name index** built from the downloaded map: size, speed, Traditional Chinese coverage (§5).
- **Latin glyph generation** with a license-compliant tool.
- **Route shape**: legs are straight lines in Web Mercator. Great-circle arcs would look more natural for long flights; this is a design choice for M2.

## Sources

- [Protomaps basemap downloads](https://docs.protomaps.com/basemaps/downloads) and [building a custom basemap](https://docs.protomaps.com/basemaps/build)
- [Planetiler](https://github.com/onthegomap/planetiler) and its [planet build notes](https://github.com/onthegomap/planetiler/blob/main/PLANET.md)
