import type { Command, Segment, Timeline } from "@tripreplay/app";
import type { MessageKey, Translate } from "@tripreplay/i18n";
import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { formatTime } from "./format-time.ts";
import styles from "./RecapPlayer.module.css";
import { type Phase, SegmentEditor, type TimelineSelection } from "./SegmentEditor.tsx";
import { type DragTarget, dragCommand, dragPreview } from "./timeline-drag.ts";

export interface TimelineStripsProps {
  readonly timeline: Timeline;
  readonly timeUs: number;
  readonly onSeek: (timeUs: number) => void;
  /** Applies a drag on the timeline as one command; without it the timeline cannot be edited. */
  readonly onEdit?: ((command: Command) => void) | undefined;
  readonly t: Translate;
}

interface Drag {
  readonly target: DragTarget;
  readonly startX: number;
  /** Microseconds per pixel when the drag started. */
  readonly scale: number;
  readonly deltaUs: number;
}

/** A pointer movement shorter than this is a click, not a drag. */
const CLICK_PX = 3;

const sameTarget = (drag: Drag | undefined, key: string) =>
  drag && ("clipId" in drag.target ? drag.target.clipId : drag.target.trackId) === key;

const PHASES: Readonly<Partial<Record<Segment["kind"], Phase>>> = {
  opening: "openingUs",
  travel: "travelUs",
  title: "titleUs",
  closing: "closingUs",
};

/** Seconds between the marks of the time scale: the smallest that keeps at most eight marks. */
const TICK_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];

export function tickStep(durationUs: number): number {
  const seconds = durationUs / 1_000_000;
  return TICK_STEPS.find((step) => seconds / step <= 8) ?? (TICK_STEPS.at(-1) as number);
}

/** Seconds of the recap that still fill the width of the timeline at the largest zoom. */
const MIN_VISIBLE_SECONDS = 5;

/** The largest zoom of a recap: doublings of the whole width, while at least five seconds stay in view. */
export function maxZoom(durationUs: number): number {
  let zoom = 1;
  while (durationUs / 1_000_000 / (zoom * 2) >= MIN_VISIBLE_SECONDS) zoom *= 2;
  return zoom;
}

/** The selection for the piece at a clicked element, from the data attributes the strips set. */
function selectionAt(element: Element | null): TimelineSelection | undefined {
  const piece = element?.closest<HTMLElement>("[data-clip],[data-phase],[data-track]");
  if (!piece) return undefined;
  const { clip, phase, track, start } = piece.dataset;
  if (clip) return { kind: "clip", clipId: clip };
  if (track) return { kind: "music", trackId: track };
  if (phase) return { kind: "phase", phase: phase as Phase, startUs: Number(start) };
  return undefined;
}

const isSelected = (selection: TimelineSelection | undefined, segment: Segment) =>
  selection !== undefined &&
  ((selection.kind === "clip" && "clipId" in segment && segment.clipId === selection.clipId) ||
    (selection.kind === "phase" && selection.startUs === segment.startUs));

/**
 * The segments of the recap and the music under them, over a time scale (docs/ui-design.md §3.4).
 * A click moves the playhead and selects the piece, whose numbers then show below the strips;
 * dragging the edge of a photo changes its duration, the edges of a video trim it, and music is
 * moved by dragging it or trimmed at either end. Each change is one undoable command.
 */
