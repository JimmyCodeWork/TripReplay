import { compile, renderAt, type Timeline } from "@tripreplay/timeline";
import { describe, expect, it } from "vitest";
import {
  type Canvas2D,
  createRecapRenderer,
  drawFrame,
  type MapLayer,
  type MapView,
  projectWithView,
  type RecapLabels,
  routePoints,
  wrapText,
} from "../src/index.ts";

type Project = Parameters<typeof compile>[0];

const stop = (id: string, date: string, lon: number, lat: number) => ({
  id,
  name: id,
  description: "",
  date,
  location: { lon, lat },
});

const project: Project = {
  trip: {
    id: "t",
    schemaVersion: 1,
    title: "Kyoto",
    timeZone: "Asia/Tokyo",
    themeId: "classic",
    aspectRatio: "16:9",
    revision: 0,
  },
  stops: [
    stop("Kyoto Station", "2026-04-01", 135.7588, 34.9858),
    stop("Kiyomizu-dera", "2026-04-01", 135.785, 34.9949),
    stop("Kinkaku-ji", "2026-04-02", 135.7292, 35.0394),
  ],
  clips: [],
  assets: [],
  music: [],
};

const labels: RecapLabels = {
  tripDates: (first, last) => `${first} – ${last}`,
  stopSubtitle: (date, day) => `Day ${day} · ${date}`,
  summary: (stops, days) => `${stops} stops · ${days} days`,
  attribution: "© OpenStreetMap",
};

/** Records the calls and the state at each drawing call, as a canvas would apply it. */
function recorder() {
  const calls: { name: string; args: unknown[]; alpha: number; fill: unknown; stroke: unknown }[] = [];
  const state = { globalAlpha: 1, fillStyle: "" as unknown, strokeStyle: "" as unknown };
  const stack: (typeof state)[] = [];
  const ctx = new Proxy(
    {
      ...state,
      lineWidth: 1,
      lineCap: "butt",
      lineJoin: "miter",
      font: "",
      textAlign: "start",
      textBaseline: "alphabetic",
      shadowColor: "",
      shadowBlur: 0,
    } as Record<string, unknown>,
    {
      get(target, key: string) {
        if (key in target) return target[key];
        // Every character is 10 pixels wide.
        if (key === "measureText") return (text: string) => ({ width: Array.from(text).length * 10 });
        if (key === "createLinearGradient" || key === "createRadialGradient") {
          return (...args: unknown[]) => {
            const gradient = {
              gradient: args,
              stops: [] as unknown[],
              addColorStop: (...stop: unknown[]) => gradient.stops.push(stop),
            };
            return gradient;
          };
        }
        return (...args: unknown[]) => {
          if (key === "save") stack.push({ ...(target as typeof state) });
          if (key === "restore") Object.assign(target, stack.pop());
          calls.push({
            name: key,
            args,
            alpha: target.globalAlpha as number,
            fill: target.fillStyle,
            stroke: target.strokeStyle,
          });
        };
      },
    },
  ) as unknown as Canvas2D;
  return { ctx, calls, texts: () => calls.filter((c) => c.name === "fillText").map((c) => c.args[0]) };
}

const WIDTH = 960;
const HEIGHT = 540;

function draw(timeline: Timeline, timeUs: number) {
  const { ctx, calls, texts } = recorder();
  const frame = renderAt(timeline, timeUs);
  const view: MapView = { center: frame.camera.center, zoom: frame.camera.zoom - 1, bearing: 0 };
  drawFrame(ctx, {
    timeline,
    frame,
    width: WIDTH,
    height: HEIGHT,
    project: projectWithView(view, WIDTH, HEIGHT),
    labels,
  });
  return { calls, texts: texts(), frame };
}

const timeline = compile(project);
const segment = (kind: string, stopIndex?: number) =>
  timeline.segments.find(
    (s) => s.kind === kind && (stopIndex === undefined || ("stopIndex" in s && s.stopIndex === stopIndex)),
  );

