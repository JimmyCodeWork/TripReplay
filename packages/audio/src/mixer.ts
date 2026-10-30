import type { AudioPort, FrameDescription } from "@tripreplay/app";
import { syncAction } from "./sync.ts";

type AudioState = FrameDescription["audio"][number];

/** Time constant of gain changes in seconds, short enough to follow fades and ducking without clicks. */
const GAIN_SMOOTHING_S = 0.03;

export interface AudioMixerOptions {
  /** Created on first use; browsers start it suspended until the user interacts with the page. */
  readonly context: () => AudioContext;
  /**
   * The media element that plays a source: the preview's video element for a clip's sound, an
   * audio element for music. Undefined while it is not available.
   */
  readonly element: (state: AudioState) => HTMLMediaElement | undefined;
}

interface Channel {
  readonly element: HTMLMediaElement;
  readonly gain: GainNode;
  readonly music: boolean;
}

const keyOf = (state: AudioState) => (state.kind === "clip" ? `clip:${state.assetId}` : `music:${state.trackId}`);

/**
 * AudioPort with Web Audio: each source plays through its media element, which keeps memory low
 * for long music, and a gain node applies the frame's gain, including fades and ducking.
 */
export function createAudioMixer({ context, element }: AudioMixerOptions): AudioPort {
  let ctx: AudioContext | undefined;
  const channels = new Map<string, Channel>();

  const channel = (state: AudioState): Channel | undefined => {
    const key = keyOf(state);
    const existing = channels.get(key);
    if (existing) return existing;
    const media = element(state);
    if (!media) return undefined;
    ctx ??= context();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    // From here on the element's sound only reaches the speakers through the gain node.
    ctx.createMediaElementSource(media).connect(gain).connect(ctx.destination);
    media.muted = false;
    const created = { element: media, gain, music: state.kind === "music" };
    channels.set(key, created);
    return created;
  };

  return {
    render(audio, playing) {
      if (playing && ctx?.state === "suspended") void ctx.resume();
      const active = new Set<string>();
      for (const state of audio) {
        const current = channel(state);
        if (!current || !ctx) continue;
        active.add(keyOf(state));
        current.gain.gain.setTargetAtTime(state.gain, ctx.currentTime, GAIN_SMOOTHING_S);
        // The preview positions its own videos; only music is moved here.
        if (!current.music) continue;
        const action = syncAction(current.element, state.mediaTimeUs / 1_000_000, playing);
        if (action.seekTo !== undefined) current.element.currentTime = action.seekTo;
        if (action.play) void current.element.play().catch(() => {});
        if (action.pause) current.element.pause();
      }
      for (const [key, idle] of channels) {
        if (active.has(key) || !ctx) continue;
        idle.gain.gain.setTargetAtTime(0, ctx.currentTime, GAIN_SMOOTHING_S);
        if (idle.music && !idle.element.paused) idle.element.pause();
      }
    },

    dispose() {
      for (const { element: media, gain } of channels.values()) {
        if (!media.paused) media.pause();
        gain.disconnect();
      }
      channels.clear();
      void ctx?.close();
      ctx = undefined;
    },
  };
}
