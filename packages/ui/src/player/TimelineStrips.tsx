import type { Command, Segment, Timeline } from "@tripreplay/app";
import type { MessageKey, Translate } from "@tripreplay/i18n";
import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
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
  const dragged = useRef(false);
  const total = timeline.durationUs || 1;

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

  const step = tickStep(timeline.durationUs);
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

  return (
    <>
      {/* The position slider and the editor below are the accessible controls; the strips are a pointer shortcut. */}
      <div className={styles.timeline} aria-hidden="true">
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
                    {handle("start", t("player.dragTrimStart"), { kind: "videoIn", inUs: segment.mediaInUs, ...trim })}
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
