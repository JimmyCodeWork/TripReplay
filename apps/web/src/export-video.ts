// Exporting the recap as an MP4 file (docs/adr/0009-export-in-1-0.md): the frames are drawn one
// by one off screen at the output size, from the same frame descriptions as the preview, and
// encoded with WebCodecs into a temporary file in the origin private file system.

import type { Timeline } from "@tripreplay/app";
import {
  CHANNELS,
  chooseFormat,
  type ExportFormat,
  type ExportProgress,
  type ExportSize,
  encodeRecap,
  type FrameDescription,
  mixAudio,
  planAudio,
  SAMPLE_RATE,
} from "@tripreplay/export";
import { createMapLibreLayer, type MapFiles } from "@tripreplay/map";
import { createRecapRenderer, type MediaSource, type RecapLabels } from "@tripreplay/renderer";
import { resolveTheme } from "@tripreplay/themes";
import { backupFileName } from "./backup.ts";
import { NATIVE } from "./platform.ts";
import type { Services } from "./services.ts";

export type ExportQuality = "1080p" | "720p";

export type ExportFailureReason = "unsupported" | "storage" | "background";

export class ExportFailure extends Error {
  readonly reason: ExportFailureReason;
  constructor(reason: ExportFailureReason) {
    super(`Export failed: ${reason}`);
    this.reason = reason;
  }
}

/** Frames per second of exported video. */
const FPS = 30;
/** Longest side of a photo as decoded for export, as large as a 1080p frame needs. */
const PHOTO_SIZE = 1920;
const EXPORT_DIRECTORY = "exports";

export function exportSize(timeline: Timeline, quality: ExportQuality): ExportSize {
  const [long, short] = quality === "1080p" ? [1920, 1080] : [1280, 720];
  return timeline.aspectRatio === "9:16"
    ? { width: short, height: long, fps: FPS }
    : { width: long, height: short, fps: FPS };
}

/** Bytes the video is expected to take, from the encoders' bit rates, with room to spare. */
function expectedBytes(format: ExportFormat, durationUs: number): number {
  const bits = (format.video.config.bitrate ?? 8_000_000) + (format.audio?.config.bitrate ?? 128_000);
  return Math.ceil((bits / 8) * (durationUs / 1_000_000) * 1.5);
}

type Picture = { readonly image: CanvasImageSource; readonly width: number; readonly height: number };

/**
 * The pictures of the frame being exported: photos decoded once at export size, and a video
 * element per clip moved to each frame's time before the frame is drawn.
 */
function createExportMedia(services: Services, sizes: ReadonlyMap<string, { width: number; height: number }>) {
  const photos = new Map<string, Picture>();
  const videos = new Map<string, HTMLVideoElement>();
  const urls: string[] = [];
  const assets = (id: string) => services.assets.open(id);

  const photo = async (id: string) => {
    const known = photos.get(id);
    if (known) return;
    const blob = await assets(id);
    const size = sizes.get(id);
    if (!blob || !size) return;
    // Decoded straight at export size from the size recorded at import, as in the preview, so that
    // a photo of many megapixels never needs its full size in memory.
    const scale = Math.min(1, PHOTO_SIZE / Math.max(size.width, size.height));
    const bitmap = await createImageBitmap(blob, {
      resizeWidth: Math.max(1, Math.round(size.width * scale)),
      resizeHeight: Math.max(1, Math.round(size.height * scale)),
      resizeQuality: "high",
    });
    photos.set(id, { image: bitmap, width: bitmap.width, height: bitmap.height });
  };

  const video = async (id: string, timeS: number) => {
    let element = videos.get(id);
    if (!element) {
      const blob = await assets(id);
      if (!blob) return;
      element = document.createElement("video");
      element.muted = true;
      element.playsInline = true;
      element.preload = "auto";
      const url = URL.createObjectURL(blob);
      urls.push(url);
      element.src = url;
      await new Promise<void>((resolve, reject) => {
        element?.addEventListener("loadeddata", () => resolve(), { once: true });
        element?.addEventListener("error", () => reject(new Error("video")), { once: true });
      });
      videos.set(id, element);
    }
    if (Math.abs(element.currentTime - timeS) < 0.001) return;
    const seeked = new Promise<void>((resolve) => element?.addEventListener("seeked", () => resolve(), { once: true }));
    element.currentTime = timeS;
    await seeked;
  };

  const source: MediaSource<CanvasImageSource> = {
    frame(assetId) {
      const picture = photos.get(assetId);
      if (picture) return picture;
      const element = videos.get(assetId);
      return element ? { image: element, width: element.videoWidth, height: element.videoHeight } : undefined;
    },
  };

  return {
    source,
    /** Loads what a frame shows, so that drawing it needs no waiting. */
    async prepare(frame: FrameDescription) {
      for (const overlay of frame.overlays) {
        if (overlay.kind !== "media") continue;
        if (overlay.mediaKind === "photo") await photo(overlay.assetId);
        else await video(overlay.assetId, overlay.mediaTimeUs / 1_000_000);
      }
    },
    dispose() {
      for (const picture of photos.values()) if (picture.image instanceof ImageBitmap) picture.image.close();
      for (const element of videos.values()) element.removeAttribute("src");
      for (const url of urls) URL.revokeObjectURL(url);
    },
  };
}

