# 0015. The World Overview Alone When Zoomed Out

English | [繁體中文](../zh-TW/adr/0015-overview-alone-when-zoomed-out.md)

| | |
|---|---|
| Status | Accepted. Amends decision 2 of [ADR 0013](0013-world-overview.md): the regions are drawn over the overview only from zoom level 7 on |
| Date | 2026-11-15 |

## Context

After the map was loaded before playing ([ADR 0014](0014-load-map-before-playing.md)), the preview still showed broken frames on the move from Taoyuan Airport to Fukuoka Airport, with the whole path loaded. A recording of the playback showed that they did not come from tiles still loading:

- A region holds every tile that touches its bounds, at every zoom level. Zoomed out, such a tile is far larger than the region: Taiwan's tile at zoom level 5 covers much of eastern China.
- That tile draws the detailed map up to its edge, and the world overview's coarse map continues beyond it. At the edge, the two maps' coastlines and colors do not match, which showed as straight seams, rectangles of land color over the sea and areas of detail that stop abruptly.

## Decision

With the world overview, the regions' layers are drawn only from zoom level 7 on (`REGION_MIN_ZOOM`). Below it, the overview alone is drawn. At zoom level 7 a tile is about 2.8° wide, close to the size of a region. Without the overview, the regions are drawn at every zoom level, as before.

## Alternatives Considered

- **Clipping the regions' map to their bounds.** MapLibre cannot clip layers by an area, and filters by area apply only to points and lines.
- **A more detailed overview.** Seams would remain where the regions' tiles end, only smaller, and the download would grow several times ([ADR 0013](0013-world-overview.md)).

## Consequences

- Zoomed out, the map is coarse but consistent: land, sea and borders without seams.
- Below zoom level 7, the regions' tiles are not loaded. Loading the whole path before playing took about 19 seconds instead of 30 on the test trip, with about half the added memory.
