import { DomainError, renameTrip, seconds } from "@tripreplay/domain";
import { describe, expect, it } from "vitest";
import { applyCommand, type Command } from "../src/index.ts";
import { sampleProject, stop } from "./fakes.ts";

const photo = (id: string) =>
  ({
    kind: "photo",
    id,
    contentHash: id,
    fileName: `${id}.jpg`,
    mimeType: "image/jpeg",
    byteSize: 1,
    width: 4,
    height: 3,
    rotation: 0,
  }) as const;

describe("applyCommand", () => {
  it("applies the matching domain operation", () => {
    const project = sampleProject();
    expect(applyCommand(project, { type: "renameTrip", title: "Osaka" })).toEqual(renameTrip(project, "Osaka"));
  });

  it("adds several assets and clips as one command", () => {
    let p = applyCommand(sampleProject(), { type: "addAssets", assets: [photo("p1"), photo("p2")] });
    p = applyCommand(p, {
      type: "addClips",
      clips: [
        { id: "c1", stopId: "a", assetId: "p1" },
        { id: "c2", stopId: "a", assetId: "p2" },
      ],
    });
    expect(p.clips.map((c) => c.id)).toEqual(["c1", "c2"]);
  });

  it("passes optional trim edges through only when given", () => {
    const commands: Command[] = [
      {
        type: "addAssets",
        assets: [
          {
            ...photo("v"),
            kind: "video",
            durationUs: seconds(10),
            hasAudio: true,
          },
        ],
      },
      { type: "addClips", clips: [{ id: "c", stopId: "a", assetId: "v" }] },
      { type: "trimVideo", id: "c", outUs: seconds(6) },
      { type: "trimVideo", id: "c", inUs: seconds(2) },
    ];
    const p = commands.reduce(applyCommand, sampleProject());
    expect(p.clips[0]).toMatchObject({ inUs: seconds(2), outUs: seconds(6) });
  });

  it("covers stops, theme and music", () => {
    const commands: Command[] = [
      { type: "addStop", stop: stop("b", "2026-04-02") },
      { type: "moveStop", id: "b", date: "2026-04-01", position: 0 },
      { type: "setTheme", themeId: "night" },
      { type: "setAspectRatio", aspectRatio: "9:16" },
      {
        type: "addAssets",
        assets: [
          {
            kind: "audio",
            id: "m",
            contentHash: "m",
            fileName: "m.mp3",
            mimeType: "audio/mpeg",
            byteSize: 1,
            durationUs: seconds(60),
          },
        ],
      },
      { type: "addMusicTrack", id: "t", assetId: "m", startUs: seconds(5) },
      { type: "updateMusicSettings", id: "t", settings: { duckUnderClips: false } },
    ];
    const p = commands.reduce(applyCommand, sampleProject());
    expect(p.stops.map((s) => s.id)).toEqual(["b", "a"]);
    expect(p.trip).toMatchObject({ themeId: "night", aspectRatio: "9:16" });
    expect(p.music[0]).toMatchObject({ startUs: seconds(5), duckUnderClips: false });
  });

  it("throws DomainError for invalid commands", () => {
    expect(() => applyCommand(sampleProject(), { type: "removeStop", id: "missing" })).toThrow(DomainError);
  });
});
