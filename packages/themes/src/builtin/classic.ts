import type { Theme } from "../model.ts";
import { DEFAULT_TIMING, DEFAULT_TYPOGRAPHY, LANDSCAPE_LAYOUT, PORTRAIT_LAYOUT } from "../shared.ts";

export const classic: Theme = {
  id: "classic",
  nameKey: "theme.classic.name",
  descriptionKey: "theme.classic.description",
  preferredAspectRatio: "16:9",
  map: {
    background: "#efe9df",
    land: "#e6dfd2",
    water: "#a8cfe3",
    park: "#cfe3bf",
    road: "#ffffff",
    roadMajor: "#fbf7ef",
  },
  route: { color: "#c8414f", width: 0.007, glow: null },
  marker: { visited: "#c8414f", upcoming: "#ffffffd9", outline: "#ffffff", label: "#ffffff" },
  text: { color: "#ffffff", shadow: "#0000008c" },
  card: { background: "#ffffff", caption: "#555555", shadow: "#00000059", radius: 0.02 },
  typography: DEFAULT_TYPOGRAPHY,
  layouts: { "16:9": LANDSCAPE_LAYOUT, "9:16": PORTRAIT_LAYOUT },
  timing: DEFAULT_TIMING,
};
