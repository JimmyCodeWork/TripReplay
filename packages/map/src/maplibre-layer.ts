import type { LonLat, MapColors, MapLayer, MapView } from "@tripreplay/renderer";
import * as maplibregl from "maplibre-gl";
import { PMTiles, Protocol } from "pmtiles";
import { blobSource } from "./blob-source.ts";
import { baseMapStyle, MAP_THEMES, type MapTheme } from "./style.ts";

/** The downloaded files of one region, one PMTiles archive per theme. */
export type MapFiles = Readonly<Record<MapTheme, Blob>>;

export interface MapLibreLayerOptions {
  readonly container: HTMLElement;
  readonly files: MapFiles;
  readonly colors: MapColors;
  /** See StyleOptions.glyphs. */
  readonly glyphs?: string;
  /** Device pixels per CSS pixel; export uses 1 to draw at the exact output size. */
  readonly pixelRatio?: number;
  /** Keeps the drawn frame readable from the canvas, as export requires; costs some speed. */
  readonly readable?: boolean;
}

export interface MapLibreLayer extends MapLayer {
  readonly canvas: HTMLCanvasElement;
}

/** Fonts for Chinese and Japanese labels, drawn locally instead of from glyph files. */
const LOCAL_FONTS = "'PingFang TC', 'Noto Sans TC', 'Microsoft JhengHei', 'Hiragino Sans', sans-serif";

// MapLibre registers URL protocols globally; one protocol serves the archives of every layer.
let protocol: Protocol | undefined;
let nextLayer = 0;

function pmtilesProtocol(): Protocol {
  if (!protocol) {
    protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
  }
  return protocol;
}

/**
 * Creates a MapLayer drawn by MapLibre GL JS from map files on the device. Resolves once the style
 * is loaded; tiles load as views need them.
 */
export async function createMapLibreLayer(options: MapLibreLayerOptions): Promise<MapLibreLayer> {
  const tiles = pmtilesProtocol();
  const prefix = `tripreplay-${nextLayer++}`;
  const keys = MAP_THEMES.map((theme) => {
    const key = `${prefix}-${theme}`;
    tiles.add(new PMTiles(blobSource(key, options.files[theme])));
    return key;
  });
  const sources = Object.fromEntries(MAP_THEMES.map((theme, i) => [theme, `pmtiles://${keys[i]}`])) as Record<
    MapTheme,
    string
  >;
  const map = new maplibregl.Map({
    container: options.container,
    style: baseMapStyle({ sources, colors: options.colors, ...(options.glyphs ? { glyphs: options.glyphs } : {}) }),
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    localIdeographFontFamily: LOCAL_FONTS,
    canvasContextAttributes: { preserveDrawingBuffer: options.readable ?? false },
    ...(options.pixelRatio ? { pixelRatio: options.pixelRatio } : {}),
    center: [0, 0],
    zoom: 0,
  });
  const release = () => {
    for (const key of keys) tiles.tiles.delete(key);
  };

  try {
    await new Promise<void>((resolve, reject) => {
      map.once("load", () => resolve());
      map.once("error", (event) => reject(event.error));
    });
  } catch (error) {
    map.remove();
    release();
    throw error;
  }

  return {
    canvas: map.getCanvas(),
    resize(width, height) {
      options.container.style.width = `${width}px`;
      options.container.style.height = `${height}px`;
      map.resize();
    },
    setColors(colors) {
      map.setPaintProperty("land", "background-color", colors.land);
      map.setPaintProperty("park", "fill-color", colors.park);
      map.setPaintProperty("water", "fill-color", colors.water);
      map.setPaintProperty("river", "line-color", colors.water);
      map.setPaintProperty("road", "line-color", colors.roadMajor);
      if (map.getLayer("place")) map.setPaintProperty("place", "text-halo-color", colors.land);
    },
    setView(view: MapView) {
      map.jumpTo({ center: [view.center.lon, view.center.lat], zoom: view.zoom, bearing: view.bearing });
    },
    project(point: LonLat) {
      const { x, y } = map.project([point.lon, point.lat]);
      return { x, y };
    },
    whenDrawn() {
      return new Promise<void>((resolve) => {
        map.once("idle", () => resolve());
        map.triggerRepaint();
      });
    },
    destroy() {
      map.remove();
      release();
    },
  };
}

/**
 * Where the map engine loads its worker from. The shell sets it to the worker file its bundler
 * emitted, since bundlers cannot follow the engine's own lookup.
 */
export function setMapWorkerUrl(url: string): void {
  maplibregl.setWorkerUrl(url);
}
