import { describe, expect, it } from "vitest";
import { compile, MAX_OVERVIEW_ZOOM, MIN_ZOOM, normalizeLon, renderAt, STOP_ZOOM } from "../src/index.ts";
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
