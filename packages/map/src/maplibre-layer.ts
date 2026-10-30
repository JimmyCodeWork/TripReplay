import type { LonLat, MapColors, MapLayer, MapView } from "@tripreplay/renderer";
import * as maplibregl from "maplibre-gl";
import { PMTiles } from "pmtiles";
import { blobSource } from "./blob-source.ts";
import { baseMapStyle, MAP_THEMES, type MapTheme } from "./style.ts";

/** The downloaded files of one region, one PMTiles archive per theme. */
export type MapFiles = Readonly<Record<MapTheme, Blob>>;

export interface MapLibreLayerOptions {
  readonly container: HTMLElement;
  /** The files of each region to draw, such as every region a trip passes through. */
  readonly files: MapFiles | readonly MapFiles[];
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

const PROTOCOL = "tripreplay";

/** The archives of one theme of a layer, one per region, by source key. */
const sources = new Map<string, readonly PMTiles[]>();
let registered = false;
let nextLayer = 0;

/**
 * Registers the protocol that serves a theme from the archives of several regions: each tile
 * comes from the first region that has it, so that a trip through Taiwan and Kyūshū draws both.
 * MapLibre registers URL protocols globally; one protocol serves the sources of every layer.
 */
function registerProtocol(): void {
  if (registered) return;
  registered = true;
  maplibregl.addProtocol(PROTOCOL, async (params, abort) => {
    const match = /^tripreplay:\/\/([^/]+)(?:\/(\d+)\/(\d+)\/(\d+))?$/.exec(params.url);
    const archives = match && sources.get(match[1] as string);
    if (!match || !archives) throw new Error(`Unknown map source ${params.url}`);
    if (match[2] === undefined) {
      const headers = await Promise.all(archives.map((archive) => archive.getHeader()));
      return {
        data: {
          tiles: [`${PROTOCOL}://${match[1]}/{z}/{x}/{y}`],
          minzoom: Math.min(...headers.map((h) => h.minZoom)),
          maxzoom: Math.max(...headers.map((h) => h.maxZoom)),
        },
      };
    }
    const [z, x, y] = [Number(match[2]), Number(match[3]), Number(match[4])];
    for (const archive of archives) {
      const tile = await archive.getZxy(z, x, y, abort.signal);
      if (tile) return { data: new Uint8Array(tile.data) };
    }
    return { data: new Uint8Array() };
  });
}

/**
 * Creates a MapLayer drawn by MapLibre GL JS from map files on the device. Resolves once the style
 * is loaded; tiles load as views need them.
 */
export async function createMapLibreLayer(options: MapLibreLayerOptions): Promise<MapLibreLayer> {
  registerProtocol();
  const regions: readonly MapFiles[] = Array.isArray(options.files) ? options.files : [options.files as MapFiles];
  const layer = nextLayer++;
  const keys = MAP_THEMES.map((theme) => {
    const key = `layer${layer}-${theme}`;
    sources.set(
      key,
      regions.map((files, i) => new PMTiles(blobSource(`${key}-${i}`, files[theme]))),
    );
    return key;
  });
  const styleSources = Object.fromEntries(MAP_THEMES.map((theme, i) => [theme, `${PROTOCOL}://${keys[i]}`])) as Record<
    MapTheme,
    string
  >;
  const map = new maplibregl.Map({
    container: options.container,
    style: baseMapStyle({
      sources: styleSources,
      colors: options.colors,
      ...(options.glyphs ? { glyphs: options.glyphs } : {}),
    }),
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
    for (const key of keys) sources.delete(key);
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
