import type { Theme } from "../model.ts";
import { DEFAULT_TIMING, DEFAULT_TYPOGRAPHY, LANDSCAPE_LAYOUT, PORTRAIT_LAYOUT } from "../shared.ts";

/** Designed for 9:16: a large title at the top and media in the lower half. */
export const portrait: Theme = {
  id: "portrait",
  nameKey: "theme.portrait.name",
  descriptionKey: "theme.portrait.description",
  preferredAspectRatio: "9:16",
  map: {
    background: "#f3efe8",
    land: "#ebe5da",
    water: "#b5d6e6",
    park: "#d6e8c7",
    road: "#ffffff",
    roadMajor: "#fbf7ef",
  },
  route: { color: "#2b6cb0", width: 0.008, glow: null },
  marker: { visited: "#2b6cb0", upcoming: "#ffffffd9", outline: "#ffffff", label: "#ffffff" },
  text: { color: "#ffffff", shadow: "#0000008c" },
  card: { background: "#ffffff", caption: "#555555", shadow: "#00000059", radius: 0.02 },
  typography: { ...DEFAULT_TYPOGRAPHY, titleSize: 0.09, subtitleSize: 0.045 },
  layouts: { "16:9": LANDSCAPE_LAYOUT, "9:16": PORTRAIT_LAYOUT },
  timing: DEFAULT_TIMING,
};
