import { clipDuration, clipsOfStop, type Microseconds, type Project } from "@tripreplay/domain";
import type { Timing } from "@tripreplay/themes";
import { stopCamera } from "./camera.ts";
import type { Camera, Segment, TimelineStop } from "./model.ts";

/**
 * Lays out the recap: opening, then for each stop a travel move, its title and its clips, then the
 * closing. A stop without clips still gets its travel and title, so the map is never left empty.
 */
export function buildSegments(
  project: Project,
  stops: readonly TimelineStop[],
  overview: Camera,
  timing: Timing,
): Segment[] {
  const segments: Segment[] = [];
  let cursor: Microseconds = 0;
  const next = (length: Microseconds): { startUs: Microseconds; endUs: Microseconds } => {
    const span = { startUs: cursor, endUs: cursor + length };
    cursor = span.endUs;
    return span;
  };

  segments.push({ kind: "opening", ...next(timing.openingUs), from: overview, to: overview });
  let camera = overview;
  stops.forEach((stop, stopIndex) => {
    const here = stopCamera(stop.location);
    segments.push({ kind: "travel", stopIndex, ...next(timing.travelUs), from: camera, to: here });
    segments.push({ kind: "title", stopIndex, ...next(timing.titleUs), from: here, to: here });
    for (const clip of clipsOfStop(project, stop.id)) {
      const length = clipDuration(clip);
      if (length <= 0) continue;
      const asset = project.assets.find((a) => a.id === clip.assetId);
      const audible = clip.kind === "video" && asset?.kind === "video" && asset.hasAudio;
      segments.push({
        kind: clip.kind,
        stopIndex,
        ...next(length),
        from: here,
        to: here,
        clipId: clip.id,
        assetId: clip.assetId,
        mediaInUs: clip.kind === "video" ? clip.inUs : 0,
        gain: audible ? clip.volume : 0,
        caption: clip.note ?? "",
      });
    }
    camera = here;
  });
  segments.push({ kind: "closing", ...next(timing.closingUs), from: camera, to: overview });
  return segments;
}
