import { describe, expect, it } from "vitest";
import { DRIFT_S, syncAction } from "../src/index.ts";

describe("syncAction", () => {
  it("starts a paused element at the recap's time", () => {
    expect(syncAction({ currentTime: 0, paused: true }, 12.5, true)).toEqual({
      seekTo: 12.5,
      play: true,
      pause: false,
    });
  });

  it("leaves a playing element alone within the drift and moves it beyond", () => {
    expect(syncAction({ currentTime: 12.4, paused: false }, 12.5, true)).toEqual({ play: false, pause: false });
    expect(syncAction({ currentTime: 12.5 - DRIFT_S - 0.1, paused: false }, 12.5, true)).toMatchObject({
      seekTo: 12.5,
    });
  });

  it("pauses when the recap pauses and places a paused element exactly while scrubbing", () => {
    expect(syncAction({ currentTime: 12.5, paused: false }, 12.5, false)).toEqual({ play: false, pause: true });
    expect(syncAction({ currentTime: 12.4, paused: true }, 12.5, false)).toEqual({
      seekTo: 12.5,
      play: false,
      pause: false,
    });
  });
});
