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
/** Line height of journal text, in its font size; generous, like a printed diary. */
const LINE_HEIGHT = 1.75;
/** Space between letters of journal text, in its font size. */
const LETTER_SPACING = 0.06;
/** Width of a stop's journal under its title, in fractions of the frame width. */
const JOURNAL_WIDTH: Readonly<Record<Timeline["aspectRatio"], number>> = { "16:9": 0.56, "9:16": 0.84 };
/** Width of the ornament between a stop's subtitle and its journal, in fractions of the shorter side. */
const ORNAMENT_WIDTH = 0.16;
/** The dark glow behind a stop title with a journal, and the shade under a caption on a picture. */
const SHADE = "rgba(8, 12, 10, 0.5)";
const SHADE_SOFT = "rgba(8, 12, 10, 0.28)";
const SHADE_CLEAR = "rgba(8, 12, 10, 0)";
const CAPTION_SHADE = "rgba(8, 12, 10, 0.62)";
/** Text on a picture, which is shaded dark under it whatever the theme. */
const ON_PICTURE = "#ffffff";

/**
 * When journal lines appear: the first after the title has faded in, then one after another, each
 * fading in over a while. A short title fits them all into its first half.
 */
const REVEAL = { delayUs: 300_000, staggerUs: 450_000, fadeUs: 700_000 } as const;
/** When a picture's caption appears, after its card. */
const CAPTION_REVEAL = { delayUs: 400_000, fadeUs: 800_000 } as const;

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

/** Opacity and rise of text that fades in from `startUs` over `fadeUs`, at `shownUs`. */
function reveal(shownUs: number, startUs: number, fadeUs: number, reducedMotion: boolean, size: number) {
  const t = Math.min(1, Math.max(0, (shownUs - startUs) / fadeUs));
  const eased = 1 - (1 - t) ** 3;
  return { alpha: eased, rise: reducedMotion ? 0 : (1 - eased) * size * 0.4 };
}

/** Sets the journal face at `size`, with its letter spacing, for measuring and drawing. */
function journalText(ctx: Canvas2D, size: number, fontFamily: string): void {
  ctx.font = `400 ${Math.round(size)}px ${fontFamily}`;
  ctx.letterSpacing = `${(size * LETTER_SPACING).toFixed(1)}px`;
}

interface JournalLayout {
  readonly lines: readonly string[];
  readonly size: number;
  readonly ornamentY: number;
  readonly firstLineY: number;
  /** The band behind the title and the journal. */
  readonly top: number;
  readonly bottom: number;
}

/** Where a stop's journal goes under its title, wrapped to at most three lines. */
function journalLayout(ctx: Canvas2D, options: DrawOptions, journal: string): JournalLayout | undefined {
  const { width, height, timeline } = options;
  const unit = Math.min(width, height);
  const layout = timeline.theme.layouts[timeline.aspectRatio];
  const typography = timeline.theme.typography;
  const size = typography.captionSize * unit * 1.2;
  // Measured in the journal's face, which the title drawn next must not keep.
  ctx.save();
  journalText(ctx, size, typography.journalFontFamily);
  const lines = wrapText(
    journal,
    JOURNAL_WIDTH[timeline.aspectRatio] * width,
    (t) => ctx.measureText(t).width,
    JOURNAL_LINES,
  );
  ctx.restore();
  if (lines.length === 0) return undefined;
  const ornamentY = (layout.title.y + layout.subtitleGap) * height + typography.subtitleSize * unit * 1.3;
  const firstLineY = ornamentY + size * 1.5;
  const titleTop = layout.title.y * height - typography.titleSize * unit * 0.7;
  return {
    lines,
    size,
    ornamentY,
    firstLineY,
    top: titleTop - size * 2.5,
    bottom: firstLineY + lines.length * size * LINE_HEIGHT + size * 2.5,
  };
}

/**
 * A soft dark glow behind a stop title and its journal, fading out in every direction, so that they
 * read over any map without hiding it.
 */
