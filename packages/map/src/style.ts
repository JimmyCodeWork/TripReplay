import type { MapColors } from "@tripreplay/renderer";
import type { StyleSpecification } from "maplibre-gl";

/** The Overture themes a region consists of (docs/release-1.0.md §5). */
export const MAP_THEMES = ["base", "transportation", "divisions"] as const;
export type MapTheme = (typeof MAP_THEMES)[number];

/** Label in Traditional Chinese, then Chinese, then the local name (docs/release-1.0.md §5). */
const NAME = ["coalesce", ["get", "name:zh-Hant"], ["get", "name:zh"], ["get", "@name"]];

const BOUNDARY = "#9c8f7a";
const LABEL = "#4a4033";

export interface StyleOptions {
  /** Source URL of each theme, for example `tripreplay://<key>`. */
  readonly sources: Readonly<Record<MapTheme, string>>;
  readonly colors: MapColors;
  /**
   * Glyph URL template for Latin labels. Chinese and Japanese labels are drawn with local fonts and
   * need no glyphs; without a template, labels are left out.
   */
  readonly glyphs?: string;
  /**
   * Source URLs of the world overview (docs/adr/0013-world-overview.md), whose few zoom levels are
   * enlarged under the regions so that no view is left empty.
   */
  readonly overview?: Readonly<Record<MapTheme, string>>;
}

/** Ids of the world overview's sources. */
export const OVERVIEW_SOURCES = ["overview-base", "overview-divisions"] as const;

/** Ids of the layers that draw the world overview and cover it with the regions' land. */
export const OVERVIEW_LAYERS = {
  water: "overview-water",
  boundary: "overview-boundary",
  cover: "region-land",
} as const;

/**
 * The world overview's water and boundaries, and the regions' land above them, which hides the
 * overview's coarser coastlines wherever a region's tiles are drawn; where they are not, for example
 * while they load, the overview shows instead.
 */
function overviewLayers(colors: MapColors): StyleSpecification["layers"] {
  return [
    {
      id: OVERVIEW_LAYERS.water,
      type: "fill",
      source: "overview-base",
      "source-layer": "water",
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": colors.water },
    },
    {
      id: OVERVIEW_LAYERS.boundary,
      type: "line",
      source: "overview-divisions",
      "source-layer": "division_boundary",
      paint: { "line-color": BOUNDARY, "line-width": 1, "line-dasharray": [3, 2] },
    },
    {
      id: OVERVIEW_LAYERS.cover,
      type: "fill",
      source: "base",
      "source-layer": "land",
      filter: ["==", ["get", "subtype"], "land"],
      paint: { "fill-color": colors.land },
    },
  ];
}

/** The base map drawn under every recap: land, water, parks, roads, boundaries and place labels. */
export function baseMapStyle({ sources, colors, glyphs, overview }: StyleOptions): StyleSpecification {
  const style: StyleSpecification = {
    version: 8,
    sources: {
      ...Object.fromEntries(MAP_THEMES.map((theme) => [theme, { type: "vector", url: sources[theme] }])),
      ...(overview
        ? {
            "overview-base": { type: "vector", url: overview.base },
            "overview-divisions": { type: "vector", url: overview.divisions },
          }
        : {}),
    },
    layers: [
      { id: "land", type: "background", paint: { "background-color": colors.land } },
      ...(overview ? overviewLayers(colors) : []),
      {
        id: "park",
        type: "fill",
        source: "base",
        "source-layer": "land_use",
        paint: { "fill-color": colors.park, "fill-opacity": 0.6 },
      },
      {
        id: "water",
        type: "fill",
        source: "base",
        "source-layer": "water",
        filter: ["==", ["geometry-type"], "Polygon"],
        paint: { "fill-color": colors.water },
      },
      {
        id: "river",
        type: "line",
        source: "base",
        "source-layer": "water",
        filter: ["==", ["geometry-type"], "LineString"],
        paint: { "line-color": colors.water, "line-width": 1.5 },
      },
      {
        id: "road",
        type: "line",
        source: "transportation",
        "source-layer": "segment",
        paint: {
          "line-color": colors.roadMajor,
          "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.5, 15, 3],
        },
      },
      {
        id: "boundary",
        type: "line",
        source: "divisions",
        "source-layer": "division_boundary",
        paint: { "line-color": BOUNDARY, "line-width": 1, "line-dasharray": [3, 2] },
      },
    ],
  };
  if (!glyphs) return style;
  return {
    ...style,
    glyphs,
    layers: [
      ...style.layers,
      {
        id: "place",
        type: "symbol",
        source: "divisions",
        "source-layer": "division",
        layout: { "text-field": NAME as never, "text-font": ["Noto Sans Regular"], "text-size": 14 },
        paint: { "text-color": LABEL, "text-halo-color": colors.land, "text-halo-width": 1.5 },
      },
    ],
  };
}