describe("routePoints", () => {
  const route = [
    { lon: 0, lat: 0 },
    { lon: 10, lat: 0 },
    { lon: 20, lat: 0 },
  ];
  const project = (p: { lon: number; lat: number }) => ({ x: p.lon, y: p.lat });

  it("draws nothing before the first leg and the whole route at the end", () => {
    expect(routePoints(route, 0, project)).toEqual([]);
    expect(routePoints(route, 2, project)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ]);
  });

  it("cuts the leg being travelled", () => {
    expect(routePoints(route, 1.5, project)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 15, y: 0 },
    ]);
  });
});

describe("drawFrame", () => {
  it("shows the trip title, its dates and every stop as upcoming during the opening", () => {
    const { calls, texts } = draw(timeline, 1_500_000);
    expect(texts).toEqual(["Kyoto", "2026-04-01 – 2026-04-02", "© OpenStreetMap"]);
    const markers = calls.filter((c) => c.name === "arc");
    expect(markers).toHaveLength(3);
    expect(calls.filter((c) => c.name === "fill").every((c) => c.fill === timeline.theme.marker.upcoming)).toBe(true);
    expect(calls.some((c) => c.name === "stroke" && c.stroke === timeline.theme.route.color)).toBe(false);
  });

  it("draws the route while travelling and the stop title with its day", () => {
    const travel = segment("travel", 1);
    const title = segment("title", 2);
    if (!travel || !title) throw new Error("missing segments");
    const during = draw(timeline, (travel.startUs + travel.endUs) / 2);
    expect(during.calls.some((c) => c.name === "stroke" && c.stroke === timeline.theme.route.color)).toBe(true);
    const settled = draw(timeline, (title.startUs + title.endUs) / 2);
    expect(settled.texts).toContain("Kinkaku-ji");
    expect(settled.texts).toContain("Day 2 · 2026-04-02");
  });

  it("shows a stop's journal under its title, on a dark glow below a rule", () => {
    const withJournal = compile({
      ...project,
      stops: project.stops.map((s, i) => (i === 2 ? { ...s, description: "金閣寺在雪中特別漂亮。" } : s)),
    });
    const title = withJournal.segments.find((s) => s.kind === "title" && s.stopIndex === 2);
    if (!title) throw new Error("missing segment");
    const { calls, texts } = draw(withJournal, (title.startUs + title.endUs) / 2);
    expect(texts).toContain("金閣寺在雪中特別漂亮。");
    const note = calls.find((c) => c.name === "fillText" && c.args[0] === "金閣寺在雪中特別漂亮。");
    expect(note?.fill).toBe(withJournal.theme.text.color);
    expect(note?.alpha).toBe(1);
    expect(calls.some((c) => c.name === "stroke" && c.stroke === withJournal.theme.text.color)).toBe(true);
    const band = (list: typeof calls) => list.some((c) => c.name === "fillRect" && typeof c.fill === "object");
    expect(band(calls)).toBe(true);
    // The lines rise into place one after another: none is shown as the title appears.
    const early = draw(withJournal, title.startUs + 100_000);
    expect(early.texts).not.toContain("金閣寺在雪中特別漂亮。");
    // Without a journal, the title has no glow.
    const plain = segment("title", 2);
    if (!plain) throw new Error("missing segment");
    expect(band(draw(timeline, (plain.startUs + plain.endUs) / 2).calls)).toBe(false);
  });

  it("shows the summary at the end", () => {
    expect(draw(timeline, timeline.durationUs).texts).toEqual(["Kyoto", "3 stops · 2 days", "© OpenStreetMap"]);
  });

  it("covers the scene with the background while a reduced-motion cut fades", () => {
    const reduced = compile(project, { reducedMotion: true });
    const travel = reduced.segments.find((s) => s.kind === "travel" && s.stopIndex === 1);
    if (!travel) throw new Error("missing segment");
    const { calls, frame } = draw(reduced, travel.startUs + (travel.endUs - travel.startUs) * 0.4);
    expect(frame.fade).toBeLessThan(1);
    const cover = calls.find((c) => c.name === "fillRect" && c.fill === reduced.theme.map.background);
    expect(cover?.alpha).toBeCloseTo(1 - frame.fade);
  });
});

