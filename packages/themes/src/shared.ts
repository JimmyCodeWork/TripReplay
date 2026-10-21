import type { Layout, Timing, Typography } from "./model.ts";

const SECOND = 1_000_000;

export const FONT_STACK = 'system-ui, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';

export const DEFAULT_TIMING: Timing = {
  openingUs: 3 * SECOND,
  travelUs: 2 * SECOND,
  titleUs: 1 * SECOND,
  closingUs: 3 * SECOND,
  fadeUs: 0.3 * SECOND,
};

export const DEFAULT_TYPOGRAPHY: Typography = {
  fontFamily: FONT_STACK,
  titleWeight: 700,
  titleSize: 0.08,
  subtitleSize: 0.04,
  labelSize: 0.045,
  captionSize: 0.03,
};

export const LANDSCAPE_LAYOUT: Layout = {
  title: { x: 0.5, y: 0.4, align: "center" },
  subtitleGap: 0.075,
  mediaFrame: { x: 0.2, y: 0.12, width: 0.6, height: 0.72 },
  stopLabel: { x: 0.035, y: 0.08, align: "start" },
  attribution: { x: 0.99, y: 0.985, align: "end" },
};

export const PORTRAIT_LAYOUT: Layout = {
  title: { x: 0.5, y: 0.14, align: "center" },
  subtitleGap: 0.075,
  mediaFrame: { x: 0.06, y: 0.42, width: 0.88, height: 0.5 },
  stopLabel: { x: 0.5, y: 0.14, align: "center" },
  attribution: { x: 0.98, y: 0.99, align: "end" },
};
