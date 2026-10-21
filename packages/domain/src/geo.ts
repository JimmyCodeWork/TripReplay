/** A WGS 84 coordinate. Longitude always comes first. */
export interface LonLat {
  readonly lon: number;
  readonly lat: number;
}

export function isValidLonLat(point: LonLat): boolean {
  return (
    Number.isFinite(point.lon) &&
    Number.isFinite(point.lat) &&
    point.lon >= -180 &&
    point.lon <= 180 &&
    point.lat >= -90 &&
    point.lat <= 90
  );
}
