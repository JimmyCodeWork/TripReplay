import type { Microseconds, Project } from "@tripreplay/domain";
import { DUCK_GAIN, DUCK_RAMP } from "./constants.ts";
import type { AudioState } from "./frame.ts";
import { lerp } from "./math.ts";
import type { MusicInterval, Segment, Timeline } from "./model.ts";

type Interval = { readonly startUs: Microseconds; readonly endUs: Microseconds };

/** Places each music track on the timeline, cut at the end of the recap. */
export function buildMusic(project: Project, durationUs: Microseconds): MusicInterval[] {
  const intervals: MusicInterval[] = [];
  for (const track of project.music) {
    const endUs = Math.min(track.startUs + (track.outUs - track.inUs), durationUs);
    if (endUs <= track.startUs) continue;
    intervals.push({
      trackId: track.id,
      assetId: track.assetId,
      startUs: track.startUs,
      endUs,
      inUs: track.inUs,
      volume: track.volume,
      fadeInUs: track.fadeInUs,
      fadeOutUs: track.fadeOutUs,
      duckUnderClips: track.duckUnderClips,
    });
  }
  return intervals;
}

/** Intervals where a clip with sound plays, with touching intervals merged. */
export function buildAudibleClips(segments: readonly Segment[]): Interval[] {
  const intervals: { startUs: Microseconds; endUs: Microseconds }[] = [];
  for (const segment of segments) {
    if (segment.kind !== "video" || segment.gain <= 0) continue;
    const last = intervals.at(-1);
    if (last && last.endUs === segment.startUs) last.endUs = segment.endUs;
    else intervals.push({ startUs: segment.startUs, endUs: segment.endUs });
  }
  return intervals;
}

/** Music gain multiplier at `timeUs`, easing down to DUCK_GAIN around clips with sound. */
function duckFactor(audible: readonly Interval[], timeUs: Microseconds): number {
  let closeness = 0;
  for (const { startUs, endUs } of audible) {
    const distance = timeUs < startUs ? startUs - timeUs : timeUs >= endUs ? timeUs - endUs : 0;
    closeness = Math.max(closeness, 1 - distance / DUCK_RAMP);
  }
  return lerp(1, DUCK_GAIN, Math.max(0, closeness));
}

function musicGain(timeline: Timeline, music: MusicInterval, timeUs: Microseconds): number {
  const fadeIn = music.fadeInUs > 0 ? (timeUs - music.startUs) / music.fadeInUs : 1;
  const fadeOut = music.fadeOutUs > 0 ? (music.endUs - timeUs) / music.fadeOutUs : 1;
  const duck = music.duckUnderClips ? duckFactor(timeline.audibleClips, timeUs) : 1;
  return music.volume * Math.max(0, Math.min(1, fadeIn, fadeOut)) * duck;
}

export function audioAt(timeline: Timeline, segment: Segment, timeUs: Microseconds): AudioState[] {
  const states: AudioState[] = [];
  if (segment.kind === "video" && segment.gain > 0 && timeUs < segment.endUs) {
    states.push({
      kind: "clip",
      clipId: segment.clipId,
      assetId: segment.assetId,
      mediaTimeUs: segment.mediaInUs + (timeUs - segment.startUs),
      gain: segment.gain,
    });
  }
  for (const music of timeline.music) {
    if (timeUs < music.startUs || timeUs >= music.endUs) continue;
    states.push({
      kind: "music",
      trackId: music.trackId,
      assetId: music.assetId,
      mediaTimeUs: music.inUs + (timeUs - music.startUs),
      gain: musicGain(timeline, music, timeUs),
    });
  }
  return states;
}