/** Decodes each source of sound once, at the export's sample rate; a source that fails stays silent. */
async function decodeSounds(services: Services, assetIds: readonly string[]): Promise<Map<string, AudioBuffer>> {
  const decoder = new OfflineAudioContext(CHANNELS, 1, SAMPLE_RATE);
  const buffers = new Map<string, AudioBuffer>();
  for (const id of new Set(assetIds)) {
    const blob = await services.assets.open(id);
    if (!blob) continue;
    try {
      buffers.set(id, await decoder.decodeAudioData(await blob.arrayBuffer()));
    } catch {
      // A video without sound, or a format the browser cannot decode.
    }
  }
  return buffers;
}

export interface ExportOptions {
  readonly timeline: Timeline;
  readonly quality: ExportQuality;
  readonly files: readonly MapFiles[];
  readonly labels: RecapLabels;
  /** The trip's photos and videos, for the sizes recorded at import. */
  readonly assets: readonly { readonly id: string; readonly width?: number; readonly height?: number }[];
  readonly onProgress: (progress: ExportProgress) => void;
  readonly signal: AbortSignal;
}

export interface ExportResult {
  readonly file: File;
  readonly format: ExportFormat;
  /** Removes the temporary file once it has been saved elsewhere. */
  readonly discard: () => Promise<void>;
}

/** Whether this browser can export at all, for the dialog to say so before anything starts. */
export async function canExport(timeline: Timeline, quality: ExportQuality): Promise<ExportFormat | undefined> {
  return chooseFormat(exportSize(timeline, quality), SAMPLE_RATE, CHANNELS);
}

/**
 * Exports the recap into a temporary MP4 file. The export stops, and its temporary file is
 * removed, when it is cancelled, fails, or the page goes to the background, where a phone would
 * stop drawing the map (Specification §7.1).
 */
