import {
  addStop,
  moveClip,
  seconds,
  setClipEnRoute,
  setClipNote,
  setDayNote,
  setStopTiming,
  setTheme,
  setTiming,
  updateStop,
} from "@tripreplay/domain";
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

const travels = (t: ReturnType<typeof compile>) => t.segments.filter((s) => s.kind === "travel");

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

describe("a stop's own lengths", () => {
  it("replaces the trip's lengths and the lengthening for text", () => {
    let project = updateStop(kyoto(), "a", { description: "很長的一段日記，".repeat(10) });
    project = setDayNote(project, "2026-04-03", "搭首班車前往嵐山");
    project = setStopTiming(project, "a", { titleUs: seconds(2) });
    project = setStopTiming(project, "c", { travelUs: seconds(1) });
    const timeline = compile(project);
    const length = (kind: string, stopIndex: number) => {
      const s = timeline.segments.find((x) => x.kind === kind && "stopIndex" in x && x.stopIndex === stopIndex);
      return (s?.endUs ?? 0) - (s?.startUs ?? 0);
    };
    expect(length("title", 0)).toBe(seconds(2));
    expect(length("travel", 2)).toBe(seconds(1));
    expect(timeline.stops[0]?.ownTitleUs).toBe(seconds(2));
    expect(timeline.stops[1]?.ownTitleUs).toBeUndefined();
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

describe("photos taken on the way", () => {
  /** Photo c2 of stop a moved to stop b and taken on the way there, at p2's location if given. */
  const onTheWay = (gps?: { lon: number; lat: number }) => {
    let p = moveClip(kyoto(), "c2", "b", 0);
    p = setClipEnRoute(p, "c2", true);
    if (gps) p = { ...p, assets: p.assets.map((a) => (a.id === "p2" ? { ...a, gps } : a)) };
    return p;
  };

  it("shows them on cards during the move instead of after the stop's title", () => {
    const timeline = compile(onTheWay());
    expect(timeline.segments.filter((s) => s.kind === "photo").map((s) => (s as MediaSegment).clipId)).toEqual(["c1"]);
    const travel = travels(timeline)[1];
    if (travel?.kind !== "travel") throw new Error("missing travel");
    const [photo] = travel.photos;
    expect(photo).toMatchObject({ clipId: "c2", assetId: "p2" });
    expect(photo?.at).toBeUndefined();
    if (!photo) throw new Error("missing photo");
    const card = renderAt(timeline, (photo.startUs + photo.endUs) / 2).overlays.find((o) => o.kind === "media");
    expect(card).toMatchObject({ clipId: "c2", mediaKind: "photo" });
    expect(card?.kind === "media" && card.frame.width).toBeLessThan(0.5);
    // The line alone before and after the photo.
    expect(renderAt(timeline, travel.startUs + 100_000).overlays.some((o) => o.kind === "media")).toBe(false);
    expect(renderAt(timeline, travel.endUs - 100_000).overlays.some((o) => o.kind === "media")).toBe(false);
  });

  it("lengthens a move that is too short for its photos", () => {
    const short = setTiming(onTheWay(), { travelUs: seconds(1) });
    const travel = travels(compile(short))[1];
    if (travel?.kind !== "travel") throw new Error("missing travel");
    expect(travel.endUs - travel.startUs).toBe(seconds(3) + 2 * seconds(0.5));
    expect(travel.photos[0]?.startUs).toBe(travel.startUs + seconds(0.5));
  });

  it("draws the line through where they were taken, reaching it while they are shown", () => {
    const timeline = compile(onTheWay({ lon: 135.75, lat: 35.1 }));
    expect(timeline.stops[1]?.via).toEqual([{ lon: 135.75, lat: 35.1 }]);
    const travel = travels(timeline)[1];
    if (travel?.kind !== "travel") throw new Error("missing travel");
    const photo = travel.photos[0];
    if (!photo?.at) throw new Error("missing location");
    expect(photo.at).toBeGreaterThan(0);
    expect(photo.at).toBeLessThan(1);
    const middle = renderAt(timeline, (photo.startUs + photo.endUs) / 2).route.progress;
    expect(middle).toBeCloseTo(photo.at);
    expect(renderAt(timeline, travel.endUs - 1).route.progress).toBeCloseTo(1, 3);
  });

  it("reaches each located photo in turn, never going back", () => {
    let p = moveClip(kyoto(), "c1", "b", 0);
    p = moveClip(p, "c2", "b", 1);
    p = setClipEnRoute(setClipEnRoute(p, "c1", true), "c2", true);
    const gps = { p1: { lon: 135.76, lat: 35.03 }, p2: { lon: 135.74, lat: 35.05 } } as const;
    p = { ...p, assets: p.assets.map((a) => (a.id in gps ? { ...a, gps: gps[a.id as keyof typeof gps] } : a)) };
    const timeline = compile(p);
    const travel = travels(timeline)[1];
    if (travel?.kind !== "travel") throw new Error("missing travel");
    const [first, second] = travel.photos;
    if (!first?.at || !second?.at) throw new Error("missing locations");
    expect(first.at).toBeLessThan(second.at);
    for (const photo of [first, second]) {
      expect(renderAt(timeline, (photo.startUs + photo.endUs) / 2).route.progress).toBeCloseTo(photo.at ?? -1);
    }
    let last = 0;
    for (let t = travel.startUs; t < travel.endUs; t += 50_000) {
      const progress = renderAt(timeline, t).route.progress;
      expect(progress).toBeGreaterThanOrEqual(last - 1e-9);
      last = progress;
    }
  });
});
