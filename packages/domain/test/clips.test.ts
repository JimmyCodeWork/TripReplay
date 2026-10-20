import { describe, expect, it } from "vitest";
import {
  addAsset,
  addClip,
  clipDuration,
  DomainError,
  moveClip,
  normalizePhotoDuration,
  PHOTO_DURATION,
  type Project,
  removeClip,
  seconds,
  setClipFit,
  setClipVolume,
  setPhotoDuration,
  trimVideo,
} from "../src/index.ts";
import { audio, sampleProject } from "./fixtures.ts";

function withClips(): Project {
  let p = sampleProject();
  p = addClip(p, { id: "c1", stopId: "a", assetId: "p1" });
  p = addClip(p, { id: "c2", stopId: "a", assetId: "v1" });
  p = addClip(p, { id: "c3", stopId: "b", assetId: "p2" });
  return p;
}
const ids = (p: Project, stopId: string) => p.clips.filter((c) => c.stopId === stopId).map((c) => c.id);

describe("addClip", () => {
  it("creates photo and video clips with defaults", () => {
    const p = withClips();
    expect(p.clips[0]).toMatchObject({ kind: "photo", durationUs: PHOTO_DURATION.default, fit: "contain" });
    expect(p.clips[1]).toMatchObject({ kind: "video", inUs: 0, outUs: seconds(10), volume: 1 });
  });

  it("inserts at a position within the stop", () => {
    const p = addClip(withClips(), { id: "c4", stopId: "a", assetId: "p2", position: 1 });
    expect(ids(p, "a")).toEqual(["c1", "c4", "c2"]);
  });

  it("rejects audio assets and unknown references", () => {
    const p = addAsset(withClips(), audio("m1"));
    expect(() => addClip(p, { id: "c9", stopId: "a", assetId: "m1" })).toThrow(DomainError);
    expect(() => addClip(p, { id: "c9", stopId: "zz", assetId: "p1" })).toThrow(/does not exist/);
  });
});

describe("moveClip and removeClip", () => {
  it("moves a clip to another stop at a position", () => {
    const p = moveClip(withClips(), "c2", "b", 0);
    expect(ids(p, "a")).toEqual(["c1"]);
    expect(ids(p, "b")).toEqual(["c2", "c3"]);
  });

  it("removes a clip", () => {
    expect(removeClip(withClips(), "c1").clips.map((c) => c.id)).toEqual(["c2", "c3"]);
  });
});

describe("photo duration", () => {
  it("snaps to 0.5 seconds and clamps to 1–15 seconds", () => {
    expect(normalizePhotoDuration(seconds(2.3))).toBe(seconds(2.5));
    expect(normalizePhotoDuration(seconds(0.2))).toBe(seconds(1));
    expect(normalizePhotoDuration(seconds(60))).toBe(seconds(15));
    const [clip] = setPhotoDuration(withClips(), "c1", seconds(4.9)).clips;
    expect(clip && clipDuration(clip)).toBe(seconds(5));
  });

  it("rejects a video clip", () => {
    expect(() => setPhotoDuration(withClips(), "c2", seconds(3))).toThrow(DomainError);
  });
});

describe("trimVideo", () => {
  const trimmed = (trim: { inUs?: number; outUs?: number }) => {
    const clip = trimVideo(withClips(), "c2", trim).clips[1];
    return clip?.kind === "video" ? [clip.inUs, clip.outUs] : [];
  };

  it("trims within the video length", () => {
    expect(trimmed({ inUs: seconds(2), outUs: seconds(7) })).toEqual([seconds(2), seconds(7)]);
    expect(trimmed({ inUs: seconds(-5), outUs: seconds(99) })).toEqual([0, seconds(10)]);
  });

  it("keeps the minimum length, yielding the dragged edge", () => {
    const p = trimVideo(withClips(), "c2", { outUs: seconds(5) });
    const dragIn = trimVideo(p, "c2", { inUs: seconds(9) }).clips[1];
    expect(dragIn?.kind === "video" && [dragIn.inUs, dragIn.outUs]).toEqual([seconds(4.5), seconds(5)]);
  });

  it("clamps volume and sets fit", () => {
    const p = setClipFit(setClipVolume(withClips(), "c2", 3), "c2", "cover");
    expect(p.clips[1]).toMatchObject({ volume: 1, fit: "cover" });
  });
});
