# 0013. A Downloadable World Overview Under the Regions

English | [繁體中文](../zh-TW/adr/0013-world-overview.md)

| | |
|---|---|
| Status | Accepted |
| Date | 2026-11-15 |

## Context

A recap map shows only the regions the user downloaded ([ADR 0006](0006-local-only-operation.md)). When the camera zooms out to fly between regions, for example from Taoyuan Airport in Taiwan to Fukuoka in Kyūshū, most of the view lies outside every region and is drawn as plain background: the frame looks broken. A larger tile cache does not help, since the missing areas have no tiles at all.

Ways weighed to fill those areas:

- **A world map bundled with the application.** Natural Earth's public-domain dedication is not on the asset allowlist ([ADR 0002](0002-public-domain-and-data-licenses.md)), and a bundled map would add tens of megabytes to every install.
- **A downloadable world overview from Overture Maps**, the same source and license as the regions.
- **Downloading larger regions.** A single flight can cross several countries; the user would have to download each in full.

Sizes of the Overture themes for the whole world, by highest zoom level: z0–3 about 61 MB (base 51 MB, divisions 10 MB, no transportation), z0–4 about 335 MB, z0–5 about 873 MB.

## Decision

1. **"World overview" in Maps.** The Maps dialog offers a **World overview** above the regions: zoom levels 0 to 3 of the Overture themes for the whole world, about 61 MB. It is downloaded, paused, resumed, updated and deleted like a region, but has no star and is not counted as a region that covers stops.
2. **Drawn under the regions.** When it is ready, every map of a recap draws it as its own sources, enlarged beyond zoom level 3: land in the land color, water, and country boundaries. The regions' own map is drawn above it; inside each region's bounds a fill in the land color hides the overview's coarser coastlines.
3. **Alone when no region is downloaded.** Without any region, the overview is drawn as the map itself.
4. **A larger tile cache.** The map keeps loaded tiles at every zoom level (16 levels, up to 1024 tiles) so that a recap played once plays again without waiting for them.

## Alternatives Considered

- **A bundled world map.** Rejected: its data license is not on the allowlist, and it would enlarge every install.
- **More zoom levels.** Not chosen: z0–4 is more than five times larger, while a flight between regions spends little time close to the ground outside them.
- **Preloading tiles along the camera path.** Tried and dropped: the blank areas are areas without tiles, not tiles still loading.

## Consequences

- Flights between regions show land, sea and borders instead of a blank background, after a download of about 61 MB.
- Outside the regions the overview is coarse: coastlines are simplified and there are no roads or place names.
- The overview is downloaded from the same Overture Maps host as the regions; the [Privacy Statement](../privacy.md) covers it.
