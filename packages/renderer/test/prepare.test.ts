import { compile } from "@tripreplay/timeline";
import { describe, expect, it } from "vitest";
import { prepareViews } from "../src/index.ts";

type Project = Parameters<typeof compile>[0];

const stop = (id: string, date: string, lon: number, lat: number) => ({
  id,
  name: id,
  description: "",
  date,
  location: { lon, lat },
});

/** Taoyuan Airport to Fukuoka Airport, about 1300 km apart. */
const project: Project = {
  trip: {
    id: "t",
    schemaVersion: 1,
    title: "Fukuoka",
    timeZone: "Asia/Taipei",
    themeId: "classic",
    aspectRatio: "16:9",
    revision: 0,
  },
  stops: [
    stop("Taoyuan Airport", "2026-04-01", 121.2332, 25.0777),
    stop("Fukuoka Airport", "2026-04-01", 130.4513, 33.5859),
  ],
  clips: [],
  assets: [],
  music: [],
};
const timeline = compile(project);

describe("prepareViews", () => {
  it("lists each distinct view of the path once, from a time on", () => {
    const views = prepareViews(timeline, 0, 960);
    expect(views.length).toBeGreaterThan(10);
    const keys = views.map(({ view }) => `${view.center.lon} ${view.center.lat} ${view.zoom}`);
    for (let i = 1; i < keys.length; i++) expect(keys[i]).not.toBe(keys[i - 1]);
    expect(views.every((view) => view.near)).toBe(true);
    expect(prepareViews(timeline, timeline.durationUs / 2, 960).length).toBeLessThan(views.length);
  });

  it("marks the views far from every stop, such as the flight between them", () => {
    const views = prepareViews(timeline, 0, 960, { nearKm: 50 });
    const far = views.filter((view) => !view.near);
    expect(far.length).toBeGreaterThan(0);
    expect(views.some((view) => view.near)).toBe(true);
    // Between the airports, the camera's centre is hundreds of kilometres from both.
    expect(far.some(({ view }) => view.center.lon > 124 && view.center.lon < 128)).toBe(true);
  });
});
