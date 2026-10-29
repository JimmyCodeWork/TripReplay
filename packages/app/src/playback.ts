import type { Microseconds } from "@tripreplay/domain";
import { type FrameDescription, renderAt, type Timeline } from "@tripreplay/timeline";
import type { Clock } from "./ports.ts";
import { createStore, type Listener } from "./store.ts";

export interface PlaybackState {
  readonly playing: boolean;
  readonly timeUs: Microseconds;
  readonly durationUs: Microseconds;
}

/**
 * Plays a timeline in real time (docs/ui-design.md §3.4, §5). The time comes from the clock, so a
 * slow frame skips ahead instead of slowing the recap down; every frame is described by `renderAt`.
 */
export interface Playback {
  getState(): PlaybackState;
  subscribe(listener: Listener): () => void;
  /** Replaces the timeline, for example after an edit; the time stays, within the new duration. */
  setTimeline(timeline: Timeline): void;
  /** Plays from the current time, or from the start once the end was reached. */
  play(): void;
  pause(): void;
  toggle(): void;
  seek(timeUs: Microseconds): void;
  /** The frame at the current time, or undefined before a timeline is set. */
  frame(): FrameDescription | undefined;
  dispose(): void;
}

export interface PlaybackOptions {
  readonly clock: Clock;
}

export function createPlayback({ clock }: PlaybackOptions): Playback {
  const store = createStore<PlaybackState>({ playing: false, timeUs: 0, durationUs: 0 });
  let timeline: Timeline | undefined;
  let cancelFrame: (() => void) | undefined;
  /** Clock time and recap time when playback last started or seeked. */
  let anchor = { clockMs: 0, timeUs: 0 };

  const set = (changes: Partial<PlaybackState>) => store.setState((state) => ({ ...state, ...changes }));
  const clamp = (timeUs: number) => Math.min(store.getState().durationUs, Math.max(0, timeUs));
  const current = () => clamp(anchor.timeUs + (clock.now() - anchor.clockMs) * 1000);

  const tick = () => {
    const timeUs = current();
    if (timeUs >= store.getState().durationUs) {
      cancelFrame = undefined;
      set({ playing: false, timeUs });
      return;
    }
    set({ timeUs });
    cancelFrame = clock.requestFrame(tick);
  };

  const pause = () => {
    if (!store.getState().playing) return;
    cancelFrame?.();
    cancelFrame = undefined;
    set({ playing: false, timeUs: current() });
  };

  const play = () => {
    const state = store.getState();
    if (state.playing || state.durationUs === 0) return;
    const timeUs = state.timeUs >= state.durationUs ? 0 : state.timeUs;
    anchor = { clockMs: clock.now(), timeUs };
    set({ playing: true, timeUs });
    cancelFrame = clock.requestFrame(tick);
  };

  return {
    getState: store.getState,
    subscribe: store.subscribe,

    setTimeline(next) {
      timeline = next;
      const timeUs = Math.min(store.getState().timeUs, next.durationUs);
      anchor = { clockMs: clock.now(), timeUs };
      set({ durationUs: next.durationUs, timeUs });
      if (timeUs >= next.durationUs) pause();
    },

    play,
    pause,
    toggle: () => (store.getState().playing ? pause() : play()),

    seek(timeUs) {
      const time = clamp(timeUs);
      anchor = { clockMs: clock.now(), timeUs: time };
      set({ timeUs: time });
    },

    frame: () => timeline && renderAt(timeline, store.getState().timeUs),

    dispose() {
      cancelFrame?.();
      cancelFrame = undefined;
    },
  };
}
