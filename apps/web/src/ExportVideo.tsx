import type { Timeline } from "@tripreplay/app";
import type { Locale, Translate } from "@tripreplay/i18n";
import type { MapFiles } from "@tripreplay/map";
import type { RecapLabels } from "@tripreplay/renderer";
import { ExportDialog, type ExportFileSize, type ExportQuality, type ExportState } from "@tripreplay/ui";
import { useEffect, useRef, useState } from "react";
import {
  canExport,
  ExportFailure,
  type ExportOptions,
  type ExportResult,
  estimatedBytes,
  exportVideo,
  saveVideo,
  videoFileName,
} from "./export-video.ts";
import type { Services } from "./services.ts";

const CODEC_NAMES: Readonly<Record<string, string>> = {
  avc: "H.264",
  vp9: "VP9",
  av1: "AV1",
  aac: "AAC",
  opus: "Opus",
};

export interface ExportVideoProps {
  readonly services: Services;
  readonly timeline: Timeline;
  readonly title: string;
  readonly assets: ExportOptions["assets"];
  readonly labels: RecapLabels;
  /** The map files of the regions the trip passes through. */
  readonly files: () => Promise<readonly MapFiles[]>;
  readonly onClose: () => void;
  readonly locale: Locale;
  readonly t: Translate;
}

/**
 * Runs an export for the export dialog: probes the encoders for the chosen quality, exports
 * the timeline as it was when the export started, and saves the video when asked. Closing the
 * dialog stops a running export and removes an unsaved video.
 */
export function ExportVideo({
  services,
  timeline,
  title,
  assets,
  labels,
  files,
  onClose,
  locale,
  t,
}: ExportVideoProps) {
  const [quality, setQuality] = useState<ExportQuality>("1080p");
  const [fileSize, setFileSize] = useState<ExportFileSize>("standard");
  const [state, setState] = useState<ExportState>({ kind: "checking" });
  const controller = useRef<AbortController | undefined>(undefined);
  const result = useRef<ExportResult | undefined>(undefined);

  // The format follows the quality, until an export starts.
  useEffect(() => {
    let current = true;
    setState({ kind: "checking" });
    void canExport(timeline, quality, fileSize).then((format) => {
      if (!current) return;
      setState(
        format
          ? {
              kind: "ready",
              format: {
                video: CODEC_NAMES[format.video.mux] ?? format.video.mux,
                audio: format.audio ? (CODEC_NAMES[format.audio.mux] ?? format.audio.mux) : undefined,
              },
              bytes: estimatedBytes(format, timeline.durationUs),
            }
          : { kind: "failed", reason: "unsupported" },
      );
    });
    return () => {
      current = false;
    };
  }, [timeline, quality, fileSize]);

  const start = async () => {
    const abort = new AbortController();
    controller.current = abort;
    setState({ kind: "running", phase: "audio", completed: 0, total: 1 });
    let last = 0;
    try {
      const done = await exportVideo(services, {
        timeline,
        quality,
        fileSize,
        files: await files(),
        labels,
        assets,
        signal: abort.signal,
        onProgress: (progress) => {
          // Fewer updates than frames, so that the page stays responsive.
          const now = performance.now();
          if (progress.phase === "video" && now - last < 200 && progress.completed < progress.total) return;
          last = now;
          setState({ kind: "running", ...progress });
        },
      });
      result.current = done;
      setState({ kind: "done", bytes: done.file.size, saved: false });
    } catch (error) {
      if (abort.signal.aborted && !(error instanceof ExportFailure)) return;
      setState(
        error instanceof ExportFailure
          ? { kind: "failed", reason: error.reason }
          : { kind: "failed", reason: "other", message: error instanceof Error ? error.message : String(error) },
      );
    } finally {
      controller.current = undefined;
    }
  };

  const save = async () => {
    const done = result.current;
    if (!done) return;
    try {
      if (await saveVideo(done.file, videoFileName(title), t("export.fileType")))
        setState({ kind: "done", bytes: done.file.size, saved: true });
    } catch (error) {
      setState({ kind: "failed", reason: "other", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const close = () => {
    controller.current?.abort();
    void result.current?.discard();
    result.current = undefined;
    onClose();
  };

  return (
    <ExportDialog
      state={state}
      quality={quality}
      onQuality={setQuality}
      fileSize={fileSize}
      onFileSize={setFileSize}
      onStart={() => void start()}
      onClose={close}
      onSave={() => void save()}
      locale={locale}
      t={t}
    />
  );
}