export function TimelineStrips({ timeline, timeUs, onSeek, onEdit, t }: TimelineStripsProps) {
  const [drag, setDrag] = useState<Drag | undefined>();
  const [selection, setSelection] = useState<TimelineSelection | undefined>();
  const [zoomLevel, setZoom] = useState(1);
  const [view, setView] = useState({ left: 0, width: 1 });
  const viewport = useRef<HTMLDivElement>(null);
  const dragged = useRef(false);
  const total = timeline.durationUs || 1;
  const largest = maxZoom(timeline.durationUs);
  const zoom = Math.min(zoomLevel, largest);

  // The part of the timeline in view, as fractions of its whole width, for the overview below it.
  const measure = useCallback(() => {
    const box = viewport.current;
    if (box) setView({ left: box.scrollLeft / box.scrollWidth, width: box.clientWidth / box.scrollWidth });
  }, []);
  // A new zoom keeps the playhead where it was in view.
  const changeZoom = (next: number) => {
    const box = viewport.current;
    const clamped = Math.min(Math.max(next, 1), largest);
    if (!box || clamped === zoom) return;
    const offset = (timeUs / total) * box.scrollWidth - box.scrollLeft;
    setZoom(clamped);
    requestAnimationFrame(() => {
      box.scrollLeft = (timeUs / total) * box.scrollWidth - offset;
      measure();
    });
  };
  // While the recap plays, the timeline follows the playhead when it leaves the view.
  useLayoutEffect(() => {
    const box = viewport.current;
    if (!box || zoom === 1) return;
    const x = (timeUs / total) * box.scrollWidth;
    if (x < box.scrollLeft || x > box.scrollLeft + box.clientWidth) {
      box.scrollLeft = x - box.clientWidth * 0.1;
      measure();
    }
  }, [timeUs, total, zoom, measure]);
  useEffect(() => {
    const box = viewport.current;
    if (!box) return;
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [measure]);

  const start = (event: ReactPointerEvent<HTMLElement>, target: DragTarget) => {
    if (!onEdit || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    const row = event.currentTarget.closest("[data-row]") as HTMLElement;
    try {
      row.setPointerCapture(event.pointerId);
    } catch {
      // Not every pointer can be captured, for example a synthetic one; the drag still works over the row.
    }
    dragged.current = false;
    setDrag({ target, startX: event.clientX, scale: total / row.getBoundingClientRect().width, deltaUs: 0 });
  };
  const move = (event: ReactPointerEvent<HTMLElement>) => {
    if (!drag) return;
    if (Math.abs(event.clientX - drag.startX) > CLICK_PX) dragged.current = true;
    setDrag({ ...drag, deltaUs: (event.clientX - drag.startX) * drag.scale });
  };
  const end = () => {
    if (!drag) return;
    const command = dragged.current ? dragCommand(drag.target, drag.deltaUs) : undefined;
    setDrag(undefined);
    if (command) onEdit?.(command);
  };
  const seek = (event: ReactMouseEvent<HTMLElement>) => {
    // A drag ends with a click, which must not move the playhead.
    if (dragged.current) {
      dragged.current = false;
      return;
    }
    const box = event.currentTarget.getBoundingClientRect();
    onSeek(((event.clientX - box.left) / box.width) * total);
    if (onEdit) setSelection(selectionAt(event.target as Element));
  };
  const rowEvents = { onPointerMove: move, onPointerUp: end, onPointerCancel: end, onClick: seek };

  const name = (segment: Segment) => {
    const kind = t(`player.segment.${segment.kind}` as MessageKey);
    const stop = "stopIndex" in segment ? timeline.stops[segment.stopIndex]?.name : undefined;
    return stop ? `${kind} · ${stop}` : kind;
  };
  const handle = (side: "start" | "end", label: string, target: DragTarget) => (
    <span
      className={side === "start" ? styles.handleStart : styles.handleEnd}
      title={label}
      onPointerDown={(event) => start(event, target)}
    />
  );

  const percent = (us: number) => `${(us / total) * 100}%`;
  const musicEnd = timeline.durationUs;

  const step = tickStep(timeline.durationUs / zoom);
  // A tick right at the end would have its label cut off by the edge of the timeline.
  const ticks = Array.from(
    { length: Math.floor(timeline.durationUs / (step * 1_000_000)) + 1 },
    (_, i) => i * step,
  ).filter((second) => timeline.durationUs - second * 1_000_000 >= step * 400_000);
  const selectedName = (() => {
    if (!selection) return "";
    if (selection.kind === "music") return t("player.music");
    const segment = timeline.segments.find((s) =>
      selection.kind === "clip" ? "clipId" in s && s.clipId === selection.clipId : s.startUs === selection.startUs,
    );
    return segment ? name(segment) : "";
  })();

  // Dragging the window of the overview, or clicking beside it, scrolls the timeline.
  const scrollTo = (event: ReactPointerEvent<HTMLElement>, grabbed: number) => {
    const box = viewport.current;
    if (!box) return;
    const bar = event.currentTarget.getBoundingClientRect();
    box.scrollLeft = ((event.clientX - bar.left) / bar.width - grabbed) * box.scrollWidth;
    measure();
  };
  const overview = useRef<number | undefined>(undefined);

  return (
    <>
      {largest > 1 && (
        <div className={styles.zoom}>
          <button
            type="button"
            className={styles.zoomButton}
            aria-label={t("player.zoomOut")}
            title={t("player.zoomOut")}
            disabled={zoom <= 1}
            onClick={() => changeZoom(zoom / 2)}
          >
            −
          </button>
          <span className={styles.zoomLevel}>{t("player.zoomLevel", { zoom })}</span>
          <button
            type="button"
            className={styles.zoomButton}
            aria-label={t("player.zoomIn")}
            title={t("player.zoomIn")}
            disabled={zoom >= largest}
            onClick={() => changeZoom(zoom * 2)}
          >
            +
          </button>
        </div>
      )}
      {/* The position slider and the editor below are the accessible controls; the strips are a pointer shortcut. */}
      <div className={styles.viewport} ref={viewport} onScroll={measure} aria-hidden="true">
        <div className={styles.timeline} style={{ width: `${zoom * 100}%` }}>
          <div className={styles.scale}>
            {ticks.map((second) => (
              <span key={second} className={styles.tick} style={{ left: percent(second * 1_000_000) }}>
                {formatTime(second * 1_000_000)}
              </span>
            ))}
          </div>
          <div className={styles.strip} data-row="segments" {...rowEvents}>
            {timeline.segments.map((segment) => {
              const length = segment.endUs - segment.startUs;
              let grow = length;
              let handles: ReactNode = null;
              if (segment.kind === "photo" || segment.kind === "video") {
                if (sameTarget(drag, segment.clipId) && drag)
                  grow = length + dragPreview(drag.target, drag.deltaUs).lengthUs;
                if (onEdit && segment.kind === "photo") {
                  handles = handle("end", t("player.dragDuration"), {
                    kind: "photo",
                    clipId: segment.clipId,
                    durationUs: length,
                  });
                } else if (onEdit) {
                  const trim = { clipId: segment.clipId, lengthUs: length };
                  handles = (
                    <>
                      {handle("start", t("player.dragTrimStart"), {
                        kind: "videoIn",
                        inUs: segment.mediaInUs,
                        ...trim,
                      })}
                      {handle("end", t("player.dragTrimEnd"), {
                        kind: "videoOut",
                        outUs: segment.mediaInUs + length,
                        ...trim,
                      })}
                    </>
                  );
                }
              }
              return (
                <div
                  key={segment.startUs}
                  className={`${styles.segment} ${styles[segment.kind] ?? ""} ${isSelected(selection, segment) ? styles.selected : ""}`}
                  style={{ flexGrow: Math.max(grow, 1) }}
                  title={name(segment)}
                  {...("clipId" in segment
                    ? { "data-clip": segment.clipId }
                    : { "data-phase": PHASES[segment.kind], "data-start": segment.startUs })}
                >
                  {handles}
                </div>
              );
            })}
            <div className={styles.playhead} style={{ left: percent(timeUs) }} />
          </div>
          {timeline.music.length > 0 && (
            <div className={styles.music} data-row="music" title={t("player.music")} {...rowEvents}>
              {timeline.music.map((track) => {
                const length = track.endUs - track.startUs;
                const preview =
                  sameTarget(drag, track.trackId) && drag ? dragPreview(drag.target, drag.deltaUs) : undefined;
                const left = track.startUs + (preview?.startUs ?? 0);
                const width = length + (preview?.lengthUs ?? 0);
                const id = { trackId: track.trackId };
                return (
                  <div
                    key={track.trackId}
                    className={`${styles.track} ${onEdit ? styles.movable : ""} ${selection?.kind === "music" && selection.trackId === track.trackId ? styles.selected : ""}`}
                    data-track={track.trackId}
                    style={{ left: percent(left), width: percent(width) }}
                    title={onEdit ? t("player.dragMusic") : undefined}
                    onPointerDown={(event) => start(event, { kind: "music", startUs: track.startUs, ...id })}
                  >
                    {onEdit &&
                      handle("start", t("player.dragTrimStart"), {
                        kind: "musicIn",
                        inUs: track.inUs,
                        lengthUs: length,
                        ...id,
                      })}
                    {/* A track cut at the end of the recap is not trimmed here, so that its hidden end is kept. */}
                    {onEdit &&
                      track.endUs < musicEnd &&
                      handle("end", t("player.dragTrimEnd"), {
                        kind: "musicOut",
                        outUs: track.inUs + length,
                        lengthUs: length,
                        ...id,
                      })}
                  </div>
                );
              })}
              {timeline.music.some((track) => track.duckUnderClips) &&
                timeline.audibleClips.map((clip) => (
                  <div
                    key={clip.startUs}
                    className={styles.ducked}
                    style={{ left: percent(clip.startUs), width: percent(clip.endUs - clip.startUs) }}
                  />
                ))}
            </div>
          )}
        </div>
      </div>
      {zoom > 1 && (
        <div
          className={styles.overview}
          aria-hidden="true"
          onPointerDown={(event) => {
            const bar = event.currentTarget.getBoundingClientRect();
            const at = (event.clientX - bar.left) / bar.width;
            // Grabbing the window keeps the point under the pointer; elsewhere the window centers on it.
            overview.current = at >= view.left && at <= view.left + view.width ? at - view.left : view.width / 2;
            event.currentTarget.setPointerCapture?.(event.pointerId);
            scrollTo(event, overview.current);
          }}
          onPointerMove={(event) => {
            if (overview.current !== undefined) scrollTo(event, overview.current);
          }}
          onPointerUp={() => {
            overview.current = undefined;
          }}
          onPointerCancel={() => {
            overview.current = undefined;
          }}
        >
          <div className={styles.overviewHead} style={{ left: percent(timeUs) }} />
          <div
            className={styles.overviewWindow}
            style={{ left: `${view.left * 100}%`, width: `${view.width * 100}%` }}
          />
        </div>
      )}
      {onEdit && selection && (
        <SegmentEditor
          timeline={timeline}
          selection={selection}
          name={selectedName}
          onEdit={onEdit}
          onClose={() => setSelection(undefined)}
          t={t}
        />
      )}
    </>
  );
}
