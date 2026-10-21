import { describe, expect, it } from "vitest";
import { addAsset, addClip, addMusicTrack, type Project, validateProject } from "../src/index.ts";
import { audio, sampleProject } from "./fixtures.ts";

function full(): Project {
  let p = addClip(sampleProject(), { id: "c1", stopId: "a", assetId: "p1" });
  p = addClip(p, { id: "c2", stopId: "b", assetId: "v1" });
  p = addAsset(p, audio("m1"));
  return addMusicTrack(p, { id: "t1", assetId: "m1" });
}

describe("validateProject", () => {
  it("accepts a project built by the operations", () => {
    expect(validateProject(full())).toEqual([]);
  });

  it.each<[string, (p: Project) => Project, string]>([
    ["empty title", (p) => ({ ...p, trip: { ...p.trip, title: "" } }), "trip.title"],
    ["bad time zone", (p) => ({ ...p, trip: { ...p.trip, timeZone: "Nowhere" } }), "trip.timeZone"],
    ["stops out of order", (p) => ({ ...p, stops: [...p.stops].reverse() }), "stops[1].date"],
    ["duplicate id", (p) => ({ ...p, stops: [...p.stops, ...p.stops.slice(0, 1)] }), "stops[3].id"],
    ["missing stop", (p) => ({ ...p, clips: p.clips.map((c) => ({ ...c, stopId: "zz" })) }), "clips[0].stopId"],
    ["kind mismatch", (p) => ({ ...p, clips: p.clips.map((c) => ({ ...c, assetId: "v1" })) }), "clips[0].assetId"],
    [
      "video trim outside asset",
      (p) => ({ ...p, clips: p.clips.map((c) => (c.kind === "video" ? { ...c, outUs: 99e6 } : c)) }),
      "clips[1]",
    ],
    ["fades too long", (p) => ({ ...p, music: p.music.map((m) => ({ ...m, fadeInUs: 1e12 })) }), "music[0]"],
  ])("reports %s", (_name, corrupt, path) => {
    expect(validateProject(corrupt(full())).map((i) => i.path)).toContain(path);
  });
});
