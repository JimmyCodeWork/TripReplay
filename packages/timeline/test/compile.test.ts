import { addStop, seconds, setClipNote, setTheme } from "@tripreplay/domain";
import { describe, expect, it } from "vitest";
import { compile, type MediaSegment, renderAt, TIMELINE_VERSION } from "../src/index.ts";
import { kyoto, stop, withStops } from "./fixtures.ts";

describe("compile", () => {
  it("lays out opening, travel, title, clips per stop and closing", () => {
    const timeline = compile(kyoto());
    expect(timeline.segments.map((s) => s.kind)).toEqual([
      "opening",
      "travel",
      "title",
      "photo",
      "photo",
      "video",
      "travel",
      "title",
      "travel",
      "title",
      "video",
      "closing",
    ]);
    expect(timeline.version).toBe(TIMELINE_VERSION);
  });

  it("makes segments contiguous, with lengths from the theme and the clips", () => {
    const { segments, durationUs } = compile(kyoto());
    expect(segments[0]?.startUs).toBe(0);
    for (let i = 1; i < segments.length; i++) expect(segments[i]?.startUs).toBe(segments[i - 1]?.endUs);
    // opening 3 + 3 × (travel 2 + title 1) + photos 3 + 3 + videos 4 + 2 + closing 3
    expect(durationUs).toBe(seconds(3 + 9 + 6 + 6 + 3));
    expect(segments.at(-1)?.endUs).toBe(durationUs);
  });

  it("numbers days from the first stop's date", () => {
    expect(compile(kyoto()).stops.map((s) => s.day)).toEqual([1, 1, 3]);
  });

  it("gives clip audio gain only to videos with sound", () => {
    const media = compile(kyoto()).segments.filter((s): s is MediaSegment => s.kind === "photo" || s.kind === "video");
    expect(media.map((s) => s.gain)).toEqual([0, 0, 1, 0]);
  });

  it("is deterministic and does not modify the project", () => {
    const project = kyoto();
    expect(compile(project)).toEqual(compile(project));
  });

  it("takes the aspect ratio from the settings or the trip, and falls back to the default theme", () => {
    const project = setTheme(kyoto(), "removed-theme");
    expect(compile(project).theme.id).toBe("classic");
    expect(compile(project).aspectRatio).toBe("16:9");
    expect(compile(project, { aspectRatio: "9:16" }).aspectRatio).toBe("9:16");
  });

  it("compiles a trip without stops to an opening and a closing", () => {
    const timeline = compile(withStops([]));
    expect(timeline.segments.map((s) => s.kind)).toEqual(["opening", "closing"]);
    expect(timeline.durationUs).toBe(seconds(6));
  });

  it("records the source revision", () => {
    const project = kyoto();
    const saved = { ...project, trip: { ...project.trip, revision: 7 } };
    expect(compile(saved).sourceRevision).toBe(7);
  });

  it("starts each stop's camera where the previous move ended", () => {
    const project = addStop(kyoto(), stop("d", "2026-04-04", 139.7, 35.68));
    const { segments } = compile(project);
    for (let i = 1; i < segments.length; i++) expect(segments[i]?.from).toEqual(segments[i - 1]?.to);
  });
});

describe("captions", () => {
  it("carries a clip's note to its media overlay, and an empty caption otherwise", () => {
    const timeline = compile(setClipNote(kyoto(), "c1", "朝の清水寺"));
    const media = timeline.segments.filter((s): s is MediaSegment => s.kind === "photo" || s.kind === "video");
    expect(media.map((s) => s.caption)).toEqual(["朝の清水寺", "", "", ""]);
    const first = media[0] as MediaSegment;
    const overlay = renderAt(timeline, (first.startUs + first.endUs) / 2).overlays.find((o) => o.kind === "media");
    expect(overlay).toMatchObject({ clipId: "c1", caption: "朝の清水寺" });
  });
});
