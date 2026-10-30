import type { Microseconds } from "@tripreplay/domain";
import { PHOTO_PUSH_IN } from "./constants.ts";
import type { MediaOverlay, Overlay } from "./frame.ts";
import { envelope, lerp, progress } from "./math.ts";
import type { MediaSegment, Segment, Timeline } from "./model.ts";

function isMedia(segment: Segment | undefined): segment is MediaSegment {
  return segment?.kind === "photo" || segment?.kind === "video";
}

/**
 * Card of the media segment at `index`. Between two media segments the cards cross-fade over the
 * theme's fade duration, centered on the boundary; elsewhere they fade inside their own segment.
 */
function mediaCard(timeline: Timeline, index: number, timeUs: Microseconds): MediaOverlay | undefined {
  const segment = timeline.segments[index];
  if (!isMedia(segment)) return undefined;
  const fadeUs = timeline.theme.timing.fadeUs;
  const visibleStart = segment.startUs - (isMedia(timeline.segments[index - 1]) ? fadeUs / 2 : 0);
  const visibleEnd = segment.endUs + (isMedia(timeline.segments[index + 1]) ? fadeUs / 2 : 0);
  const opacity = envelope(timeUs, visibleStart, visibleEnd, fadeUs);
  if (opacity <= 0) return undefined;
  const played = progress(timeUs, segment.startUs, segment.endUs);
  const length = segment.endUs - segment.startUs;
  const isPhoto = segment.kind === "photo";
  return {
    kind: "media",
    mediaKind: segment.kind,
    clipId: segment.clipId,
    assetId: segment.assetId,
    mediaTimeUs: isPhoto ? 0 : segment.mediaInUs + Math.round(played * length),
    frame: timeline.theme.layouts[timeline.aspectRatio].mediaFrame,
    scale: isPhoto && !timeline.reducedMotion ? lerp(1, PHOTO_PUSH_IN, played) : 1,
    progress: played,
    caption: segment.caption,
    opacity,
  };
}

/** Bounds of the run of media segments around `index` that belong to the same stop. */
function mediaRun(timeline: Timeline, index: number): { startUs: Microseconds; endUs: Microseconds } {
  const segments = timeline.segments;
  const stopIndex = (segments[index] as MediaSegment).stopIndex;
  const sameStop = (s: Segment | undefined) => isMedia(s) && s.stopIndex === stopIndex;
  let first = index;
  let last = index;
  while (sameStop(segments[first - 1])) first--;
  while (sameStop(segments[last + 1])) last++;
  return { startUs: segments[first]?.startUs ?? 0, endUs: segments[last]?.endUs ?? 0 };
}

export function overlaysAt(timeline: Timeline, index: number, timeUs: Microseconds): Overlay[] {
  const segment = timeline.segments[index];
  const overlays: Overlay[] = [];
  if (!segment) return overlays;
  const fadeUs = timeline.theme.timing.fadeUs;

  for (const neighbor of [index - 1, index, index + 1]) {
    const card = mediaCard(timeline, neighbor, timeUs);
    if (card) overlays.push(card);
  }

  if (segment.kind === "opening") {
    overlays.push({
      kind: "tripTitle",
      title: timeline.title,
      firstDate: timeline.stops[0]?.date ?? null,
      lastDate: timeline.stops.at(-1)?.date ?? null,
      opacity: envelope(timeUs, segment.startUs, segment.endUs, fadeUs),
    });
  } else if (segment.kind === "title") {
    const stop = timeline.stops[segment.stopIndex];
    if (stop) {
      overlays.push({
        kind: "stopTitle",
        stopId: stop.id,
        name: stop.name,
        date: stop.date,
        day: stop.day,
        opacity: envelope(timeUs, segment.startUs, segment.endUs, fadeUs),
      });
    }
  } else if (isMedia(segment)) {
    const stop = timeline.stops[segment.stopIndex];
    const run = mediaRun(timeline, index);
    if (stop) {
      overlays.push({
        kind: "stopLabel",
        stopId: stop.id,
        name: stop.name,
        day: stop.day,
        opacity: envelope(timeUs, run.startUs, run.endUs, fadeUs),
      });
    }
  } else if (segment.kind === "closing") {
    const shownFrom = segment.startUs + closingMoveUs(timeline, segment);
    overlays.push({
      kind: "summary",
      title: timeline.title,
      stopCount: timeline.stops.length,
      dayCount: timeline.stops.at(-1)?.day ?? 0,
      opacity: progress(timeUs, shownFrom, shownFrom + fadeUs),
    });
  }

  overlays.push({ kind: "attribution", opacity: 1 });
  return overlays;
}

/** Part of the closing during which the camera returns to the overview. */
export function closingMoveUs(timeline: Timeline, segment: Segment): Microseconds {
  return Math.min(timeline.theme.timing.travelUs, segment.endUs - segment.startUs);
}
