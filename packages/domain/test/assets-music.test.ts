import { describe, expect, it } from "vitest";
import {
  addAsset,
  addClip,
  addMusicTrack,
  DomainError,
  findAssetByHash,
  moveMusicTrack,
  removeMusicTrack,
  removeUnreferencedAssets,
  seconds,
  trimMusicTrack,
  updateMusicSettings,
} from "../src/index.ts";
import { audio, sampleProject } from "./fixtures.ts";

const withMusic = () => addMusicTrack(addAsset(sampleProject(), audio("m1", 60)), { id: "t1", assetId: "m1" });

describe("assets", () => {
  it("finds duplicates by content hash", () => {
    expect(findAssetByHash(sampleProject(), "h-p1")?.id).toBe("p1");
    expect(findAssetByHash(sampleProject(), "nope")).toBeUndefined();
  });

  it("removes only unreferenced assets", () => {
    const p = addClip(sampleProject(), { id: "c1", stopId: "a", assetId: "p1" });
    const { project, removed } = removeUnreferencedAssets(p);
    expect(removed).toEqual(["p2", "v1"]);
    expect(project.assets.map((a) => a.id)).toEqual(["p1"]);
  });
});

describe("music", () => {
  it("adds a track with default volume, fades and ducking", () => {
    expect(withMusic().music[0]).toMatchObject({
      startUs: 0,
      inUs: 0,
      outUs: seconds(60),
      volume: 0.7,
      fadeInUs: seconds(2),
      duckUnderClips: true,
    });
  });

  it("rejects non-audio assets", () => {
    expect(() => addMusicTrack(sampleProject(), { id: "t1", assetId: "p1" })).toThrow(DomainError);
  });

  it("moves, trims and keeps fades within the track", () => {
    let p = moveMusicTrack(withMusic(), "t1", seconds(-3));
    expect(p.music[0]?.startUs).toBe(0);
    p = trimMusicTrack(p, "t1", { inUs: seconds(10), outUs: seconds(11) });
    expect(p.music[0]).toMatchObject({ inUs: seconds(10), outUs: seconds(11) });
    expect((p.music[0]?.fadeInUs ?? 0) + (p.music[0]?.fadeOutUs ?? 0)).toBeLessThanOrEqual(seconds(1));
  });

  it("updates settings and removes the track", () => {
    const p = updateMusicSettings(withMusic(), "t1", { volume: 2, duckUnderClips: false });
    expect(p.music[0]).toMatchObject({ volume: 1, duckUnderClips: false });
    expect(removeMusicTrack(p, "t1").music).toEqual([]);
  });
});
