import type { LonLat } from "@tripreplay/domain";

/** Web Mercator cuts off the poles at this latitude. */
export const MAX_LATITUDE = 85.051_128_78;

/** A point in Web Mercator world units: x and y run from 0 to 1 across the world; x may leave that range. */
export interface WorldPoint {
  readonly x: number;
  readonly y: number;
}

export function toWorld(point: LonLat): WorldPoint {
  const lat = Math.min(MAX_LATITUDE, Math.max(-MAX_LATITUDE, point.lat));
  const sin = Math.sin((lat * Math.PI) / 180);
  return { x: (point.lon + 180) / 360, y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI) };
}

/** Converts back to WGS 84 without wrapping the longitude. */
export function fromWorld(point: WorldPoint): LonLat {
  const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * point.y))) * 180) / Math.PI;
  return { lon: point.x * 360 - 180, lat };
}

/** Wraps a longitude into [-180, 180). */
export function normalizeLon(lon: number): number {
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
  return wrapped === 0 ? 0 : wrapped;
}

/** Signed longitude difference from `from` to `to` along the shorter way round, in (-180, 180]. */
export function lonDelta(from: number, to: number): number {
  const delta = normalizeLon(to - from);
  return delta === -180 ? 180 : delta;
}

/**
 * Rewrites longitudes so that each leg takes the shorter way round. The result is continuous and
 * may leave [-180, 180], for example 179 → 181 for a route across the International Date Line.
 */
export function unwrapPath(points: readonly LonLat[]): LonLat[] {
  const result: LonLat[] = [];
  for (const point of points) {
    const previous = result.at(-1);
    result.push(previous ? { lon: previous.lon + lonDelta(previous.lon, point.lon), lat: point.lat } : point);
  }
  return result;
}
