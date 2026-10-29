import type { RegionBounds } from "./ports.ts";

/** A region offered in the maps dialog; its name is the message `region.<id>`. */
export interface CatalogRegion {
  readonly id: string;
  readonly bounds: RegionBounds;
}

/**
 * Regions offered for download, as generous bounding boxes in degrees (west, south, east, north).
 * The boxes are drawn by hand to cover the land of each region; tiles of open sea are small and
 * shared, so a box larger than the land costs little. The download size is determined when a
 * region is chosen.
 */
export const REGION_CATALOG: readonly CatalogRegion[] = [
  { id: "taiwan", bounds: [119.3, 21.8, 122.1, 25.4] },
  { id: "japanHokkaido", bounds: [139.3, 41.3, 145.9, 45.6] },
  { id: "japanTohoku", bounds: [139.0, 36.8, 142.1, 41.6] },
  { id: "japanKanto", bounds: [138.4, 34.8, 140.9, 37.2] },
  { id: "japanChubu", bounds: [135.4, 34.5, 139.9, 38.6] },
  { id: "japanKansai", bounds: [134.2, 33.4, 136.9, 35.8] },
  { id: "japanChugoku", bounds: [130.8, 33.7, 134.5, 35.7] },
  { id: "japanShikoku", bounds: [132.0, 32.7, 134.8, 34.6] },
  { id: "japanKyushu", bounds: [128.6, 30.9, 132.1, 34.8] },
  { id: "japanOkinawa", bounds: [122.9, 24.0, 131.4, 27.9] },
  { id: "southKorea", bounds: [124.6, 33.0, 131.0, 38.7] },
  { id: "hongKongMacau", bounds: [113.5, 22.1, 114.5, 22.6] },
  { id: "singapore", bounds: [103.6, 1.15, 104.1, 1.48] },
];
