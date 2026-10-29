import type { FrameDescription, Timeline } from "@tripreplay/timeline";
import type { Canvas2D } from "./canvas.ts";
import { drawFrame, type MediaSource, type RecapLabels } from "./draw.ts";
import { type LonLat, type MapLayer, type MapView, mapView, type ScreenPoint } from "./map-layer.ts";

/** Pixels of the world at zoom 0, as in MapLibre. */
const TILE_SIZE = 512;

/**
 * Web Mercator projection of a view onto a surface, for drawing without a base map. It matches
 * the map layer's convention: zoom 0 shows the world in 512 pixels, the center is in the middle.
 */
export function projectWithView(view: MapView, width: number, height: number): (point: LonLat) => ScreenPoint {
  const scale = TILE_SIZE * 2 ** view.zoom;
  const world = (p: LonLat) => {
    const sin = Math.sin((Math.max(-85.05113, Math.min(85.05113, p.lat)) * Math.PI) / 180);
    return {
      x: ((p.lon + 180) / 360) * scale,
      y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale,
    };
  };
  const center = world(view.center);
  const angle = (-view.bearing * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return (point) => {
    const p = world(point);
    const dx = p.x - center.x;
    const dy = p.y - center.y;
    return { x: width / 2 + dx * cos - dy * sin, y: height / 2 + dx * sin + dy * cos };
  };
}

export interface RecapRendererOptions<Image = unknown> {
  /** The canvas above the map; the renderer sets its size in device pixels. */
  readonly canvas: { width: number; height: number };
  readonly context: Canvas2D<Image>;
  /** The base map, or undefined when no map of the trip is on the device. */
  readonly map?: MapLayer;
  readonly labels: RecapLabels;
  readonly media?: MediaSource<Image>;
  /** Device pixels per CSS pixel. */
  readonly pixelRatio?: number;
}

export interface RecapRenderer {
  /** Size of the surface in CSS pixels. */
  resize(width: number, height: number): void;
  /** Draws a frame: moves the map to its camera and draws the route, markers and overlays. */
  draw(timeline: Timeline, frame: FrameDescription): void;
  destroy(): void;
}

/** Draws FrameDescriptions (docs/architecture.md §4.1) over a map layer, for the preview and the player. */
export function createRecapRenderer<Image>(options: RecapRendererOptions<Image>): RecapRenderer {
  const { canvas, context, map, labels, media } = options;
  const ratio = options.pixelRatio ?? 1;
  let width = 0;
  let height = 0;
  let colors: Timeline["theme"]["map"] | undefined;

  return {
    resize(w, h) {
      width = w;
      height = h;
      canvas.width = Math.round(w * ratio);
      canvas.height = Math.round(h * ratio);
      map?.resize(w, h);
    },

    draw(timeline, frame) {
      if (width === 0 || height === 0) return;
      const view = mapView(frame.camera, width, timeline.aspectRatio);
      if (map) {
        if (colors !== timeline.theme.map) {
          colors = timeline.theme.map;
          map.setColors(colors);
        }
        map.setView(view);
      }
      const project = map ? (point: LonLat) => map.project(point) : projectWithView(view, width, height);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawFrame(context, { timeline, frame, width, height, project, labels, ...(media ? { media } : {}) }, !map);
    },

    destroy() {
      map?.destroy();
    },
  };
}
