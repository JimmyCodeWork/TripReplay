import type { Command, Segment, Timeline } from "@tripreplay/app";
import type { MessageKey, Translate } from "@tripreplay/i18n";
import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useRef,
  useState,
} from "react";
import styles from "./RecapPlayer.module.css";
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

/**
 * The segments of the recap and the music under them (docs/ui-design.md §3.4). A click moves the
 * playhead; dragging the edge of a photo changes its duration, the edges of a video trim it, and
 * music is moved by dragging it or trimmed at either end. Each drag is one undoable command. The
 * position slider and the media and music tabs offer the same changes from the keyboard.
 */
export function TimelineStrips({ timeline, timeUs, onSeek, onEdit, t }: TimelineStripsProps) {
  const [drag, setDrag] = useState<Drag | undefined>();
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

  return (
    // The position slider is the accessible control; the strips are a pointer shortcut to it.
    <div className={styles.timeline} aria-hidden="true">
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
              className={`${styles.segment} ${styles[segment.kind] ?? ""}`}
              style={{ flexGrow: Math.max(grow, 1) }}
              title={name(segment)}
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
                className={onEdit ? `${styles.track} ${styles.movable}` : styles.track}
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
  );
}