function drawGlow(ctx: Canvas2D, options: DrawOptions, placed: JournalLayout): void {
  const { width, height, timeline } = options;
  const x = timeline.theme.layouts[timeline.aspectRatio].title.x * width;
  const y = (placed.top + placed.bottom) / 2;
  const radius = Math.max(JOURNAL_WIDTH[timeline.aspectRatio] * width * 0.7, (placed.bottom - placed.top) * 0.75);
  const shade = ctx.createRadialGradient(x, y, 0, x, y, radius);
  shade.addColorStop(0, SHADE);
  shade.addColorStop(0.55, SHADE_SOFT);
  shade.addColorStop(1, SHADE_CLEAR);
  ctx.save();
  ctx.shadowBlur = 0;
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/**
 * A stop's journal under its title, set like a page of a diary: a fine rule with a diamond in the
 * route's color, then centered serif lines that rise into place one after another.
 */
function drawJournal(
  ctx: Canvas2D,
  options: DrawOptions,
  overlay: Extract<Overlay, { kind: "stopTitle" }>,
  placed: JournalLayout,
): void {
  const { width, height, timeline } = options;
  const unit = Math.min(width, height);
  const { typography, text: style, route } = timeline.theme;
  const reduced = timeline.reducedMotion;
  const { lines, size } = placed;
  const x = timeline.theme.layouts[timeline.aspectRatio].title.x * width;
  const base = ctx.globalAlpha;
  // A short title shows every line in its first half.
  const whole = REVEAL.delayUs + (lines.length - 1) * REVEAL.staggerUs + REVEAL.fadeUs;
  const pace = Math.min(1, (overlay.lengthUs * 0.5) / whole);

  const rule = reveal(overlay.shownUs, 0, REVEAL.delayUs + REVEAL.fadeUs, reduced, size);
  const half = ((ORNAMENT_WIDTH * unit) / 2) * (reduced ? 1 : rule.alpha);
  // The stop's own marker usually sits where the rule goes; the rule then parts around it instead
  // of a diamond.
  const current = options.frame.markers.find((m) => m.state === "current");
  const pin = current ? options.project(current.location) : undefined;
  const onRule = pin !== undefined && Math.abs(pin.x - x) < size && Math.abs(pin.y - placed.ornamentY) < size * 1.5;
  const gap = onRule ? CURRENT_MARKER_RADIUS * unit + size * 0.45 : size * 0.55;
  const y = onRule ? pin.y : placed.ornamentY;
  ctx.shadowBlur = 0;
  ctx.globalAlpha = base * rule.alpha * 0.75;
  ctx.strokeStyle = style.color;
  ctx.lineWidth = Math.max(1, unit * 0.0018);
  ctx.beginPath();
  if (half > gap) {
    ctx.moveTo(x - half, y);
    ctx.lineTo(x - gap, y);
    ctx.moveTo(x + gap, y);
    ctx.lineTo(x + half, y);
  }
  ctx.stroke();
  if (!onRule) {
    const d = size * 0.2;
    ctx.globalAlpha = base * rule.alpha;
    ctx.fillStyle = route.color;
    ctx.beginPath();
    ctx.moveTo(x, y - d);
    ctx.lineTo(x + d, y);
    ctx.lineTo(x, y + d);
    ctx.lineTo(x - d, y);
    ctx.fill();
  }

  journalText(ctx, size, typography.journalFontFamily);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = style.color;
  ctx.shadowColor = style.shadow;
  ctx.shadowBlur = size * 0.5;
  lines.forEach((line, i) => {
    const shown = reveal(
      overlay.shownUs,
      (REVEAL.delayUs + i * REVEAL.staggerUs) * pace,
      REVEAL.fadeUs * pace,
      reduced,
      size,
    );
    if (shown.alpha <= 0) return;
    ctx.globalAlpha = base * shown.alpha;
    ctx.fillText(line, x, placed.firstLineY + size * LINE_HEIGHT * (i + 0.5) + shown.rise);
  });
  ctx.globalAlpha = base;
}

/**
 * A picture's note over the bottom of the picture, on a shade that deepens downwards, in the
 * journal's serif; it rises into place shortly after the card appears.
 */
function drawCaption(
  ctx: Canvas2D,
  options: DrawOptions,
  overlay: Extract<Overlay, { kind: "media" }>,
  area: { x: number; y: number; width: number; height: number },
): void {
  const { width, height, timeline } = options;
  const unit = Math.min(width, height);
  const size = timeline.theme.typography.captionSize * unit * 1.05;
  const padding = size * 1.1;
  journalText(ctx, size, timeline.theme.typography.journalFontFamily);
  const lines = wrapText(overlay.caption, area.width - padding * 2, (t) => ctx.measureText(t).width);
  if (lines.length === 0) return;
  const bottom = area.y + area.height;
  const textTop = bottom - padding - lines.length * size * LINE_HEIGHT;
  const shadeTop = Math.max(area.y, textTop - padding * 2.5);
  const shade = ctx.createLinearGradient(0, shadeTop, 0, bottom);
  shade.addColorStop(0, SHADE_CLEAR);
  shade.addColorStop(1, CAPTION_SHADE);
  ctx.shadowBlur = 0;
  ctx.fillStyle = shade;
  ctx.fillRect(area.x, shadeTop, area.width, bottom - shadeTop);
  const shown = reveal(overlay.shownUs, CAPTION_REVEAL.delayUs, CAPTION_REVEAL.fadeUs, timeline.reducedMotion, size);
  if (shown.alpha <= 0) return;
  const base = ctx.globalAlpha;
  ctx.globalAlpha = base * shown.alpha;
  ctx.fillStyle = ON_PICTURE;
  ctx.shadowColor = SHADE;
  ctx.shadowBlur = size * 0.4;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((line, i) => {
    ctx.fillText(line, area.x + area.width / 2, textTop + size * LINE_HEIGHT * (i + 0.5) + shown.rise);
  });
  ctx.globalAlpha = base;
}

function drawMedia(ctx: Canvas2D, options: DrawOptions, overlay: Extract<Overlay, { kind: "media" }>): void {
  const { width, height, timeline, media } = options;
  const unit = Math.min(width, height);
  const card = timeline.theme.card;
  const x = overlay.frame.x * width;
  const y = overlay.frame.y * height;
  const w = overlay.frame.width * width;
  const h = overlay.frame.height * height;
  const radius = card.radius * unit;
  ctx.save();
  ctx.shadowColor = card.shadow;
  ctx.shadowBlur = unit * 0.03;
  ctx.fillStyle = card.background;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.clip();
  // The caption lies on the part of the picture in view, or on the card while the picture loads.
  let area = { x, y, width: w, height: h };
  const picture = media?.frame(overlay.assetId, overlay.mediaTimeUs);
  if (picture) {
    // Fits the picture inside the card, then pushes in by `scale` around the center.
    const fit = Math.min(w / picture.width, h / picture.height) * overlay.scale;
    const pw = picture.width * fit;
    const ph = picture.height * fit;
    const px = x + (w - pw) / 2;
    const py = y + (h - ph) / 2;
    ctx.drawImage(picture.image, px, py, pw, ph);
    const left = Math.max(x, px);
    const top = Math.max(y, py);
    area = { x: left, y: top, width: Math.min(x + w, px + pw) - left, height: Math.min(y + h, py + ph) - top };
  }
  if (overlay.caption) drawCaption(ctx, options, overlay, area);
  ctx.restore();
  if (overlay.mediaKind === "video") {
    ctx.fillStyle = timeline.theme.route.color;
    ctx.fillRect(x, y + h - PROGRESS_HEIGHT * unit, w * overlay.progress, PROGRESS_HEIGHT * unit);
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
    case "stopTitle": {
      const placed = overlay.journal ? journalLayout(ctx, options, overlay.journal) : undefined;
      if (placed) drawGlow(ctx, options, placed);
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
      if (placed) drawJournal(ctx, options, overlay, placed);
      break;
    }
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
