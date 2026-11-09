import { addStop, seconds, setClipNote, setDayNote, setTheme, setTiming, updateStop } from "@tripreplay/domain";
import { describe, expect, it } from "vitest";
import {
  compile,
  JOURNAL_EXCERPT,
  journalExcerpt,
  type MediaSegment,
  renderAt,
  TIMELINE_VERSION,
  titleLength,
} from "../src/index.ts";
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

  it("takes the trip's own phase lengths over the theme's", () => {
    const timeline = compile(
      setTiming(kyoto(), { openingUs: seconds(5), travelUs: seconds(4), closingUs: seconds(6) }),
    );
    const lengths = (kind: string) => timeline.segments.filter((s) => s.kind === kind).map((s) => s.endUs - s.startUs);
    expect(lengths("opening")).toEqual([seconds(5)]);
    expect(lengths("travel")).toEqual([seconds(4), seconds(4), seconds(4)]);
    expect(lengths("closing")).toEqual([seconds(6)]);
    expect(timeline.theme.timing.travelUs).toBe(seconds(4));
  });

  it("shows the start of a stop's journal under its title, long enough to read", () => {
    const entry = "清水寺的舞台看出去是一整片楓葉，人很多但值得。".repeat(6);
    const timeline = compile(updateStop(kyoto(), "a", { description: `${entry}\n\n後記` }));
    const stop = timeline.stops[0];
    expect(Array.from(stop?.journal ?? "")).toHaveLength(JOURNAL_EXCERPT + 1);
    expect(stop?.journal.endsWith("…")).toBe(true);
    const titles = timeline.segments.filter((s) => s.kind === "title").map((s) => s.endUs - s.startUs);
    // Stop a has a long entry: the title stays up to ten seconds; b and c keep the theme's second.
    expect(titles).toEqual([seconds(10), seconds(1), seconds(1)]);
    expect(titleLength(seconds(1), "短短一句")).toBe(seconds(1.5) + seconds(0.48));
    expect(titleLength(seconds(3), "短短一句")).toBe(seconds(3));
    expect(journalExcerpt("  第一行\n第二行  ")).toBe("第一行 第二行");
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

describe("day changes", () => {
  it("marks the travel to the first stop of a new day, deepest in its middle", () => {
    const timeline = compile(kyoto());
    const middle = (index: number) => {
      const travel = timeline.segments.filter((s) => s.kind === "travel")[index];
      if (!travel) throw new Error("missing segment");
      return { start: travel.startUs, middle: (travel.startUs + travel.endUs) / 2 };
    };
    const at = (us: number) => renderAt(timeline, us).overlays.find((o) => o.kind === "dayChange");
    // a and b are on the first day; c is two days later.
    expect(at(middle(1).middle)).toBeUndefined();
    expect(at(middle(2).middle)).toMatchObject({ day: 3, date: "2026-04-03", night: 1, opacity: 1 });
    expect(at(middle(2).start)?.opacity).toBe(0);
    // The first travel starts from the overview, not from a day before.
    expect(at(middle(0).middle)).toBeUndefined();
  });
});

describe("day lines", () => {
  it("carries a day's line to the travel to its first stop, long enough to read", () => {
    // c begins the third day; day 1 has a line too, shown on the way from the overview.
    let project = setDayNote(kyoto(), "2026-04-03", "搭首班車前往嵐山，十二個字");
    project = setDayNote(project, "2026-04-01", "出發");
    const timeline = compile(project);
    expect(timeline.stops.map((s) => s.dayNote)).toEqual(["出發", "", "搭首班車前往嵐山，十二個字"]);
    const travel = timeline.segments.filter((s) => s.kind === "travel");
    const length = (i: number) => (travel[i]?.endUs ?? 0) - (travel[i]?.startUs ?? 0);
    // Two seconds for the day, then about eight characters a second.
    expect(length(2)).toBe(seconds(2) + 13 * seconds(0.12));
    expect(length(1)).toBe(timeline.theme.timing.travelUs);
    const middle = (i: number) => ((travel[i]?.startUs ?? 0) + (travel[i]?.endUs ?? 0)) / 2;
    const at = (us: number) => renderAt(timeline, us).overlays.find((o) => o.kind === "dayChange");
    expect(at(middle(2))).toMatchObject({ day: 3, note: "搭首班車前往嵐山，十二個字" });
    expect(at(middle(0))).toMatchObject({ day: 1, note: "出發" });
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
