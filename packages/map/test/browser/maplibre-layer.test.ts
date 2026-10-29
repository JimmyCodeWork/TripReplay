import { afterEach, describe, expect, it } from "vitest";
import { Compression, createMapLibreLayer, type MapLibreLayer, TileType } from "../../src/index.ts";
import { buildArchive } from "../support/archive.ts";
import { polygonTile, WEST_HALF } from "../support/mvt.ts";

const colors = {
  background: "#000000",
  land: "#f0e6d2",
  water: "#3366cc",
  park: "#88aa66",
  road: "#ffffff",
  roadMajor: "#ffcc00",
} as const;

const info = {
  tileType: TileType.mvt,
  tileCompression: Compression.none,
  minZoom: 0,
  maxZoom: 0,
  bounds: [-180, -85, 180, 85],
  center: [0, 0, 0],
  metadata: {},
} as const;

/** A region whose base map is water in the western hemisphere and land in the eastern one. */
function files() {
  const archive = (tile?: Uint8Array) =>
    new Blob([buildArchive(new Map(tile ? [[0, tile]] : []), info) as Uint8Array<ArrayBuffer>]);
  return { base: archive(polygonTile("water", [WEST_HALF])), transportation: archive(), divisions: archive() };
}

function pixel(canvas: HTMLCanvasElement, x: number, y: number): string {
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  const context = copy.getContext("2d") as CanvasRenderingContext2D;
  context.drawImage(canvas, 0, 0);
  const [r, g, b] = context.getImageData(x, y, 1, 1).data;
  return `#${[r, g, b].map((v) => (v ?? 0).toString(16).padStart(2, "0")).join("")}`;
}

let layer: MapLibreLayer | undefined;
let container: HTMLElement | undefined;

afterEach(() => {
  layer?.destroy();
  container?.remove();
});

async function create() {
  container = document.createElement("div");
  document.body.append(container);
  layer = await createMapLibreLayer({ container, files: files(), colors, pixelRatio: 1, readable: true });
  layer.resize(400, 200);
  return layer;
}

describe("MapLibre layer", () => {
  it("draws the base map from files on the device", async () => {
    const map = await create();
    map.setView({ center: { lon: 0, lat: 0 }, zoom: 0.5, bearing: 0 });
    await map.whenDrawn();
    expect(map.canvas.width).toBe(400);
    expect(pixel(map.canvas, 100, 100)).toBe(colors.water);
    expect(pixel(map.canvas, 300, 100)).toBe(colors.land);
  });

  it("follows the view and projects coordinates onto the surface", async () => {
    const map = await create();
    map.setView({ center: { lon: 90, lat: 0 }, zoom: 1, bearing: 0 });
    await map.whenDrawn();
    expect(map.project({ lon: 90, lat: 0 })).toEqual({ x: 200, y: 100 });
    expect(pixel(map.canvas, 200, 100)).toBe(colors.land);
    map.setView({ center: { lon: -90, lat: 0 }, zoom: 1, bearing: 0 });
    await map.whenDrawn();
    expect(pixel(map.canvas, 200, 100)).toBe(colors.water);
  });

  it("changes colors without reloading the map", async () => {
    const map = await create();
    map.setView({ center: { lon: -90, lat: 0 }, zoom: 1, bearing: 0 });
    map.setColors({ ...colors, water: "#008080" });
    await map.whenDrawn();
    expect(pixel(map.canvas, 200, 100)).toBe("#008080");
  });
});