export async function exportVideo(services: Services, options: ExportOptions): Promise<ExportResult> {
  const { timeline, signal } = options;
  const size = exportSize(timeline, options.quality);
  const format = await chooseFormat(size, SAMPLE_RATE, CHANNELS);
  if (!format) throw new ExportFailure("unsupported");
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  if (estimate?.quota !== undefined && estimate.usage !== undefined) {
    if (estimate.quota - estimate.usage < expectedBytes(format, timeline.durationUs))
      throw new ExportFailure("storage");
  }

  const controller = new AbortController();
  const abort = (reason: unknown) => controller.abort(reason);
  signal.addEventListener("abort", () => abort(signal.reason), { once: true });
  const onHidden = () => {
    if (document.visibilityState === "hidden") abort(new ExportFailure("background"));
  };
  document.addEventListener("visibilitychange", onHidden);
  const lock = await navigator.wakeLock?.request("screen").catch(() => undefined);

  const root = await navigator.storage.getDirectory();
  const directory = await root.getDirectoryHandle(EXPORT_DIRECTORY, { create: true });
  const name = `${crypto.randomUUID()}.mp4`;
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  const discard = () => directory.removeEntry(name).catch(() => {});

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = `position:fixed;left:-${size.width + 100}px;top:0;width:${size.width}px;height:${size.height}px;overflow:hidden;pointer-events:none`;
  const mapHost = document.createElement("div");
  const overlay = document.createElement("canvas");
  host.append(mapHost, overlay);
  document.body.append(host);
  const sizes = new Map(
    options.assets.flatMap((asset) =>
      asset.width && asset.height ? [[asset.id, { width: asset.width, height: asset.height }] as const] : [],
    ),
  );
  const media = createExportMedia(services, sizes);
  let destroyMap: (() => void) | undefined;

  try {
    options.onProgress({ phase: "audio", completed: 0, total: 1 });
    const runs = planAudio(timeline);
    const audio =
      format.audio && runs.length > 0
        ? await mixAudio(
            runs,
            timeline.durationUs,
            await decodeSounds(
              services,
              runs.map((run) => run.assetId),
            ),
          )
        : undefined;

    const map =
      options.files.length > 0
        ? await createMapLibreLayer({
            container: mapHost,
            files: options.files,
            colors: resolveTheme("classic").map,
            pixelRatio: 1,
            readable: true,
          })
        : undefined;
    destroyMap = map ? () => map.destroy() : undefined;
    const context = overlay.getContext("2d");
    if (!context) throw new Error("Canvas 2D is not available");
    const renderer = createRecapRenderer<CanvasImageSource>({
      canvas: overlay,
      context,
      labels: options.labels,
      pixelRatio: 1,
      media: media.source,
      ...(map ? { map } : {}),
    });
    renderer.resize(size.width, size.height);
    const composite = document.createElement("canvas");
    composite.width = size.width;
    composite.height = size.height;
    const output = composite.getContext("2d");
    if (!output) throw new Error("Canvas 2D is not available");

    await encodeRecap({
      timeline,
      size,
      format,
      audio,
      frames: {
        async draw(frame) {
          await media.prepare(frame);
          renderer.draw(timeline, frame);
          if (map) await map.whenDrawn();
          output.clearRect(0, 0, size.width, size.height);
          if (map) output.drawImage(map.canvas, 0, 0, size.width, size.height);
          output.drawImage(overlay, 0, 0, size.width, size.height);
          return composite;
        },
      },
      write: (data, position) => writable.write({ type: "write", position, data }),
      onProgress: options.onProgress,
      signal: controller.signal,
    });
    await writable.close();
    return { file: await handle.getFile(), format, discard };
  } catch (error) {
    await writable.abort().catch(() => {});
    await discard();
    throw controller.signal.aborted ? (controller.signal.reason ?? error) : error;
  } finally {
    document.removeEventListener("visibilitychange", onHidden);
    void lock?.release().catch(() => {});
    media.dispose();
    destroyMap?.();
    host.remove();
  }
}

/** Removes temporary files of exports that did not finish, for example when the page was closed. */
export async function clearExports(): Promise<void> {
  const root = await navigator.storage?.getDirectory?.().catch(() => undefined);
  await root?.removeEntry(EXPORT_DIRECTORY, { recursive: true }).catch(() => {});
}

/** A file name for the video from the trip title and today's date. */
export function videoFileName(title: string, date = new Date()): string {
  return backupFileName(title, date).replace(/\.[^.]+$/, ".mp4");
}

/** The File System Access API where the browser offers it (Chromium); not yet in the DOM types. */
interface SavePicker {
  showSaveFilePicker(options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }): Promise<{ createWritable(): Promise<WritableStream<Uint8Array>> }>;
}

async function* chunks(file: File): AsyncIterable<Uint8Array> {
  const reader = file.stream().getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return;
    yield value;
  }
}

/**
 * Saves an exported video where the user chooses: through the system screen in the Android
 * application, the save dialog where the browser has one, or the downloads folder otherwise.
 * The file is read from the temporary file in parts, never held in memory. Resolves false when
 * the user cancels.
 */
export async function saveVideo(file: File, name: string, description: string): Promise<boolean> {
  if (NATIVE) {
    const { saveFile } = await import("./native-save.ts");
    return saveFile(name, "video/mp4", chunks(file));
  }
  const picker = (window as unknown as Partial<SavePicker>).showSaveFilePicker;
  if (picker) {
    let handle: Awaited<ReturnType<SavePicker["showSaveFilePicker"]>>;
    try {
      handle = await picker.call(window, {
        suggestedName: name,
        types: [{ description, accept: { "video/mp4": [".mp4"] } }],
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return false;
      throw error;
    }
    await file.stream().pipeTo(await handle.createWritable());
    return true;
  }
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  // Chromium keeps the file name only for a link that is in the document.
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
