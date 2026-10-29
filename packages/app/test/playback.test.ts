import { compile } from "@tripreplay/timeline";
import { describe, expect, it } from "vitest";
import { type Clock, createPlayback } from "../src/index.ts";
import { sampleProject } from "./fakes.ts";

/** A clock moved by the test; `frame` runs the requested callbacks as a browser frame would. */
class ManualClock implements Clock {
  ms = 0;
  private callbacks: (() => void)[] = [];

  now = () => this.ms;

  requestFrame(callback: () => void) {
    this.callbacks.push(callback);
    return () => {
      this.callbacks = this.callbacks.filter((c) => c !== callback);
    };
  }

  get pending() {
    return this.callbacks.length;
  }

  frame(advanceMs: number) {
    this.ms += advanceMs;
    const due = this.callbacks;
    this.callbacks = [];
    for (const callback of due) callback();
  }
}

function setup() {
  const clock = new ManualClock();
  const playback = createPlayback({ clock });
  const timeline = compile(sampleProject());
  playback.setTimeline(timeline);
  return { clock, playback, timeline };
}

describe("playback", () => {
  it("advances with the clock while playing and stops at the end", () => {
    const { clock, playback, timeline } = setup();
    expect(playback.getState()).toEqual({ playing: false, timeUs: 0, durationUs: timeline.durationUs });
    playback.play();
    clock.frame(500);
    expect(playback.getState()).toMatchObject({ playing: true, timeUs: 500_000 });
    expect(playback.frame()?.timeUs).toBe(500_000);
    // A long frame skips ahead in time rather than slowing down.
    clock.frame(timeline.durationUs / 1000);
    expect(playback.getState()).toMatchObject({ playing: false, timeUs: timeline.durationUs });
    expect(clock.pending).toBe(0);
  });

  it("pauses, seeks and plays again from the start once at the end", () => {
    const { clock, playback, timeline } = setup();
    playback.play();
    clock.frame(1000);
    playback.pause();
    clock.frame(1000);
    expect(playback.getState()).toMatchObject({ playing: false, timeUs: 1_000_000 });
    expect(clock.pending).toBe(0);
    playback.seek(2_500_000);
    playback.toggle();
    clock.frame(100);
    expect(playback.getState()).toMatchObject({ playing: true, timeUs: 2_600_000 });
    playback.seek(timeline.durationUs + 5_000_000);
    playback.pause();
    expect(playback.getState().timeUs).toBe(timeline.durationUs);
    playback.play();
    expect(playback.getState()).toMatchObject({ playing: true, timeUs: 0 });
  });

  it("keeps the time within a shorter timeline after an edit", () => {
    const { playback, timeline } = setup();
    playback.seek(timeline.durationUs);
    const shorter = { ...timeline, durationUs: 1_000_000 };
    playback.setTimeline(shorter);
    expect(playback.getState()).toMatchObject({ timeUs: 1_000_000, durationUs: 1_000_000 });
  });

  it("describes no frame before a timeline is set", () => {
    const playback = createPlayback({ clock: new ManualClock() });
    expect(playback.frame()).toBeUndefined();
    playback.play();
    expect(playback.getState().playing).toBe(false);
  });
});
