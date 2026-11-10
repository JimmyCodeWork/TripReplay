import type { Locale, Translate } from "@tripreplay/i18n";
import { useEffect, useId, useRef } from "react";
import { formatBytes } from "../format-bytes.ts";
import styles from "./ExportDialog.module.css";

export type ExportQuality = "1080p" | "720p";

/** The encodings an export will use, by name, such as H.264 and AAC; no audio means a silent video. */
export interface ExportFormatNames {
  readonly video: string;
  readonly audio?: string | undefined;
}

/** What the export dialog shows; the shell runs the export and moves between these. */
export type ExportState =
  | { readonly kind: "checking" }
  | { readonly kind: "ready"; readonly format: ExportFormatNames }
  | {
      readonly kind: "running";
      readonly phase: "audio" | "video" | "finishing";
      readonly completed: number;
      readonly total: number;
    }
  | { readonly kind: "done"; readonly bytes: number; readonly saved: boolean }
  | {
      readonly kind: "failed";
      readonly reason: "unsupported" | "storage" | "background" | "other";
      readonly message?: string;
    };

export interface ExportDialogProps {
  readonly state: ExportState;
  readonly quality: ExportQuality;
  readonly onQuality: (quality: ExportQuality) => void;
  readonly onStart: () => void;
  /** Stops a running export, or closes the dialog and removes an unsaved video. */
  readonly onClose: () => void;
  readonly onSave: () => void;
  readonly locale: Locale;
  readonly t: Translate;
}

/**
 * Exporting the recap as an MP4 video (docs/ui-design.md §5.1): choose the quality, follow the
 * progress, then save the file. The video is saved only when the user asks, once it is complete.
 */
export function ExportDialog({ state, quality, onQuality, onStart, onClose, onSave, locale, t }: ExportDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const element = dialog.current;
    if (element && !element.open) element.showModal?.();
  }, []);
  const running = state.kind === "running";
  const choosing = state.kind === "checking" || state.kind === "ready";

  return (
    <dialog
      ref={dialog}
      className={styles.dialog}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <h2 id={titleId} className={styles.title}>
        {t("export.title")}
      </h2>
      {choosing && (
        <>
          <fieldset className={styles.quality}>
            <legend>{t("export.quality")}</legend>
            {(["1080p", "720p"] as const).map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="quality"
                  value={value}
                  checked={quality === value}
                  onChange={() => onQuality(value)}
                />
                {t(value === "1080p" ? "export.q1080" : "export.q720")}
              </label>
            ))}
          </fieldset>
          <p className={styles.note} role="status">
            {state.kind === "checking"
              ? t("export.checking")
              : state.format.audio
                ? t("export.format", { video: state.format.video, audio: state.format.audio })
                : t("export.silent", { video: state.format.video })}
          </p>
          <p className={styles.note}>{t("export.keepOpen")}</p>
        </>
      )}
      {running && (
        <div className={styles.progress} role="status">
          <span>
            {state.phase === "video"
              ? t("export.phase.video", { completed: state.completed, total: state.total })
              : t(state.phase === "audio" ? "export.phase.audio" : "export.phase.finishing")}
          </span>
          <progress
            value={state.phase === "audio" ? 0 : state.completed}
            max={state.total || 1}
            aria-label={t("export.title")}
          />
          <span className={styles.note}>{t("export.keepOpen")}</span>
        </div>
      )}
      {state.kind === "done" && (
        <p className={styles.note} role="status">
          {state.saved ? t("export.saved") : t("export.done", { size: formatBytes(locale, state.bytes) })}
        </p>
      )}
      {state.kind === "failed" && (
        <p className={styles.error} role="alert">
          {t("export.failed", { reason: state.reason, message: state.message ?? "" })}
        </p>
      )}
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={onClose}>
          {running ? t("common.cancel") : t("common.close")}
        </button>
        {choosing && (
          <button type="button" className={styles.primary} onClick={onStart} disabled={state.kind !== "ready"}>
            {t("export.start")}
          </button>
        )}
        {state.kind === "done" && (
          <button type="button" className={styles.primary} onClick={onSave}>
            {t("export.save")}
          </button>
        )}
      </div>
    </dialog>
  );
}
