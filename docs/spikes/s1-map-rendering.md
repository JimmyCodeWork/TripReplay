# Spike S1 — Map Rendering and Data

English | [繁體中文](../zh-TW/spikes/s1-map-rendering.md)

| | |
|---|---|
| Date | 2026-10-24 |
| Status | Partly complete. Renderer, tile format, labels and hosting answered; frame rate on reference devices and the production tile build remain (see [Open points](#open-points)). |
| Roadmap | [M1, S1](../roadmap.md#m1--technical-validation-phase-a) |

## Questions

1. Which renderer is admissible under the license policy, and can `renderAt` drive it?
2. How are OpenStreetMap tiles generated, hosted without request logging, and read by range for later offline packages?
3. Are Traditional Chinese labels rendered correctly?
4. Which place-search provider permits the intended use?

## Result

| Question | Answer |
|---|---|
| Renderer | **MapLibre GL JS** (BSD-3-Clause). Its runtime dependencies are MIT, ISC, BSD-2-Clause, BSD-3-Clause and MIT OR Apache-2.0, all on the allowlist. `renderAt` drives it frame by frame with `jumpTo`; its own animations are not used. |
| Tiles | **PMTiles** (BSD-3-Clause reader) read with HTTP range requests from a single static file. The same range access serves offline packages later. |
| Labels | Traditional Chinese labels render correctly through MapLibre's local ideograph rendering, without glyph files for CJK characters. |
| Place search | Search on submit only, not as-you-type; the provider is decided at the architecture gate (§6). |

The prototype was a throwaway page driven by Playwright; as planned for spikes, it is not merged.

## 1. Rendering setup

- **Base map:** MapLibre draws the base map on its own canvas.
- **Overlays:** the route, stop markers, titles and attribution are drawn on a separate 2D canvas from the `FrameDescription`. Positions come from `map.project`. This keeps the `MapLayer` port narrow: the map engine only draws the base map for a camera.
- **Zoom:** camera zoom from the timeline is adjusted by `log2(actual width / reference width)`; the 512-pixel tiles match the timeline's `WORLD_SIZE`.
- **Longitudes:** MapLibre accepts the timeline's continuous longitudes (for example 188° after crossing the International Date Line, or 362° for Paris reached eastward). Camera, route and markers therefore stay in one coordinate frame, without wrapping logic in the renderer.
- **Export mode:** each frame waits for the map's `idle` event (tiles loaded and drawn) before it is captured. This is the basis for the fixed-step export in M5.

## 2. Findings that changed the code

- **Overview framing.** The timeline framed the smallest arc of longitude containing every stop. A route from Apia to Paris goes east over the Americas, so the closing overview cut off the last leg. The overview now frames the extent of the unwrapped route; tests cover this case and a route around the world.

## 3. Tiles

The data hosts and tile tools (Geofabrik, Planetiler releases, Protomaps builds) were not reachable from the spike environment. The prototype therefore built a PMTiles v3 file from Natural Earth data (public domain) with a small throwaway writer: 11,383 tiles, zoom 0–7, 4 MB. The official PMTiles reader and MapLibre read it through range requests.

For production:

- **Basemap:** use the Protomaps basemap, which is built with Planetiler from OpenStreetMap. Either download a published planet build (about 120 GB for zoom 0–15) or build it with Planetiler; the Protomaps documentation recommends 64 GB of RAM and 1 TB of NVMe storage for a planet build in under three hours.
- **Date Line:** polygons crossing the International Date Line must be split by the tile pipeline. The prototype's own builder did not do this, which caused horizontal streaks; Planetiler handles it.
- **Labels:** confirm that the chosen basemap carries Traditional Chinese names (for example `name:zh-Hant`) and how it falls back to `name:zh` and the local name.
- **Attribution:** "© OpenStreetMap contributors" is shown on the map and in every recap; the data stays under the ODbL and is never bundled with the application.

## 4. Labels and fonts

- MapLibre renders CJK ideographs with a local font (`localIdeographFontFamily`), so Traditional Chinese labels need no glyph files. The bundled Noto Sans TC (OFL-1.1) is used for this and for the overlay text, so that labels look the same on every platform.
- Latin labels still need glyph files (signed distance field PBFs) generated from a permissively licensed font such as Noto Sans. The generator must pass the dependency license policy; it is a build tool and is not shipped.
- Base-map place labels can collide with stop markers. The style should hide or offset labels near the current stop.

## 5. Hosting

| Item | Estimate |
|---|---|
| Storage | Planet file about 120 GB. Cloudflare R2 standard storage is $0.015 per GB-month with 10 GB free: about **$1.65 per month** |
| Requests | Each tile is one range read (Class B operation): 10 million per month free, then $0.36 per million |
| Egress | Free on R2 |
| Logging | R2 data access logs are opt-in per bucket and stay off. Cloudflare-level request logging for the custom domain must also stay off; to be confirmed in the account settings before launch |

Prices are from third-party summaries of Cloudflare's pricing and must be checked against the official page. Any static host with HTTP range support works the same way.

## 6. Place search

| Option | Terms | Fit |
|---|---|---|
| Public Nominatim (OSMF) | At most 1 request per second for the whole application, no autocomplete, identifying User-Agent or Referer, attribution | Search on submit only; the shared limit is a risk for a public application |
| Self-hosted Photon | Software Apache-2.0; OpenStreetMap data under the ODbL | Allows autocomplete; needs a server and a data update process |
| Self-hosted Nominatim | Software GPL-2.0, run as a separate service and not distributed with the application | Same as Photon in effect; whether a server-side copyleft service is acceptable is a license policy question |

Recommendation for 1.0: search on submit, with the provider behind a port so that it can change. Decide at the architecture gate between public Nominatim (no cost, strict limits) and a self-hosted Photon (cost, autocomplete).

## 7. Performance

Measured in headless Chromium with SwiftShader, a software WebGL implementation. These numbers show where time goes, not device performance.

| Measurement | Result |
|---|---|
| Work per frame in our code (`renderAt`, `jumpTo`, overlay drawing), 95th percentile | 2.1 ms |
| Real-time playback with software rendering | 10 fps |
| Export-style stepping (wait until tiles are drawn), median / 95th percentile | 197 ms / 556 ms per frame |

Our code uses about 6 % of a 33 ms frame budget; the rest is map rasterization, which a hardware GPU handles much faster. The 30 fps criterion can only be confirmed on the reference devices.

## Open points

- **Frame rate on reference devices** with hardware graphics, desktop and mobile, at 1080p, with a real OpenStreetMap basemap.
- **Production tile build**: Protomaps download or own Planetiler build, label languages, update cadence.
- **Latin glyph generation** with a license-compliant tool.
- **Place-search provider** (§6).
- **Route shape**: legs are straight lines in Web Mercator. Great-circle arcs would look more natural for long flights; this is a design choice for M2.

## Sources

- [Protomaps basemap downloads](https://docs.protomaps.com/basemaps/downloads) and [building a custom basemap](https://docs.protomaps.com/basemaps/build)
- [Planetiler](https://github.com/onthegomap/planetiler) and its [planet build notes](https://github.com/onthegomap/planetiler/blob/main/PLANET.md)
- [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/)
- [R2 data access logs](https://developers.cloudflare.com/r2/buckets/data-access-logs/) and a [2026 R2 pricing summary](https://www.bucketmate.app/blogs/cloudflare-r2-pricing-2026)