describe("projectWithView", () => {
  it("puts the center in the middle, east to the right and north up", () => {
    const project = projectWithView({ center: { lon: 135, lat: 35 }, zoom: 10, bearing: 0 }, 800, 600);
    expect(project({ lon: 135, lat: 35 })).toEqual({ x: 400, y: 300 });
    const east = project({ lon: 135.01, lat: 35 });
    expect(east.x).toBeGreaterThan(400);
    expect(east.y).toBeCloseTo(300);
    expect(project({ lon: 135, lat: 35.01 }).y).toBeLessThan(300);
    // One degree of longitude is 512 * 2^10 / 360 pixels at zoom 10.
    expect(east.x - 400).toBeCloseTo((512 * 1024) / 36000, 6);
  });

  it("rotates by the bearing", () => {
    const project = projectWithView({ center: { lon: 0, lat: 0 }, zoom: 5, bearing: 90 }, 100, 100);
    const east = project({ lon: 1, lat: 0 });
    expect(east.x).toBeCloseTo(50);
    expect(east.y).toBeLessThan(50);
  });
});

describe("createRecapRenderer", () => {
  it("moves the map to each frame's camera and sizes the canvas in device pixels", () => {
    const views: MapView[] = [];
    let colorChanges = 0;
    const map: MapLayer = {
      resize: () => {},
      setColors: () => void colorChanges++,
      setView: (view) => void views.push(view),
      project: () => ({ x: 0, y: 0 }),
      whenDrawn: async () => {},
      destroy: () => {},
    };
    const canvas = { width: 0, height: 0 };
    const renderer = createRecapRenderer({ canvas, context: recorder().ctx, map, labels, pixelRatio: 2 });
    renderer.resize(WIDTH, HEIGHT);
    expect(canvas).toEqual({ width: 1920, height: 1080 });
    renderer.draw(timeline, renderAt(timeline, 0));
    renderer.draw(timeline, renderAt(timeline, timeline.durationUs));
    expect(views).toHaveLength(2);
    expect(views[0]?.zoom).toBeCloseTo(timeline.overview.zoom - 1);
    expect(colorChanges).toBe(1);
  });
});

describe("wrapText", () => {
  const measure = (text: string) => Array.from(text).length * 10;

  it("keeps short captions on one line", () => {
    expect(wrapText("Sunset", 100, measure)).toEqual(["Sunset"]);
  });

  it("breaks Chinese text between characters and Latin text between words", () => {
    expect(wrapText("早上的清水寺人還不多", 50, measure)).toEqual(["早上的清水", "寺人還不多"]);
    expect(wrapText("the light over the bay", 100, measure)).toEqual(["the light", "over the…"]);
  });

  it("keeps closing punctuation off the start of a line", () => {
    expect(wrapText("早上的清水，寺人還不多", 50, measure)).toEqual(["早上的清水，", "寺人還不多"]);
  });

  it("ends a cut caption with an ellipsis", () => {
    expect(wrapText("一二三四五六七八九十十一十二", 50, measure)).toEqual(["一二三四五", "六七八九…"]);
  });
});

describe("captions", () => {
  it("draws a clip's note on its picture once the card has appeared", () => {
    const timeline = compile(project);
    const frame = renderAt(timeline, 0);
    const card = {
      kind: "media" as const,
      mediaKind: "photo" as const,
      clipId: "c1",
      assetId: "p1",
      mediaTimeUs: 0,
      frame: { x: 0.2, y: 0.1, width: 0.6, height: 0.7 },
      scale: 1,
      progress: 0,
      caption: "早上的清水寺，人還不多。",
      shownUs: 2_000_000,
      opacity: 1,
    };
    const drawn = (overlay: typeof card) => {
      const { ctx, texts } = recorder();
      drawFrame(ctx, {
        timeline,
        frame: { ...frame, overlays: [overlay] },
        width: WIDTH,
        height: HEIGHT,
        project: () => ({ x: 0, y: 0 }),
        labels,
      });
      return texts();
    };
    expect(drawn(card)).toEqual(["早上的清水寺，人還不多。"]);
    expect(drawn({ ...card, shownUs: 0 })).toEqual([]);
  });
});
