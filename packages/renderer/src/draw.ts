import type { FrameDescription, Overlay, Timeline, TripTitleOverlay } from "@tripreplay/timeline";
import type { Canvas2D } from "./canvas.ts";
import type { LonLat, ScreenPoint } from "./map-layer.ts";

type IsoDate = TripTitleOverlay["lastDate"] & string;
type AssetId = Extract<Overlay, { kind: "media" }>["assetId"];

/** Texts the renderer shows, formatted by the presentation layer in the user's language. */
export interface RecapLabels {
  /** Dates of the trip under its title, for example "Apr 1 – 4, 2026". */
  tripDates(firstDate: IsoDate | null, lastDate: IsoDate | null): string;
  /** Day and date under a stop title, for example "Day 2 · Apr 2, 2026". */
  stopSubtitle(date: IsoDate, day: number): string;
  /** Counts under the trip title at the end, for example "5 stops · 3 days". */
  summary(stopCount: number, dayCount: number): string;
  /** The map data attribution, shown in every frame. */
  readonly attribution: string;
}

/** Provides the picture of a clip at a time (docs/architecture.md §4.2); undefined while it loads. */
export interface MediaSource<Image = unknown> {
  frame(
    assetId: AssetId,
    mediaTimeUs: number,
  ): { readonly image: Image; readonly width: number; readonly height: number } | undefined;
}

export interface DrawOptions<Image = unknown> {
  readonly timeline: Timeline;
  readonly frame: FrameDescription;
  /** Size of the drawing surface in CSS pixels. */
  readonly width: number;
  readonly height: number;
  /** Position of a coordinate on the surface, from the map layer. */
  readonly project: (point: LonLat) => ScreenPoint;
  readonly labels: RecapLabels;
  readonly media?: MediaSource<Image>;
}

const MARKER_RADIUS = 0.011;
const CURRENT_MARKER_RADIUS = 0.017;
const MARKER_OUTLINE = 0.004;
const ATTRIBUTION_SIZE = 0.6;
const PROGRESS_HEIGHT = 0.006;
/** Lines of a caption under a picture; longer captions end with an ellipsis. */
const CAPTION_LINES = 2;
/** Lines of a stop's journal excerpt under its title. */
const JOURNAL_LINES = 3;
const LINE_HEIGHT = 1.45;
/** Width of the accent bar beside a note, in fractions of the shorter frame side. */
const ACCENT_WIDTH = 0.005;
/** Width of the journal card under a stop title, in fractions of the frame width. */
const JOURNAL_WIDTH: Readonly<Record<Timeline["aspectRatio"], number>> = { "16:9": 0.56, "9:16": 0.84 };

/**
 * Breaks a caption into at most `maxLines` lines that fit `maxWidth`. Words stay whole where
 * there are spaces; Chinese and Japanese text, which has none, breaks between characters. Closing
 * punctuation never starts a line: it stays at the end of the line before, slightly past the
 * width. A cut last line ends with an ellipsis.
 */
/** Punctuation that must not start a line in Chinese, Japanese or English text. */
const CLOSING = /^[，。、．,.!?！？：:；;）)」』】〉》〕］}…ー～〜%％]$/u;

export function wrapText(
  text: string,
  maxWidth: number,
  measure: (text: string) => number,
  maxLines = CAPTION_LINES,
): string[] {
  const tokens =
    text
      .replace(/\s+/g, " ")
      .trim()
      .match(
        /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{P}]|[^\s\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{P}]+|\s/gu,
      ) ?? [];
  const lines: string[] = [];
  let line = "";
  for (const token of tokens) {
    const next = line + token;
    if (measure(next) <= maxWidth || line.trim() === "" || CLOSING.test(token)) {
      line = next;
      continue;
    }
    lines.push(line.trimEnd());
    line = token.trimStart();
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line.trim() !== "") lines.push(line.trimEnd());
  const shown = lines.slice(0, maxLines);
  if (shown.join("").replace(/\s/g, "").length < text.replace(/\s/g, "").length) {
    let last = shown.at(-1) ?? "";
    while (last.length > 0 && measure(`${last}…`) > maxWidth) last = Array.from(last).slice(0, -1).join("");
    shown[shown.length - 1] = `${last}…`;
  }
  return shown;
}

