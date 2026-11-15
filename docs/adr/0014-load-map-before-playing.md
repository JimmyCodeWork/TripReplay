# 0014. Load the Map Before Playing

English | [繁體中文](../zh-TW/adr/0014-load-map-before-playing.md)

| | |
|---|---|
| Status | Accepted. Amends decision 2 of [ADR 0013](0013-world-overview.md): the regions' land, not their bounds, covers the world overview |
| Date | 2026-11-15 |

## Context

With the world overview ([ADR 0013](0013-world-overview.md)), every view of a recap has a map. The preview still showed blank or half-drawn frames on long camera moves, for example when zooming out from Taoyuan Airport and flying to Fukuoka Airport:

- The preview draws each frame when it is due. MapLibre loads the tiles of a new view in the background and draws the background color where they are missing, unless it has a coarser tile of the same place in memory. A camera that zooms out quickly keeps reaching zoom levels that it has not loaded yet.
- The fill that hid the overview inside each region's bounds was drawn in the land color, also where the region's tiles were not loaded yet. Over the sea, this showed as large land-colored rectangles.

A frame looks right once its tiles are loaded, after 0.1 to 3 seconds. Video export already waits for each frame's tiles.

## Decision

1. **The regions' land covers the overview.** Instead of a fill over each region's bounds, the overview is covered by the land polygons of the regions' own `base` tiles (subtype `land`). Where a region's tiles are drawn, they hide the overview's coarser coastlines. Where they are not drawn yet, the overview shows.
2. **"Load map first" before playing.** With this option on, **Play** first moves the map through the camera's path from the current position to the end, every 0.05 s of recap time, and waits at each view until its tiles are drawn. This takes up to 5 s for a view. It then plays. The preview shows the progress, and **Cancel** stops loading.
3. **Loaded once.** The map is loaded again only when the recap, the preview surface or an earlier start position calls for it. Pausing and playing again does not.
4. **Kept in memory.** The map keeps loaded tiles at every zoom level, up to 1000 per source, so that the loaded path stays available while playing.
5. **On by default, and a choice.** The **Load map first** button under the preview turns the option off or on; the choice is kept in the browser.

## Alternatives Considered

- **Waiting for tiles while playing.** Playback would stop on a frame until its tiles are loaded, like a video buffering. This was not chosen: the maintainer preferred smooth playback after a wait.
- **Loading a few low zoom levels of each region.** This was tried. MapLibre's default cache dropped those tiles again during playback, and frames between regions still lacked tiles.
- **Smaller or more detailed overviews.** These reduce blank areas between regions but not the loading time.

## Consequences

- With the option on, playing starts after a wait. The wait grows with the length of the recap and is longer on slow devices: a 12-second recap took about 25 seconds in a test without a graphics processor.
- A long recap may need more than 1000 tiles of a source. Its earliest tiles may then be dropped and loaded again while playing.
- Keeping more tiles uses more memory.
- The option does not change exported videos, which wait for every frame.
