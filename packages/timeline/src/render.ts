import type { Microseconds } from "@tripreplay/domain";
import { audioAt } from "./audio.ts";
import { interpolateCamera } from "./camera.ts";
import type { FrameDescription, MarkerState } from "./frame.ts";
import { easeInOutCubic, lerp, progress } from "./math.ts";
import type { Camera, Segment, Timeline, TravelSegment } from "./model.ts";
import { closingMoveUs, overlaysAt } from "./overlays.ts";

/** Index of the segment containing `timeUs`; the end of the recap belongs to the last segment. */
export function segmentIndexAt(timeline: Timeline, timeUs: Microseconds): number {
  const segments = timeline.segments;
  let low = 0;
  let high = segments.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((segments[middle]?.startUs ?? 0) <= timeUs) low = middle;
    else high = middle - 1;
  }
  return low;
}

/** Progress from 0 to 1 of the camera move in a segment, or undefined when the camera is still. */
function moveProgress(timeline: Timeline, segment: Segment, timeUs: Microseconds): number | undefined {
  if (segment.kind === "travel") return progress(timeUs, segment.startUs, segment.endUs);
  if (segment.kind === "closing")
    return progress(timeUs, segment.startUs, segment.startUs + closingMoveUs(timeline, segment));
  return undefined;
}

function cameraAt(timeline: Timeline, segment: Segment, move: number | undefined): Camera {
  if (move === undefined) return segment.from;
  if (timeline.reducedMotion) return move < 0.5 ? segment.from : segment.to;
  const via = segment.kind === "travel" && segment.stopIndex > 0 ? timeline.stops[segment.stopIndex]?.via : undefined;
  return interpolateCamera(segment.from, segment.to, move, timeline.aspectRatio, via);
}

/**
 * How far along its leg the line is during a move, from 0 to 1. It eases from one point to the
 * next: through where each photo taken on the way was taken, reached half way through the photo.
 */
export function legProgress(segment: TravelSegment, timeUs: Microseconds): number {
  const length = segment.endUs - segment.startUs;
  const u = progress(timeUs, segment.startUs, segment.endUs);
  const keys = [{ u: 0, at: 0 }];
  for (const photo of segment.photos) {
    if (photo.at === undefined || length <= 0) continue;
    const last = keys.at(-1) ?? { u: 0, at: 0 };
    keys.push({
      u: Math.max(last.u, ((photo.startUs + photo.endUs) / 2 - segment.startUs) / length),
      at: Math.max(last.at, photo.at),
    });
  }
  keys.push({ u: 1, at: 1 });
  const end = keys.findIndex((key, i) => i > 0 && u <= key.u);
  const to = keys[end] ?? { u: 1, at: 1 };
  const from = keys[end - 1] ?? { u: 0, at: 0 };
  return lerp(from.at, to.at, easeInOutCubic(progress(u, from.u, to.u)));
}

function routeProgress(timeline: Timeline, segment: Segment, move: number | undefined, timeUs: Microseconds): number {
  switch (segment.kind) {
    case "opening":
      return 0;
    case "closing":
      return Math.max(0, timeline.stops.length - 1);
    case "travel": {
      if (segment.stopIndex === 0) return 0;
      const step = timeline.reducedMotion ? ((move ?? 0) < 0.5 ? 0 : 1) : legProgress(segment, timeUs);
      return segment.stopIndex - 1 + step;
    }
    default:
      return segment.stopIndex;
  }
}

function markersAt(timeline: Timeline, segment: Segment): MarkerState[] {
  const current = segment.kind === "title" || segment.kind === "photo" || segment.kind === "video";
  return timeline.stops.map((stop, index): MarkerState => {
    let state: MarkerState["state"] = "upcoming";
    if (segment.kind === "closing") state = "visited";
    else if (segment.kind !== "opening") {
      if (index < segment.stopIndex) state = "visited";
      else if (index === segment.stopIndex && current) state = "current";
    }
    return { stopId: stop.id, location: stop.location, state };
  });
}

/**
 * Describes the frame at `timeUs`. A pure function of its arguments: equal inputs always give an
 * equal description, which lets preview, playback and export share one definition of the recap.
 * Times outside the recap are clamped to its start or end.
 */
export function renderAt(timeline: Timeline, timeUs: Microseconds): FrameDescription {
  const time = Number.isFinite(timeUs) ? Math.min(timeline.durationUs, Math.max(0, timeUs)) : 0;
  const segmentIndex = segmentIndexAt(timeline, time);
  const segment = timeline.segments[segmentIndex];
  if (!segment) throw new Error("A timeline always has opening and closing segments");
  const move = moveProgress(timeline, segment, time);
  return {
    timeUs: time,
    segmentIndex,
    segmentKind: segment.kind,
    camera: cameraAt(timeline, segment, move),
    route: { progress: routeProgress(timeline, segment, move, timeUs) },
    markers: markersAt(timeline, segment),
    overlays: overlaysAt(timeline, segmentIndex, time),
    audio: audioAt(timeline, segment, time),
    fade: timeline.reducedMotion && move !== undefined ? Math.abs(1 - 2 * move) : 1,
  };
}
