import { seconds, setClipVolume, updateMusicSettings } from "@tripreplay/domain";
import { describe, expect, it } from "vitest";
import { type AudioState, compile, DUCK_GAIN, renderAt, type Timeline } from "../src/index.ts";
import { kyoto } from "./fixtures.ts";

function audio(timeline: Timeline, at: number, kind: AudioState["kind"]) {
  return renderAt(timeline, seconds(at)).audio.find((a) => a.kind === kind);
}

describe("audio", () => {
  const timeline = compile(kyoto());

  it("plays a clip's sound in step with its video", () => {
    // Video c3 plays at 12–16 s from 0 s in the source.
    expect(audio(timeline, 13.5, "clip")).toEqual({
      kind: "clip",
      clipId: "c3",
      assetId: "v1",
      mediaTimeUs: seconds(1.5),
      gain: 1,
    });
    expect(audio(timeline, 11.9, "clip")).toBeUndefined();
  });

  it("plays nothing for videos without sound or with zero volume", () => {
    expect(audio(timeline, 23, "clip")).toBeUndefined(); // c4 has no audio track
    const muted = compile(setClipVolume(kyoto(), "c3", 0));
    expect(audio(muted, 13.5, "clip")).toBeUndefined();
    expect(muted.audibleClips).toEqual([]);
  });

  it("fades the music in and lowers it under clips with sound", () => {
    const volume = 0.7;
    expect(audio(timeline, 0, "music")?.gain).toBe(0);
    expect(audio(timeline, 1, "music")?.gain).toBeCloseTo(volume / 2);
    expect(audio(timeline, 5, "music")?.gain).toBeCloseTo(volume);
    expect(audio(timeline, 13.5, "music")?.gain).toBeCloseTo(volume * DUCK_GAIN);
    expect(audio(timeline, 11.85, "music")?.gain).toBeCloseTo((volume * (1 + DUCK_GAIN)) / 2);
  });

  it("keeps the music at full level when ducking is off", () => {
    const unducked = compile(updateMusicSettings(kyoto(), "track", { duckUnderClips: false }));
    expect(audio(unducked, 13.5, "music")?.gain).toBeCloseTo(0.7);
  });

  it("cuts the music at the end of the recap and fades it out there", () => {
    const [music] = timeline.music;
    expect(music?.endUs).toBe(timeline.durationUs);
    expect(renderAt(timeline, timeline.durationUs).audio).toEqual([]);
    expect(audio(timeline, 26, "music")?.gain).toBeCloseTo(0.7 / 2);
  });
});