function lerpPoint(a: ScreenPoint, b: ScreenPoint, t: number): ScreenPoint {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** The route up to `progress` stops, cut inside the leg being travelled. Straight on the map. */
export function routePoints(
  route: readonly LonLat[],
  progress: number,
  project: (point: LonLat) => ScreenPoint,
): ScreenPoint[] {
  if (route.length < 2) return [];
  const reached = Math.min(route.length - 1, Math.max(0, progress));
  const whole = Math.floor(reached);
  const points = route.slice(0, whole + 1).map(project);
  const next = route[whole + 1];
  const last = points.at(-1);
  if (next && last && reached > whole) points.push(lerpPoint(last, project(next), reached - whole));
  return points.length > 1 ? points : [];
}

function drawRoute(ctx: Canvas2D, { timeline, frame, width, height, project }: DrawOptions): void {
  const points = routePoints(timeline.route, frame.route.progress, project);
  if (points.length === 0) return;
  const unit = Math.min(width, height);
  const { color, width: lineWidth, glow } = timeline.theme.route;
  const path = () => {
    ctx.beginPath();
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
  };
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (glow) {
    path();
    ctx.strokeStyle = glow;
    ctx.lineWidth = lineWidth * unit * 3;
    ctx.stroke();
  }
  path();
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth * unit;
  ctx.stroke();
  ctx.restore();
}

function drawMarkers(ctx: Canvas2D, { timeline, frame, width, height, project }: DrawOptions): void {
  const unit = Math.min(width, height);
  const style = timeline.theme.marker;
  ctx.save();
  for (const marker of frame.markers) {
    const { x, y } = project(marker.location);
    ctx.beginPath();
    ctx.arc(x, y, (marker.state === "current" ? CURRENT_MARKER_RADIUS : MARKER_RADIUS) * unit, 0, Math.PI * 2);
    ctx.fillStyle = marker.state === "upcoming" ? style.upcoming : style.visited;
    ctx.fill();
    ctx.strokeStyle = style.outline;
    ctx.lineWidth = MARKER_OUTLINE * unit;
    ctx.stroke();
  }
  ctx.restore();
}

function text(
  ctx: Canvas2D,
  options: DrawOptions,
  value: string,
  anchor: { x: number; y: number; align: "start" | "center" | "end" },
  size: number,
  weight: number,
  offsetY = 0,
): void {
  const { width, height, timeline } = options;
  const unit = Math.min(width, height);
  const { typography, text: style } = timeline.theme;
  ctx.font = `${weight} ${Math.round(size * unit)}px ${typography.fontFamily}`;
  ctx.textAlign = anchor.align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = style.color;
  ctx.shadowColor = style.shadow;
  ctx.shadowBlur = size * unit * 0.3;
  ctx.fillText(value, anchor.x * width, anchor.y * height + offsetY * height);
}

/** Height of a note of `lines` lines at `size`, for laying it out. */
const noteHeight = (lines: number, size: number) => lines * size * LINE_HEIGHT;

/** Width in pixels of the accent bar beside a note, and the indent of its text. */
function accent(unit: number, size: number): { bar: number; indent: number } {
  const bar = Math.max(2, ACCENT_WIDTH * unit);
  return { bar, indent: bar + size * 0.7 };
}

/**
 * A note set like a journal: left-aligned lines beside an accent bar in the route's color, which
 * ties it to the trip. `at` is the top left corner of the bar.
 */
function drawNote(
  ctx: Canvas2D,
  lines: readonly string[],
  at: { x: number; y: number },
  size: number,
  unit: number,
  colors: { readonly text: string; readonly accent: string },
): void {
  const { bar, indent } = accent(unit, size);
  ctx.shadowBlur = 0;
  ctx.fillStyle = colors.accent;
  ctx.beginPath();
  ctx.roundRect(at.x, at.y, bar, noteHeight(lines.length, size), bar / 2);
  ctx.fill();
  ctx.fillStyle = colors.text;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  lines.forEach((line, i) => {
    ctx.fillText(line, at.x + indent, at.y + size * LINE_HEIGHT * (i + 0.5));
  });
}

/**
 * The start of a stop's journal entry under its title, on a card like the media cards, so that it
 * reads well over any map.
 */
function drawJournal(ctx: Canvas2D, options: DrawOptions, journal: string): void {
  const { width, height, timeline } = options;
  const unit = Math.min(width, height);
  const layout = timeline.theme.layouts[timeline.aspectRatio];
  const { card, typography, route } = timeline.theme;
  const size = typography.captionSize * unit * 1.1;
  const padding = size * 0.9;
  const cardWidth = JOURNAL_WIDTH[timeline.aspectRatio] * width;
  const textWidth = cardWidth - padding * 2 - accent(unit, size).indent;
  ctx.font = `400 ${Math.round(size)}px ${typography.fontFamily}`;
  const lines = wrapText(journal, textWidth, (t) => ctx.measureText(t).width, JOURNAL_LINES);
  if (lines.length === 0) return;
  const cardHeight = noteHeight(lines.length, size) + padding * 2;
  const x = layout.title.x * width - cardWidth / 2;
  const y = (layout.title.y + layout.subtitleGap) * height + typography.subtitleSize * unit * 1.2;
  ctx.save();
  ctx.shadowColor = card.shadow;
  ctx.shadowBlur = unit * 0.03;
  ctx.fillStyle = card.background;
  ctx.beginPath();
  ctx.roundRect(x, y, cardWidth, cardHeight, card.radius * unit);
  ctx.fill();
  ctx.restore();
  drawNote(ctx, lines, { x: x + padding, y: y + padding }, size, unit, { text: card.caption, accent: route.color });
}

function drawMedia(ctx: Canvas2D, options: DrawOptions, overlay: Extract<Overlay, { kind: "media" }>): void {
  const { width, height, timeline, media } = options;
  const unit = Math.min(width, height);
  const card = timeline.theme.card;
  const x = overlay.frame.x * width;
  const y = overlay.frame.y * height;
  const w = overlay.frame.width * width;
  const h = overlay.frame.height * height;
  const captionSize = timeline.theme.typography.captionSize * unit;
  const padding = captionSize * 0.8;
  const { indent } = accent(unit, captionSize);
  ctx.font = `400 ${Math.round(captionSize)}px ${timeline.theme.typography.fontFamily}`;
  const lines = overlay.caption
    ? wrapText(overlay.caption, w - padding * 2 - indent, (t) => ctx.measureText(t).width)
    : [];
  // The caption takes a band at the bottom of the card; the picture fits above it.
  const band = lines.length > 0 ? noteHeight(lines.length, captionSize) + padding * 2 : 0;
  const ih = h - band;
  ctx.save();
  ctx.shadowColor = card.shadow;
  ctx.shadowBlur = unit * 0.03;
  ctx.fillStyle = card.background;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, card.radius * unit);
  ctx.fill();
  ctx.restore();
  const picture = media?.frame(overlay.assetId, overlay.mediaTimeUs);
  if (picture) {
    // Fits the picture inside the card, then pushes in by `scale` around the center.
    const fit = Math.min(w / picture.width, ih / picture.height) * overlay.scale;
    const pw = picture.width * fit;
    const ph = picture.height * fit;
    ctx.save();
    ctx.beginPath();
    if (band > 0) ctx.rect(x, y, w, ih);
    else ctx.roundRect(x, y, w, h, card.radius * unit);
    ctx.clip();
    ctx.drawImage(picture.image, x + (w - pw) / 2, y + (ih - ph) / 2, pw, ph);
    ctx.restore();
  }
  if (lines.length > 0) {
    drawNote(ctx, lines, { x: x + padding, y: y + ih + padding }, captionSize, unit, {
      text: card.caption,
      accent: timeline.theme.route.color,
    });
  }
  if (overlay.mediaKind === "video") {
    ctx.fillStyle = timeline.theme.route.color;
    ctx.fillRect(x, y + ih - PROGRESS_HEIGHT * unit, w * overlay.progress, PROGRESS_HEIGHT * unit);
  }
}

