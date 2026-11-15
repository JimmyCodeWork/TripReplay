import { describe, expect, it } from "vitest";
import {
  compile,
  MAX_OVERVIEW_ZOOM,
  MIN_ZOOM,
  normalizeLon,
  REFERENCE_FRAME,
  renderAt,
  STOP_ZOOM,
  type Timeline,
  WORLD_SIZE,
} from "../src/index.ts";
import { frames, numbersIn, stop, withStops } from "./fixtures.ts";

describe("International Date Line", () => {
  // Suva, Fiji (178.44° E) → Apia, Samoa (171.76° W): about 13° apart across the Date Line.
  const timeline = compile(
    withStops([stop("suva", "2026-07-01", 178.44, -18.14), stop("apia", "2026-07-03", -171.76, -13.83)]),
  );

  it("unwraps the route so that the leg takes the short way", () => {
    expect(timeline.route[1]?.lon).toBeCloseTo(188.24);
    expect(timeline.stops[1]?.location.lon).toBeCloseTo(188.24);
  });

  it("frames the overview across the Date Line, not across the whole world", () => {
    expect(normalizeLon(timeline.overview.center.lon)).toBeCloseTo(-176.66, 1);
    expect(timeline.overview.zoom).toBeGreaterThan(4);
  });

  it("moves the camera continuously without passing the prime meridian", () => {
    const all = frames(timeline);
    for (let i = 1; i < all.length; i++) {
      const step = Math.abs((all[i]?.camera.center.lon ?? 0) - (all[i - 1]?.camera.center.lon ?? 0));
      expect(step).toBeLessThan(2);
    }
    for (const frame of all) expect(Math.abs(normalizeLon(frame.camera.center.lon))).toBeGreaterThan(160);
  });

  it("also takes the short way when travelling west across the line", () => {
    const west = compile(
      withStops([stop("apia", "2026-07-01", -171.76, -13.83), stop("suva", "2026-07-03", 178.44, -18.14)]),
    );
    expect(west.route[1]?.lon).toBeCloseTo(-181.56);
  });
});

describe("identical coordinates", () => {
  const timeline = compile(
    withStops([stop("a", "2026-01-01", 121.5654, 25.033), stop("b", "2026-01-01", 121.5654, 25.033)]),
  );

  it("keeps the camera still between stops at the same place", () => {
    const travel = timeline.segments.find((s) => s.kind === "travel" && s.stopIndex === 1);
    if (!travel) throw new Error("missing travel segment");
    const middle = renderAt(timeline, (travel.startUs + travel.endUs) / 2);
    expect(middle.camera.center.lon).toBeCloseTo(121.5654, 9);
    expect(middle.camera.center.lat).toBeCloseTo(25.033, 9);
    expect(middle.camera.zoom).toBeCloseTo(STOP_ZOOM, 9);
  });

  it("limits the overview zoom and produces only finite values", () => {
    expect(timeline.overview.zoom).toBe(MAX_OVERVIEW_ZOOM);
    for (const frame of frames(timeline)) expect(numbersIn(frame).every(Number.isFinite)).toBe(true);
  });

  it("handles a single stop and a trip without stops", () => {
    expect(compile(withStops([stop("a", "2026-01-01", 0, 0)])).overview.zoom).toBe(MAX_OVERVIEW_ZOOM);
    const empty = compile(withStops([]));
    expect(empty.overview.zoom).toBe(MIN_ZOOM);
    for (const frame of frames(empty, 5)) expect(numbersIn(frame).every(Number.isFinite)).toBe(true);
  });
});

describe("long distances", () => {
  // Taipei → Paris → New York.
  const timeline = compile(
    withStops([
      stop("tpe", "2026-05-01", 121.5654, 25.033),
      stop("par", "2026-05-05", 2.3522, 48.8566),
      stop("nyc", "2026-05-09", -74.006, 40.7128),
    ]),
  );

  it("pulls the camera back mid-way so that both ends are in view", () => {
    const travel = timeline.segments.find((s) => s.kind === "travel" && s.stopIndex === 1);
    if (!travel) throw new Error("missing travel segment");
    const middle = renderAt(timeline, (travel.startUs + travel.endUs) / 2);
    expect(middle.camera.zoom).toBeLessThan(4);
    expect(middle.camera.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
  });

  it("fits a multi-continent overview at a low but valid zoom", () => {
    expect(timeline.overview.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
    expect(timeline.overview.zoom).toBeLessThan(3);
  });
});

/** Whether every route point lies inside the overview's horizontal extent. */
function overviewShowsRoute(timeline: Timeline): boolean {
  const visible = (360 * REFERENCE_FRAME["16:9"].width) / (WORLD_SIZE * 2 ** timeline.overview.zoom);
  return timeline.route.every((p) => Math.abs(p.lon - timeline.overview.center.lon) <= visible / 2);
}

describe("overview", () => {
  it("frames every leg in the direction the route takes, not just the stops", () => {
    // Taipei → Apia → Paris: the last leg goes east over the Americas, although the smallest arc
    // containing the three stops runs west over Asia.
    const timeline = compile(
      withStops([
        stop("tpe", "2026-07-01", 121.5654, 25.033),
        stop("apw", "2026-07-05", -171.7514, -13.8333),
        stop("par", "2026-07-10", 2.3522, 48.8566),
      ]),
    );
    expect(timeline.route.map((p) => Math.round(p.lon))).toEqual([122, 188, 362]);
    expect(overviewShowsRoute(timeline)).toBe(true);
  });

  it("shows the widest view for a route around the world", () => {
    const timeline = compile(
      withStops([
        stop("a", "2026-01-01", 0, 0),
        stop("b", "2026-01-02", 120, 0),
        stop("c", "2026-01-03", -120, 0),
        stop("d", "2026-01-04", 0, 10),
      ]),
    );
    expect(timeline.route.at(-1)?.lon).toBe(360);
    expect(overviewShowsRoute(timeline)).toBe(true);
  });
});
