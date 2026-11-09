import type { RegionBounds } from "./ports.ts";

/** A region offered in the maps dialog; its name is the message `region.<id>`. */
export interface CatalogRegion {
  readonly id: string;
  /** The country or area it belongs to, whose name is the message `country.<id>`. */
  readonly country: string;
  readonly bounds: RegionBounds;
}

/** A country or area of the catalog; popular ones are listed first and shown by default. */
export interface CatalogCountry {
  readonly id: string;
  readonly popular: boolean;
}

export const CATALOG_COUNTRIES: readonly CatalogCountry[] = [
  { id: "taiwan", popular: true },
  { id: "japan", popular: true },
  { id: "southKorea", popular: true },
  { id: "hongKongMacau", popular: true },
  { id: "singapore", popular: true },
  { id: "thailand", popular: true },
  { id: "vietnam", popular: true },
  { id: "malaysia", popular: true },
  { id: "philippines", popular: false },
  { id: "indonesia", popular: false },
  { id: "cambodia", popular: false },
  { id: "china", popular: false },
  { id: "unitedKingdom", popular: false },
  { id: "ireland", popular: false },
  { id: "france", popular: false },
  { id: "germany", popular: false },
  { id: "italy", popular: false },
  { id: "spain", popular: false },
  { id: "portugal", popular: false },
  { id: "switzerland", popular: false },
  { id: "austria", popular: false },
  { id: "netherlands", popular: false },
  { id: "belgium", popular: false },
  { id: "czechia", popular: false },
  { id: "greece", popular: false },
  { id: "unitedStates", popular: false },
  { id: "canada", popular: false },
  { id: "australia", popular: false },
  { id: "newZealand", popular: false },
];

/**
 * Regions offered for download, as generous bounding boxes in degrees (west, south, east, north).
 * The boxes are drawn by hand to cover the land of each region; tiles of open sea are small and
 * shared, so a box larger than the land costs little. Large countries are divided so that each
 * download stays a few hundred megabytes. The download size is determined when a region is chosen.
 * Region ids are stored with downloaded maps and must not change.
 */
