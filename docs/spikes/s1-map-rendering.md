# Spike S1 — Map Rendering and Data

English | [繁體中文](../zh-TW/spikes/s1-map-rendering.md)

| | |
|---|---|
| Date | 2026-10-24 |
| Status | Complete. Renderer, tile format, labels and the map download source (Overture Maps, §3.1) answered; on-device place search measured (§5); frame rate measured on three devices (§6.1). Accepted at the architecture gate ([ADR 0007](../adr/0007-architecture-gate.md)); remaining work is listed under [Open points](#open-points). Updated for [ADR 0006](../adr/0006-local-only-operation.md): maps are downloaded and used on the device, with no server. |
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
- **Download source:** Overture Maps is proposed and was verified (§3.1). Its terms must permit downloading regional files, storing them and using them in exported video.
- **Date Line:** polygons crossing the International Date Line must be split in the map files. The prototype's own builder did not do this, which caused horizontal streaks.
- **Labels:** confirm that the map files carry Traditional Chinese names (for example `name:zh-Hant`) and how they fall back to `name:zh` and the local name.
- **Attribution:** "© OpenStreetMap contributors" is shown on the map and in every recap.

### 3.1 Overture Maps as the download source

Overture Maps (a Linux Foundation project) publishes its data as one PMTiles archive per theme in a public Amazon S3 bucket, `overturemaps-extras-us-west-2`, under `tiles/<release>/<theme>.pmtiles`. Verified on 2026-10-25 against release `2026-10-21.0`:

| Check | Result |
|---|---|
| Browser access | CORS allows any origin (`Access-Control-Allow-Origin: *`), the `Range` header, and exposes `ETag` and `Content-Range`; range reads answer `206 Partial Content` |
| Release discovery | Listing the bucket (`?list-type=2&prefix=tiles/&delimiter=/`) is also CORS-enabled and lists the releases (`2026-09-23.0`, `2026-09-23.1`, `2026-10-21.0`). The STAC catalog at `stac.overturemaps.org` is the documented alternative; it was not reachable from the spike environment |
| Cost of planning a download | Reading only the directories to list a region's tiles took 67 requests and 1 MB for four themes and two regions |

Themes and zoom ranges used for a recap:

| Theme | Content | Zoom | License |
|---|---|---|---|
| `base` | Land, water, land use, infrastructure | 0–13 | ODbL |
| `transportation` | Roads | 0–14 | ODbL |
| `divisions` | Countries, regions, localities and their labels | 0–12 | ODbL |
| `places` | Points of interest, used for on-device place search | 14 only | CDLA-Permissive-2.0 and Apache-2.0 |

Region sizes, with base, transportation and divisions limited to zoom 12 and places at zoom 14:

| Region | Size |
|---|---|
| Taiwan | 342 MB |
| Western Honshu (Kansai to Chūgoku) | 606 MB |

At full zoom, Taiwan is about 760 MB. Low-zoom tiles cover large areas and are shared between regions, so they are downloaded once.

Names:

| Layer | Finding |
|---|---|
| `divisions` near Taipei (zoom 10) | 2,747 of 3,116 features carry a Chinese name in `names`, with `zh-Hant` where available (for example 臺北市) |
| `divisions` near Kyoto (zoom 10) | Mostly Japanese names (京都市, 宇治市); a few carry `zh-Hant`. Japanese kanji names are generally readable for Traditional Chinese users |
| `places` | Names are mostly the primary local name only (Taipei: 189 of 13,786 carry a Chinese variant; Kyoto: 2 of 9,951) |

The label order for Traditional Chinese is therefore `zh-Hant`, then `zh`, then the primary name, and place search matches the primary name as well as the localized names.

Limits:

- Overture states that these archives are not designed as a production-ready cartographic basemap. The application supplies its own style for the four themes.
- Each release stays in the bucket for at most 60 days. Downloaded regions keep working; checking for updates lists the current releases.
- Attribution: "© OpenStreetMap contributors, Overture Maps Foundation", plus the sources of `places` as listed by Overture.

## 4. Labels and fonts

- MapLibre renders CJK ideographs with a local font (`localIdeographFontFamily`), so Traditional Chinese labels need no glyph files. The bundled Noto Sans TC (OFL-1.1) is used for this and for the overlay text, so that labels look the same on every platform.
- Latin labels still need glyph files (signed distance field PBFs) generated from a permissively licensed font such as Noto Sans. The generator must pass the dependency license policy; it is a build tool and is not shipped.
- Base-map place labels can collide with stop markers. The style should hide or offset labels near the current stop.

## 5. Place search on the device

The map files already contain the names of places, stations and points of interest, with their positions. After a region is downloaded, the application builds a place-name index from them and searches it on the device; no search request leaves the device. Stops can also be set from photo GPS, by a pin, or by pasting coordinates or a map link.

Measured on 2026-10-29 with a throwaway prototype in Node.js, on Overture release `2026-10-21.0`, for Taiwan, Taipei and Kyoto.

### 5.1 Index design

- **Sources:**
  - `divisions` (zoom 12): countries, regions, towns and neighborhoods;
  - `base` (zoom 13): OpenStreetMap stations, airports, parks, religious sites, lakes and rivers;
  - `places` (zoom 14): points of interest.
- **Filtering:** `places` below confidence 0.6 and categories that are not trip stops (services, offices, shops, parking) are left out.
- **Normalization:** Unicode NFKC, lower case, no spaces or punctuation, and folding of variant characters, so that Traditional, Simplified and Japanese forms match (臺/台, 稻/稲, 條/条). The prototype used a hand-made sample; the product derives the full table from the Unicode Unihan variant data (Unicode-3.0, on the allowlist).
- **Lookup:** an inverted index of two-character sequences, so that any part of a name matches (清水 finds 音羽山清水寺), then a check that the whole query appears in the name.
- **Ranking:**
  - an exact match beats a prefix match, which beats a match elsewhere in the name;
  - OpenStreetMap-derived `base` and `divisions` rank above `places`;
  - regions and towns rank above neighborhoods;
  - higher confidence ranks higher;
  - entries with the same name within about 1 km are merged into one result.

### 5.2 Results

| Region | Names kept | Index (compressed) | Build | Query (median / max) |
|---|---|---|---|---|
| Taiwan (`divisions` and `places` only) | 392,261 of 988,764 | 21 MB | 2.4 s | 0.5 ms / 62 ms |
| Taipei, with `base` | 81,575 of 257,092 | 4.5 MB | 0.6 s | under 2 ms |
| Kyoto, with `base` | 41,480 of 102,727 | 2.5 MB | 0.4 s | under 3 ms |

Queries whose first result was the right place:

- **Taipei:** 台北車站 and 臺北車站, 台北101, 西門町, 國父紀念館, 中正紀念堂, 大安森林公園, 象山.
- **Kyoto:** 清水寺, 伏見稻荷 (Traditional characters finding the Japanese 伏見稲荷), 伏見稲荷大社, 金閣寺, 銀閣寺, 嵐山, 祇園, 錦市場, 二條城 (finding 京都二條城).
- **Taiwan:** 九份, 太魯閣, 墾丁, 淡水, 阿里山, 台南, 安平古堡.

Findings:

- **`places` alone is not reliable for well-known places.** Several of its entries are placed at the wrong position. For example, the top `places` results for 台北車站 lay in Taichung and Banqiao, and the real station only came first once the OpenStreetMap `base` features were added. `base` at zoom 13 is therefore part of the index; the renderer needs zoom 13 at stops anyway (`STOP_ZOOM`).
- **Different words across languages do not match.** 京都車站 does not find 京都駅, because 車站 and 駅 are different words rather than variant characters. A short table of equivalent suffixes (車站, 站, 駅) is needed.
- **Ranking needs tuning on a test list.** Examples: 故宮 should rank 國立故宮博物院 above shops whose names start with 故宮; 士林夜市 should rank the market above food stalls named after it.
- **Memory.** The prototype kept everything in JavaScript objects (about 600 MB for all of Taiwan). The product stores the index as compact binary arrays in OPFS, built once in a worker after a region is downloaded, and reads it on demand.

### 5.3 Effect on download size

Adding `base` at zoom 13 increases Taiwan from about 342 MB to about 440 MB (§3.1).

## 6. Performance

Measured in headless Chromium with SwiftShader, a software WebGL implementation. These numbers show where time goes, not device performance.

| Measurement | Result |
|---|---|
| Work per frame in our code (`renderAt`, `jumpTo`, overlay drawing), 95th percentile | 2.1 ms |
| Real-time playback with software rendering | 10 fps |
| Export-style stepping (wait until tiles are drawn), median / 95th percentile | 197 ms / 556 ms per frame |

Our code uses about 6 % of a 33 ms frame budget; the rest is map rasterization, which a hardware GPU handles much faster.

### 6.1 Devices

A test page played a 24-second recap of six stops in Kyoto in real time. It used Overture files for zoom 8 to 13 (23.9 MB) held on the device, at the device's screen size and at 1920 × 1080 with pixel ratio 1, as for export. Each frame ran `renderAt`, `jumpTo` and overlay drawing. All three devices ran the page in an embedded web view.

| Device | Engine | Canvas | Mean | Median / 95th percentile / slowest | Frames above 34 ms | Our code, 95th percentile |
|---|---|---|---|---|---|---|
| Windows desktop, 24 threads, 32 GB, NVIDIA GeForce RTX 5080 | Chromium 152 | 826 × 465 | 128.7 fps | 7 / 13.9 / 34.6 ms | 0 % | 0.3 ms |
| | | 1920 × 1080 | 136.5 fps | 6.9 / 7.1 / 27.8 ms | 0 % | 0.2 ms |
| Sony Xperia 1 V (Adreno 740), Android 15 | Android System WebView 156 | 924 × 520 | 118 fps | 8.3 / 8.4 / 33.2 ms | 0 % | 0.6 ms |
| | | 1920 × 1080 | 109.5 fps | 8.3 / 16.6 / 49.9 ms | 0.1 % | 0.6 ms |
| 13-inch iPad, Apple GPU | WebKit (iPadOS) | 900 × 506 | 119.9 fps | 8 / 9 / 21 ms | 0 % | 1 ms |
| | | 1920 × 1080 | 119.8 fps | 8 / 9 / 19 ms | 0 % | 0 ms |

Every device ran at its display refresh rate, so the measurement shows ample headroom rather than a limit. The 30 fps criterion is met on all three at 1080p. Low-end devices were not measured.

## Open points

- **Frame rate on low-end devices.** The devices in §6.1 are high-end; a mid-range phone should be added.
- **Map download source**: Overture verified technically (§3.1); its terms for use in exported video remain to be confirmed against Overture's published license pages.
- **Place-name index**: measured (§5.2); remaining work is the variant-character table, equivalent suffixes such as 車站 and 駅, and ranking tuned on a fixed test list.
- **Latin glyph generation** with a license-compliant tool.
- **Route shape**: legs are straight lines in Web Mercator. Great-circle arcs would look more natural for long flights; this is a design choice for M2.

## Sources

- [Protomaps basemap downloads](https://docs.protomaps.com/basemaps/downloads) and [building a custom basemap](https://docs.protomaps.com/basemaps/build)
- [Planetiler](https://github.com/onthegomap/planetiler) and its [planet build notes](https://github.com/onthegomap/planetiler/blob/main/PLANET.md)
- [Overture PMTiles](https://docs.overturemaps.org/examples/overture-tiles/), [accessing the Overture catalog](https://docs.overturemaps.org/getting-data/cloud-sources/) and [the places theme](https://docs.overturemaps.org/guides/places/)
