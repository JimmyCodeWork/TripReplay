import { type Command, PHASE_DURATION, PHOTO_DURATION, type Timeline } from "@tripreplay/app";
import type { Translate } from "@tripreplay/i18n";
import { type ReactNode, useId } from "react";
import { SecondsField } from "../controls/SecondsField.tsx";
import styles from "./RecapPlayer.module.css";

/** Lengths of the opening, travel, stop title and closing, set for the whole trip. */
export type Phase = "openingUs" | "travelUs" | "titleUs" | "closingUs";

/** What is selected on the timeline for editing with numbers. */
export type TimelineSelection =
  | { readonly kind: "clip"; readonly clipId: string }
  | { readonly kind: "phase"; readonly phase: Phase; readonly startUs: number }
  | { readonly kind: "music"; readonly trackId: string };

/** The longest video or music position a field accepts; the domain keeps the value in range. */
const LONGEST = 24 * 3600 * 1_000_000;

export interface SegmentEditorProps {
  readonly timeline: Timeline;
  readonly selection: TimelineSelection;
  /** The name of the selected piece, as on the timeline. */
  readonly name: string;
  readonly onEdit: (command: Command) => void;
  readonly onClose: () => void;
  readonly t: Translate;
}

/**
 * Numbers for the piece selected on the timeline (docs/ui-design.md §3.4): a photo's duration, a
 * video's trim, a music track's start, or the length of the opening, travel, stop titles or
 * closing for the whole trip. Each field is saved as one undoable change.
 */
export function SegmentEditor({ timeline, selection, name, onEdit, onClose, t }: SegmentEditorProps) {
  const headingId = useId();
  let fields: ReactNode = null;
  let range: { startUs: number; endUs: number } | undefined;

  if (selection.kind === "clip") {
    const segment = timeline.segments.find((s) => "clipId" in s && s.clipId === selection.clipId);
    if (!segment || (segment.kind !== "photo" && segment.kind !== "video")) return null;
    range = segment;
    const length = segment.endUs - segment.startUs;
    fields =
      segment.kind === "photo" ? (
        <SecondsField
          className={styles.field}
          label={t("media.duration")}
          value={length}
          min={PHOTO_DURATION.min}
          max={PHOTO_DURATION.max}
          step={PHOTO_DURATION.step / 1_000_000}
          onCommit={(durationUs) => onEdit({ type: "setPhotoDuration", id: segment.clipId, durationUs })}
        />
      ) : (
        <>
          <SecondsField
            className={styles.field}
            label={t("media.trimIn")}
            value={segment.mediaInUs}
            max={LONGEST}
            onCommit={(inUs) => onEdit({ type: "trimVideo", id: segment.clipId, inUs })}
          />
          <SecondsField
            className={styles.field}
            label={t("media.trimOut")}
            value={segment.mediaInUs + length}
            max={LONGEST}
            onCommit={(outUs) => onEdit({ type: "trimVideo", id: segment.clipId, outUs })}
          />
        </>
      );
  } else if (selection.kind === "music") {
    const track = timeline.music.find((m) => m.trackId === selection.trackId);
    if (!track) return null;
    range = track;
    fields = (
      <SecondsField
        className={styles.field}
        label={t("music.start")}
        value={track.startUs}
        max={timeline.durationUs}
        onCommit={(startUs) => onEdit({ type: "moveMusicTrack", id: track.trackId, startUs })}
      />
    );
  } else {
    const { phase } = selection;
    range = timeline.segments.find((s) => s.startUs === selection.startUs);
    fields = (
      <>
        <SecondsField
          className={styles.field}
          label={t(`player.phase.${phase}`)}
          value={timeline.theme.timing[phase]}
          min={PHASE_DURATION.min}
          max={PHASE_DURATION.max}
          step={PHASE_DURATION.step / 1_000_000}
          onCommit={(us) => onEdit({ type: "setTiming", timing: { [phase]: us } })}
        />
        <span className={styles.hint}>
          {t(phase === "titleUs" ? "player.phase.titleNote" : "player.phase.wholeTrip")}
        </span>
      </>
    );
  }

  return (
    <section className={styles.editor} aria-labelledby={headingId}>
      <h3 id={headingId} className={styles.editorTitle}>
        {name}
        {range && (
          <span className={styles.editorTime}>
            {t("player.edit.range", { start: formatSeconds(range.startUs), end: formatSeconds(range.endUs) })}
          </span>
        )}
      </h3>
      <div className={styles.editorFields}>{fields}</div>
      <button type="button" className={styles.option} onClick={onClose}>
        {t("common.close")}
      </button>
    </section>
  );
}

/** A time on the recap in seconds with one decimal, as the fields show it. */
function formatSeconds(us: number): string {
  return (Math.round(us / 100_000) / 10).toFixed(1);
}
