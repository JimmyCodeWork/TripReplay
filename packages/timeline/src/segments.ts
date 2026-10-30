import { clipDuration, clipsOfStop, type Microseconds, type Project, seconds } from "@tripreplay/domain";
import type { Timing } from "@tripreplay/themes";
import { stopCamera } from "./camera.ts";
import type { Camera, Segment, TimelineStop } from "./model.ts";

/** Characters of a stop's journal entry shown in the recap; the rest stays in the journal. */
export const JOURNAL_EXCERPT = 80;

/** The part of a journal entry shown under the stop's title, ending with an ellipsis when cut. */
export function journalExcerpt(entry: string): string {
  const text = entry.trim().replace(/\s*\n\s*/g, " ");
  const chars = Array.from(text);
  return chars.length <= JOURNAL_EXCERPT ? text : `${chars.slice(0, JOURNAL_EXCERPT).join("").trimEnd()}…`;
}

/**
 * How long a stop's title stays so that its journal excerpt can be read: about eight characters a
 * second after a moment for the title, at most ten seconds, and never shorter than the title alone.
 */
export function titleLength(titleUs: Microseconds, journal: string): Microseconds {
  if (journal === "") return titleUs;
  const reading = Math.min(seconds(10), seconds(1.5) + Math.round(Array.from(journal).length * seconds(0.12)));
  return Math.max(titleUs, reading);
}

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
    segments.push({
      kind: "title",
      stopIndex,
      ...next(titleLength(timing.titleUs, stop.journal)),
      from: here,
      to: here,
    });
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
