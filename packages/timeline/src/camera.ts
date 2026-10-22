import type { AspectRatio, LonLat } from "@tripreplay/domain";
import {
  FIT_PADDING,
  MAX_OVERVIEW_ZOOM,
  MIN_ZOOM,
  REFERENCE_FRAME,
  STOP_ZOOM,
  TRAVEL_PULL_BACK,
  WORLD_SIZE,
} from "./constants.ts";
import { easeInOutCubic, lerp } from "./math.ts";
import { fromWorld, normalizeLon, toWorld } from "./mercator.ts";
import type { Camera } from "./model.ts";

/** Zoom at which a span of world units fits the padded reference frame; Infinity for an empty span. */
function fitZoom(spanX: number, spanY: number, aspectRatio: AspectRatio): number {
  const frame = REFERENCE_FRAME[aspectRatio];
  const zoomX = spanX > 0 ? Math.log2((frame.width * FIT_PADDING) / (spanX * WORLD_SIZE)) : Infinity;
  const zoomY = spanY > 0 ? Math.log2((frame.height * FIT_PADDING) / (spanY * WORLD_SIZE)) : Infinity;
  return Math.min(zoomX, zoomY);
}

export function stopCamera(location: LonLat): Camera {
  return { center: location, zoom: STOP_ZOOM, bearing: 0 };
}

/**
 * Smallest view showing every point. Longitudes are treated as a circle, so points on both sides of
 * the International Date Line are framed across it rather than across the whole world. The center
 * longitude is shifted by whole turns to lie among the given (possibly unwrapped) longitudes.
 */
export function overviewCamera(points: readonly LonLat[], aspectRatio: AspectRatio): Camera {
  if (points.length === 0) return { center: { lon: 0, lat: 0 }, zoom: MIN_ZOOM, bearing: 0 };
  const lons = points.map((p) => normalizeLon(p.lon)).sort((a, b) => a - b);
  let west = lons[0] ?? 0;
  let largestGap = 360 - ((lons.at(-1) ?? 0) - west);
  for (let i = 1; i < lons.length; i++) {
    const gap = (lons[i] ?? 0) - (lons[i - 1] ?? 0);
    if (gap > largestGap) {
      largestGap = gap;
      west = lons[i] ?? 0;
    }
  }
  const spanLon = lons.length === 1 ? 0 : 360 - largestGap;
  const ys = points.map((p) => toWorld(p).y);
  const north = Math.min(...ys);
  const south = Math.max(...ys);
  const lat = fromWorld({ x: 0, y: (north + south) / 2 }).lat;
  const zoom = fitZoom(spanLon / 360, south - north, aspectRatio);
  const center = normalizeLon(west + spanLon / 2);
  const reference = (Math.min(...points.map((p) => p.lon)) + Math.max(...points.map((p) => p.lon))) / 2;
  return {
    center: { lon: center + 360 * Math.round((reference - center) / 360), lat },
    zoom: Math.min(MAX_OVERVIEW_ZOOM, Math.max(MIN_ZOOM, zoom)),
    bearing: 0,
  };
}

/**
 * Camera part way through a move, with `t` from 0 to 1. Longitudes are interpolated as given, so the
 * caller places both cameras on a continuous route (see `unwrapPath`). When both ends are too far
 * apart to see together, the camera pulls back mid-way so that the viewer sees where it is going.
 */
export function interpolateCamera(from: Camera, to: Camera, t: number, aspectRatio: AspectRatio): Camera {
  const eased = easeInOutCubic(t);
  const start = toWorld(from.center);
  const end = toWorld(to.center);
  const center = fromWorld({ x: lerp(start.x, end.x, eased), y: lerp(start.y, end.y, eased) });
  const pulledBack = fitZoom(Math.abs(end.x - start.x), Math.abs(end.y - start.y), aspectRatio) - TRAVEL_PULL_BACK;
  const middle = Math.max(MIN_ZOOM, pulledBack);
  let zoom: number;
  if (middle >= Math.min(from.zoom, to.zoom)) zoom = lerp(from.zoom, to.zoom, eased);
  else if (t < 0.5) zoom = lerp(from.zoom, middle, easeInOutCubic(t * 2));
  else zoom = lerp(middle, to.zoom, easeInOutCubic(t * 2 - 1));
  return { center, zoom, bearing: lerp(from.bearing, to.bearing, eased) };
}
