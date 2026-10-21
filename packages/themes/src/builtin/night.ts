import type { Theme } from "../model.ts";
import { DEFAULT_TIMING, DEFAULT_TYPOGRAPHY, LANDSCAPE_LAYOUT, PORTRAIT_LAYOUT } from "../shared.ts";

export const night: Theme = {
  id: "night",
  nameKey: "theme.night.name",
  descriptionKey: "theme.night.description",
  preferredAspectRatio: "16:9",
  map: {
    background: "#151b27",
    land: "#1a2130",
    water: "#1d3f58",
    park: "#1b3329",
    road: "#283247",
    roadMajor: "#33405a",
  },
  route: { color: "#ffd166", width: 0.007, glow: "#ffd166" },
  marker: { visited: "#ffd166", upcoming: "#ffffffd9", outline: "#ffffff", label: "#151b27" },
  text: { color: "#ffffff", shadow: "#000000cc" },
  card: { background: "#0f131b", caption: "#c9d1dc", shadow: "#00000080", radius: 0.02 },
  typography: DEFAULT_TYPOGRAPHY,
  layouts: { "16:9": LANDSCAPE_LAYOUT, "9:16": PORTRAIT_LAYOUT },
  timing: DEFAULT_TIMING,
};
