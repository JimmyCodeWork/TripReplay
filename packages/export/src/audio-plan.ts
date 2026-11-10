import { renderAt, type Timeline } from "@tripreplay/timeline";

/** Spacing of the gain samples taken from the timeline, fine enough for fades and ducking. */
export const AUDIO_STEP_US = 50_000;

/** A stretch of one source playing on the recap, with its gain over time. */
export interface AudioRun {
  readonly assetId: string;
  readonly startUs: number;
  readonly endUs: number;
  /** Position in the source file at `startUs`; the source then plays at normal speed. */
  readonly mediaStartUs: number;
  readonly gains: readonly { readonly timeUs: number; readonly gain: number }[];
}

interface OpenRun {
  assetId: string;
  startUs: number;
  endUs: number;
  mediaStartUs: number;
  gains: { timeUs: number; gain: number }[];
}

/**
 * What the export's sound is made of: the same frame descriptions that drive the preview's
 * mixer, sampled across the recap. A source that stops, or jumps in its file, starts a new run.
 */
export function planAudio(timeline: Timeline, stepUs = AUDIO_STEP_US): AudioRun[] {
  const runs: AudioRun[] = [];
  const open = new Map<string, OpenRun>();
  const close = (key: string) => {
    const run = open.get(key);
    if (run) runs.push(run);
    open.delete(key);
  };
  for (let timeUs = 0; timeUs < timeline.durationUs; timeUs += stepUs) {
    const seen = new Set<string>();
    for (const state of renderAt(timeline, timeUs).audio) {
      const key = state.kind === "clip" ? `clip:${state.clipId}` : `music:${state.trackId}`;
      seen.add(key);
      let run = open.get(key);
      if (run && Math.abs(state.mediaTimeUs - (run.mediaStartUs + timeUs - run.startUs)) > stepUs) {
        close(key);
        run = undefined;
      }
      if (!run) {
        run = { assetId: state.assetId, startUs: timeUs, endUs: timeUs, mediaStartUs: state.mediaTimeUs, gains: [] };
        open.set(key, run);
      }
      run.endUs = Math.min(timeline.durationUs, timeUs + stepUs);
      run.gains.push({ timeUs, gain: state.gain });
    }
    for (const key of [...open.keys()]) if (!seen.has(key)) close(key);
  }
  for (const key of [...open.keys()]) close(key);
  return runs.sort((a, b) => a.startUs - b.startUs);
}
