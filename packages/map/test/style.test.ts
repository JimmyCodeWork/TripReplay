import { describe, expect, it } from "vitest";
import { baseMapStyle } from "../src/style.ts";

const colors = {
  background: "#000000",
  land: "#f2efe9",
  water: "#a8c8e8",
  park: "#cfe3c1",
  road: "#ffffff",
  roadMajor: "#f4c27a",
};
const sources = { base: "pmtiles://b", transportation: "pmtiles://t", divisions: "pmtiles://d" };

describe("baseMapStyle", () => {
  it("reads every theme from its source and uses the theme colors", () => {
    const style = baseMapStyle({ sources, colors });
    expect(style.sources).toEqual({
      base: { type: "vector", url: "pmtiles://b" },
      transportation: { type: "vector", url: "pmtiles://t" },
      divisions: { type: "vector", url: "pmtiles://d" },
    });
    const water = style.layers.find((layer) => layer.id === "water");
    expect(water?.type === "fill" && water.paint?.["fill-color"]).toBe(colors.water);
  });

  it("adds place labels only when glyphs are available", () => {
    expect(baseMapStyle({ sources, colors }).layers.some((layer) => layer.id === "place")).toBe(false);
    const style = baseMapStyle({ sources, colors, glyphs: "fonts/{fontstack}/{range}.pbf" });
    expect(style.glyphs).toBe("fonts/{fontstack}/{range}.pbf");
    expect(style.layers.at(-1)?.id).toBe("place");
  });
});
