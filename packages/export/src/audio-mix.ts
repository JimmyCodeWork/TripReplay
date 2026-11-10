import type { AudioRun } from "./audio-plan.ts";

/** Sample rate of exported sound, which both AAC and Opus encoders accept. */
export const SAMPLE_RATE = 48_000;
export const CHANNELS = 2;

/**
 * Mixes the runs into one stereo buffer as long as the recap, offline and faster than real time.
 * `buffers` holds each source's decoded sound by asset; a source without one stays silent.
 * Undefined when nothing makes a sound.
 */
export async function mixAudio(
  runs: readonly AudioRun[],
  durationUs: number,
  buffers: ReadonlyMap<string, AudioBuffer>,
): Promise<AudioBuffer | undefined> {
  const playable = runs.filter((run) => buffers.has(run.assetId) && run.endUs > run.startUs);
  if (playable.length === 0 || durationUs <= 0) return undefined;
  const context = new OfflineAudioContext(CHANNELS, Math.ceil((durationUs / 1_000_000) * SAMPLE_RATE), SAMPLE_RATE);
  for (const run of playable) {
    const source = context.createBufferSource();
    source.buffer = buffers.get(run.assetId) ?? null;
    const gain = context.createGain();
    const start = run.startUs / 1_000_000;
    gain.gain.setValueAtTime(run.gains[0]?.gain ?? 0, start);
    for (const { timeUs, gain: value } of run.gains) gain.gain.linearRampToValueAtTime(value, timeUs / 1_000_000);
    source.connect(gain).connect(context.destination);
    source.start(start, run.mediaStartUs / 1_000_000, (run.endUs - run.startUs) / 1_000_000);
  }
  return context.startRendering();
}
