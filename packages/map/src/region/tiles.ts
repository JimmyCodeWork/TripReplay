import { zxyToTileId } from "pmtiles";

/** West, south, east, north in degrees. West is greater than east for a region across the Date Line. */
export type Bounds = readonly [west: number, south: number, east: number, north: number];

const MAX_LAT = 85.0511287798066;

function column(lon: number, zoom: number): number {
  const n = 2 ** zoom;
  return Math.min(n - 1, Math.max(0, Math.floor(((lon + 180) / 360) * n)));
}

function row(lat: number, zoom: number): number {
  const n = 2 ** zoom;
  const clamped = (Math.max(-MAX_LAT, Math.min(MAX_LAT, lat)) * Math.PI) / 180;
  const y = (1 - Math.log(Math.tan(clamped) + 1 / Math.cos(clamped)) / Math.PI) / 2;
  return Math.min(n - 1, Math.max(0, Math.floor(y * n)));
}

/** Ids of all tiles that cover the bounds from `minZoom` to `maxZoom`, in ascending order. */
export function tilesInBounds(bounds: Bounds, minZoom: number, maxZoom: number): number[] {
  const [west, south, east, north] = bounds;
  const ids: number[] = [];
  for (let z = minZoom; z <= maxZoom; z++) {
    const spans: [number, number][] =
      west <= east
        ? [[column(west, z), column(east, z)]]
        : [
            [column(west, z), 2 ** z - 1],
            [0, column(east, z)],
          ];
    const top = row(north, z);
    const bottom = row(south, z);
    const seen = new Set<number>();
    for (const [first, last] of spans) {
      for (let x = first; x <= last; x++) {
        if (seen.has(x)) continue;
        seen.add(x);
        for (let y = top; y <= bottom; y++) ids.push(zxyToTileId(z, x, y));
      }
    }
  }
  return ids.sort((a, b) => a - b);
}