function drawOverlay(ctx: Canvas2D, options: DrawOptions, overlay: Overlay): void {
  const { timeline, labels } = options;
  const layout = timeline.theme.layouts[timeline.aspectRatio];
  const type = timeline.theme.typography;
  ctx.save();
  ctx.globalAlpha = overlay.opacity;
  switch (overlay.kind) {
    case "tripTitle":
      text(ctx, options, overlay.title, layout.title, type.titleSize, type.titleWeight);
      text(
        ctx,
        options,
        labels.tripDates(overlay.firstDate, overlay.lastDate),
        layout.title,
        type.subtitleSize,
        400,
        layout.subtitleGap,
      );
      break;
    case "stopTitle":
      text(ctx, options, overlay.name, layout.title, type.titleSize, type.titleWeight);
      text(
        ctx,
        options,
        labels.stopSubtitle(overlay.date, overlay.day),
        layout.title,
        type.subtitleSize,
        400,
        layout.subtitleGap,
      );
      if (overlay.journal) drawJournal(ctx, options, overlay.journal);
      break;
    case "stopLabel":
      text(ctx, options, overlay.name, layout.stopLabel, type.labelSize, type.titleWeight);
      break;
    case "summary":
      text(ctx, options, overlay.title, layout.title, type.titleSize, type.titleWeight);
      text(
        ctx,
        options,
        labels.summary(overlay.stopCount, overlay.dayCount),
        layout.title,
        type.subtitleSize,
        400,
        layout.subtitleGap,
      );
      break;
    case "media":
      drawMedia(ctx, options, overlay);
      break;
    case "attribution":
      text(ctx, options, labels.attribution, layout.attribution, type.captionSize * ATTRIBUTION_SIZE, 400);
      break;
  }
  ctx.restore();
}

/**
 * Draws everything of a frame above the base map: the route, the markers, the scene fade, and the
 * titles, media and attribution. The surface is cleared first; the base map is drawn below it by
 * the map layer, or the theme's background when no map is available.
 */
export function drawFrame(ctx: Canvas2D, options: DrawOptions, withoutMap = false): void {
  const { width, height, timeline, frame } = options;
  ctx.clearRect(0, 0, width, height);
  if (withoutMap) {
    ctx.fillStyle = timeline.theme.map.background;
    ctx.fillRect(0, 0, width, height);
  }
  drawRoute(ctx, options);
  drawMarkers(ctx, options);
  if (frame.fade < 1) {
    ctx.save();
    ctx.globalAlpha = 1 - frame.fade;
    ctx.fillStyle = timeline.theme.map.background;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
  for (const overlay of frame.overlays) drawOverlay(ctx, options, overlay);
}
