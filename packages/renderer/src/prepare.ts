import { renderAt, type Timeline } from "@tripreplay/timeline";
import { type LonLat, type MapView, mapView } from "./map-layer.ts";

/** A view of the camera's path to load before playing (docs/adr/0014-load-map-before-playing.md). */
export interface PrepareView {
  readonly view: MapView;
  /**
   * Whether the view is near a stop, where the regions' detailed map is loaded; elsewhere only the
   * world overview is, and the regions' map is drawn as it loads while playing.
   */
  readonly near: boolean;
}

export interface PrepareViewsOptions {
  /** Steps of recap time between views, short enough that a fast camera move shows little between them. */
  readonly stepUs?: number;
  /** How far from a stop, in kilometres, the camera's centre counts as near it; undefined for everywhere. */
  readonly nearKm?: number | undefined;
}

const EARTH_RADIUS_KM = 6371;

function distanceKm(a: LonLat, b: LonLat): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * The distinct views of the camera's path from `fromUs` to the end of the timeline, on a surface of
 * `width` CSS pixels, each marked near a stop or not.
 */
export function prepareViews(
  timeline: Timeline,
  fromUs: number,
  width: number,
  { stepUs = 50_000, nearKm }: PrepareViewsOptions = {},
): PrepareView[] {
  const views: PrepareView[] = [];
  let previous = "";
  for (let us = Math.max(0, fromUs); us < timeline.durationUs + stepUs; us += stepUs) {
    const view = mapView(renderAt(timeline, Math.min(us, timeline.durationUs)).camera, width, timeline.aspectRatio);
    const key = `${view.center.lon.toFixed(6)} ${view.center.lat.toFixed(6)} ${view.zoom.toFixed(3)} ${view.bearing}`;
    if (key === previous) continue;
    previous = key;
    const near =
      nearKm === undefined ||
      timeline.stops.length === 0 ||
      timeline.stops.some((stop) => distanceKm(view.center, stop.location) <= nearKm);
    views.push({ view, near });
  }
  return views;
}