export const REGION_CATALOG: readonly CatalogRegion[] = [
  { id: "taiwan", country: "taiwan", bounds: [119.3, 21.8, 122.1, 25.4] },
  { id: "japanHokkaido", country: "japan", bounds: [139.3, 41.3, 145.9, 45.6] },
  { id: "japanTohoku", country: "japan", bounds: [139.0, 36.8, 142.1, 41.6] },
  { id: "japanKanto", country: "japan", bounds: [138.4, 34.8, 140.9, 37.2] },
  { id: "japanChubu", country: "japan", bounds: [135.4, 34.5, 139.9, 38.6] },
  { id: "japanKansai", country: "japan", bounds: [134.2, 33.4, 136.9, 35.8] },
  { id: "japanChugoku", country: "japan", bounds: [130.8, 33.7, 134.5, 35.7] },
  { id: "japanShikoku", country: "japan", bounds: [132.0, 32.7, 134.8, 34.6] },
  { id: "japanKyushu", country: "japan", bounds: [128.6, 30.9, 132.1, 34.8] },
  { id: "japanOkinawa", country: "japan", bounds: [122.9, 24.0, 131.4, 27.9] },
  { id: "southKorea", country: "southKorea", bounds: [124.6, 33.0, 131.0, 38.7] },
  { id: "hongKongMacau", country: "hongKongMacau", bounds: [113.5, 22.1, 114.5, 22.6] },
  { id: "singapore", country: "singapore", bounds: [103.6, 1.15, 104.1, 1.48] },
  { id: "thailandCentral", country: "thailand", bounds: [98.9, 12.2, 102.0, 15.5] },
  { id: "thailandNorth", country: "thailand", bounds: [97.3, 15.5, 101.5, 20.5] },
  { id: "thailandNortheast", country: "thailand", bounds: [101.5, 14.1, 105.7, 18.5] },
  { id: "thailandSouth", country: "thailand", bounds: [97.9, 5.6, 102.2, 12.2] },
  { id: "vietnamNorth", country: "vietnam", bounds: [102.1, 19.5, 108.1, 23.4] },
  { id: "vietnamCentral", country: "vietnam", bounds: [104.5, 13.8, 109.5, 19.5] },
  { id: "vietnamSouth", country: "vietnam", bounds: [104.4, 8.4, 109.5, 13.8] },
  { id: "malaysiaPeninsular", country: "malaysia", bounds: [99.6, 1.2, 104.6, 6.8] },
  { id: "malaysiaBorneo", country: "malaysia", bounds: [109.5, 0.8, 119.3, 7.4] },
  { id: "philippinesLuzon", country: "philippines", bounds: [119.5, 12.4, 124.5, 19.0] },
  { id: "philippinesVisayas", country: "philippines", bounds: [121.5, 9.0, 126.2, 12.4] },
  { id: "philippinesPalawan", country: "philippines", bounds: [117.0, 8.3, 121.0, 12.4] },
  { id: "indonesiaBali", country: "indonesia", bounds: [114.4, -9.0, 116.8, -8.0] },
  { id: "indonesiaJavaWest", country: "indonesia", bounds: [105.0, -7.9, 109.0, -5.8] },
  { id: "indonesiaJavaEast", country: "indonesia", bounds: [109.0, -8.9, 114.6, -6.3] },
  { id: "cambodia", country: "cambodia", bounds: [102.3, 10.4, 107.7, 14.7] },
  { id: "chinaNorth", country: "china", bounds: [113.5, 37.5, 119.8, 42.0] },
  { id: "chinaEast", country: "china", bounds: [116.3, 27.0, 122.5, 33.0] },
  { id: "chinaSouth", country: "china", bounds: [108.5, 21.5, 118.5, 26.0] },
  { id: "chinaSichuan", country: "china", bounds: [102.0, 28.0, 110.2, 32.8] },
  { id: "chinaYunnan", country: "china", bounds: [97.5, 21.1, 106.2, 28.5] },
  { id: "chinaShaanxi", country: "china", bounds: [105.5, 31.7, 111.3, 39.6] },
  { id: "chinaHainan", country: "china", bounds: [108.6, 18.1, 111.1, 20.2] },
  { id: "unitedKingdomSouth", country: "unitedKingdom", bounds: [-6.4, 49.9, 1.8, 52.4] },
  { id: "unitedKingdomNorth", country: "unitedKingdom", bounds: [-8.2, 52.4, 1.8, 59.0] },
  { id: "ireland", country: "ireland", bounds: [-10.7, 51.4, -5.4, 55.4] },
  { id: "franceNorth", country: "france", bounds: [-5.2, 46.0, 8.3, 51.1] },
  { id: "franceSouth", country: "france", bounds: [-1.8, 42.3, 7.7, 46.0] },
  { id: "germanyNorth", country: "germany", bounds: [5.8, 50.5, 15.1, 55.1] },
  { id: "germanySouth", country: "germany", bounds: [5.8, 47.2, 15.1, 50.5] },
  { id: "italyNorth", country: "italy", bounds: [6.6, 43.7, 13.9, 47.1] },
  { id: "italySouth", country: "italy", bounds: [8.1, 36.6, 18.6, 43.7] },
  { id: "spainNorth", country: "spain", bounds: [-9.4, 40.0, 4.4, 43.8] },
  { id: "spainSouth", country: "spain", bounds: [-7.6, 35.9, 0.5, 40.0] },
  { id: "portugal", country: "portugal", bounds: [-9.6, 36.9, -6.1, 42.2] },
  { id: "switzerland", country: "switzerland", bounds: [5.9, 45.8, 10.5, 47.9] },
  { id: "austria", country: "austria", bounds: [9.5, 46.3, 17.2, 49.1] },
  { id: "netherlands", country: "netherlands", bounds: [3.3, 50.7, 7.3, 53.6] },
  { id: "belgium", country: "belgium", bounds: [2.5, 49.4, 6.4, 51.6] },
  { id: "czechia", country: "czechia", bounds: [12.0, 48.5, 18.9, 51.1] },
  { id: "greece", country: "greece", bounds: [19.3, 34.8, 28.3, 41.8] },
  { id: "usCaliforniaSouth", country: "unitedStates", bounds: [-121.0, 32.5, -114.1, 35.8] },
  { id: "usCaliforniaNorth", country: "unitedStates", bounds: [-124.5, 35.8, -117.0, 42.0] },
  { id: "usSouthwest", country: "unitedStates", bounds: [-117.0, 31.3, -109.0, 37.5] },
  { id: "usNorthwest", country: "unitedStates", bounds: [-124.8, 45.5, -116.9, 49.0] },
  { id: "usNortheast", country: "unitedStates", bounds: [-77.6, 38.7, -70.0, 42.9] },
  { id: "usFlorida", country: "unitedStates", bounds: [-87.7, 24.4, -79.9, 31.0] },
  { id: "usHawaii", country: "unitedStates", bounds: [-160.3, 18.9, -154.8, 22.3] },
  { id: "canadaWest", country: "canada", bounds: [-128.0, 48.2, -114.0, 52.5] },
  { id: "canadaEast", country: "canada", bounds: [-81.0, 42.0, -70.5, 47.5] },
  { id: "australiaNewSouthWales", country: "australia", bounds: [148.5, -37.6, 153.7, -28.1] },
  { id: "australiaVictoria", country: "australia", bounds: [140.9, -39.2, 150.0, -36.0] },
  { id: "australiaQueensland", country: "australia", bounds: [145.0, -28.3, 153.6, -16.0] },
  { id: "australiaPerth", country: "australia", bounds: [114.9, -35.2, 117.0, -31.0] },
  { id: "newZealandNorth", country: "newZealand", bounds: [172.6, -41.7, 178.6, -34.4] },
  { id: "newZealandSouth", country: "newZealand", bounds: [166.4, -47.3, 174.4, -40.4] },
];

/** The catalog regions whose box contains a position, for "Current location". */
export function regionsAt(position: { readonly lon: number; readonly lat: number }): CatalogRegion[] {
  return REGION_CATALOG.filter(
    ({ bounds: [west, south, east, north] }) =>
      position.lon >= west && position.lon <= east && position.lat >= south && position.lat <= north,
  );
}
