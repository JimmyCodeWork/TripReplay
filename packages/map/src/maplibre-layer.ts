import type { LonLat, MapColors, MapLayer, MapView } from "@tripreplay/renderer";
import * as maplibregl from "maplibre-gl";
import { PMTiles } from "pmtiles";
import { blobSource } from "./blob-source.ts";
import { baseMapStyle, MAP_THEMES, type MapTheme, OVERVIEW_LAYERS, OVERVIEW_SOURCES } from "./style.ts";

/**
 * The downloaded files of one region, one PMTiles archive per theme. The world overview's are
 * marked `overview` (docs/adr/0013-world-overview.md): they are drawn under the regions.
 */
export type MapFiles = Readonly<Record<MapTheme, Blob>> & { readonly overview?: boolean };

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
  const all: readonly MapFiles[] = Array.isArray(options.files) ? options.files : [options.files as MapFiles];
  const overviewFiles = all.find((files) => files.overview);
  const regionFiles = all.filter((files) => !files.overview);
  // Without a region, the overview is drawn as the map itself.
  const regions = regionFiles.length > 0 ? regionFiles : overviewFiles ? [overviewFiles] : [];
  const overview = regionFiles.length > 0 ? overviewFiles : undefined;
  const layer = nextLayer++;
  const keys: string[] = [];
  const register = (name: string, files: readonly MapFiles[]) =>
    Object.fromEntries(
      MAP_THEMES.map((theme) => {
        const key = `layer${layer}-${name}-${theme}`;
        keys.push(key);
        sources.set(
          key,
          files.map((each, i) => new PMTiles(blobSource(`${key}-${i}`, each[theme]))),
        );
        return [theme, `${PROTOCOL}://${key}`];
      }),
    ) as Record<MapTheme, string>;
  const styleSources = register("regions", regions);
  const overviewSources = overview ? register("overview", [overview]) : undefined;
  const map = new maplibregl.Map({
    container: options.container,
    style: baseMapStyle({
      sources: styleSources,
      colors: options.colors,
      ...(options.glyphs ? { glyphs: options.glyphs } : {}),
      ...(overviewSources ? { overview: overviewSources } : {}),
    }),
    interactive: false,
    attributionControl: false,
    fadeDuration: 0,
    // Loaded tiles stay in memory at every zoom level, up to a number per source, so that a recap
    // loaded before playing (docs/adr/0014-load-map-before-playing.md) plays without waiting for them.
    // MapLibre otherwise keeps about five screens' worth of each of five zoom levels.
    maxTileCacheZoomLevels: 1000,
    maxTileCacheSize: 1000,
    localIdeographFontFamily: LOCAL_FONTS,
    canvasContextAttributes: { preserveDrawingBuffer: options.readable ?? false },
    ...(options.pixelRatio ? { pixelRatio: options.pixelRatio } : {}),
    center: [0, 0],
    zoom: 0,
  });
  /** Whether only the overview is drawn (MapLibreLayer.setOverviewOnly). */
  let overviewOnly = false;
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
      if (map.getLayer(OVERVIEW_LAYERS.water)) {
        map.setPaintProperty(OVERVIEW_LAYERS.water, "fill-color", colors.water);
        map.setPaintProperty(OVERVIEW_LAYERS.cover, "fill-color", colors.land);
      }
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
        if (!overviewOnly) {
          map.once("idle", () => resolve());
          map.triggerRepaint();
          return;
        }
        // The regions' hidden sources load nothing, but tiles they loaded before would hold back "idle".
        const check = () => {
          if (!OVERVIEW_SOURCES.every((id) => map.isSourceLoaded(id))) return;
          map.off("render", check);
          resolve();
        };
        map.on("render", check);
        map.triggerRepaint();
      });
    },
    setOverviewOnly(on) {
      if (!overviewSources || on === overviewOnly) return;
      overviewOnly = on;
      for (const { id } of map.getStyle().layers) {
        if (id === "land" || id === OVERVIEW_LAYERS.water || id === OVERVIEW_LAYERS.boundary) continue;
        map.setLayoutProperty(id, "visibility", on ? "none" : "visible");
      }
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
