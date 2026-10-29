import { describe, expect, it } from "vitest";
import { mapView } from "../src/index.ts";

describe("mapView", () => {
  const camera = { center: { lon: 135.77, lat: 35.01 }, zoom: 13, bearing: 0 };

  it("keeps the zoom at the reference width", () => {
    expect(mapView(camera, 1920, "16:9").zoom).toBe(13);
    expect(mapView(camera, 1080, "9:16").zoom).toBe(13);
  });

  it("zooms out by one level at half the reference width", () => {
    expect(mapView(camera, 960, "16:9")).toEqual({ center: camera.center, zoom: 12, bearing: 0 });
  });
});
