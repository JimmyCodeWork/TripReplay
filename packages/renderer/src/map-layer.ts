import { type Camera, REFERENCE_FRAME, type Timeline } from "@tripreplay/timeline";

export type LonLat = Camera["center"];
export type MapColors = Timeline["theme"]["map"];

/** A camera converted to the drawing surface: `zoom` refers to the surface width, not the reference frame. */
export interface MapView {
  readonly center: LonLat;
  readonly zoom: number;
  readonly bearing: number;
}

export interface ScreenPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Draws the base map (docs/architecture.md §4.2). The renderer moves it frame by frame from the
 * FrameDescription and draws the route, markers and captions on top; the map engine never animates
 * on its own. Sizes and screen points are in CSS pixels of the drawing surface.
 */
export interface MapLayer {
  resize(width: number, height: number): void;
  setColors(colors: MapColors): void;
  /** Moves the map; it is drawn in the next animation frame. */
  setView(view: MapView): void;
  /** Position of a coordinate on the surface for the current view, for overlays. */
  project(point: LonLat): ScreenPoint;
  /** Resolves once every tile needed for the current view is loaded and drawn, as export requires. */
  whenDrawn(): Promise<void>;
  destroy(): void;
}

/** Converts a timeline camera, whose zoom refers to the reference frame, to a surface of `width` CSS pixels. */
export function mapView(camera: Camera, width: number, aspectRatio: Timeline["aspectRatio"]): MapView {
  return {
    center: camera.center,
    zoom: camera.zoom + Math.log2(width / REFERENCE_FRAME[aspectRatio].width),
    bearing: camera.bearing,
  };
}
