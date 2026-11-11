import { renderAt } from "@tripreplay/timeline";
import { describe, expect, it } from "vitest";
import { AUDIO_STEP_US, planAudio } from "../src/index.ts";
import { timeline } from "./fixture.ts";

describe("planAudio", () => {
  it("finds each source's stretch on the recap with its gains, as the preview mixes them", () => {
    const runs = planAudio(timeline);
    const music = runs.find((run) => run.assetId === "m");
    const clip = runs.find((run) => run.assetId === "v");
    if (!music || !clip) throw new Error("missing run");
    expect(music.startUs).toBe(0);
    expect(music.endUs).toBe(timeline.durationUs);
    expect(music.mediaStartUs).toBe(0);
    // The clip plays from its in point, for as long as its segment.
    const segment = timeline.segments.find((s) => s.kind === "video");
    if (!segment) throw new Error("missing segment");
    expect(Math.abs(clip.startUs - segment.startUs)).toBeLessThanOrEqual(AUDIO_STEP_US);
    expect(Math.abs(clip.mediaStartUs - (1_000_000 + clip.startUs - segment.startUs))).toBeLessThan(1000);
    // Gains are the frames' gains: the music is lowered while the clip plays.
    const during = music.gains.find((g) => g.timeUs >= segment.startUs + 500_000);
    const before = music.gains[0];
    expect(during?.gain).toBeLessThan(before?.gain ?? 0);
    const at = renderAt(timeline, during?.timeUs ?? 0).audio.find((a) => a.kind === "music");
    expect(during?.gain).toBe(at?.gain);
  });
});
