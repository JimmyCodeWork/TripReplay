import { type AssetStore, MediaFailure, type MediaInfo, type MediaPort } from "@tripreplay/app";
import { audioFormat } from "./audio-format.ts";
import { IMAGE_HEAD_BYTES, readImageMetadata } from "./image-metadata.ts";
import { isHeif, readVideoMetadata, type VideoMetadata } from "./video-metadata.ts";

/** Files up to this size are hashed whole; larger ones from samples, see `contentHash`. */
export const FULL_HASH_BYTES = 64 * 1024 * 1024;
const SAMPLE_BYTES = 4 * 1024 * 1024;
/** Longest wait for the browser to read a video's metadata. */
const VIDEO_PROBE_MS = 15_000;

const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");

/**
 * A content hash that finds a file imported again (`findAssetByHash`). Files up to 64 MiB are
 * hashed whole with SHA-256; larger ones from their size and three 4 MiB samples, since Web Crypto
 * cannot hash a stream and a long video does not fit in memory.
 */
export async function contentHash(file: Blob): Promise<string> {
  if (file.size <= FULL_HASH_BYTES)
    return `sha256:${hex(await crypto.subtle.digest("SHA-256", await file.arrayBuffer()))}`;
  const middle = Math.floor(file.size / 2 - SAMPLE_BYTES / 2);
  const samples = new Blob([
    `${file.size}:`,
    file.slice(0, SAMPLE_BYTES),
    file.slice(middle, middle + SAMPLE_BYTES),
    file.slice(file.size - SAMPLE_BYTES),
  ]);
  return `sha256-sampled:${hex(await crypto.subtle.digest("SHA-256", await samples.arrayBuffer()))}`;
}

async function decodes(file: Blob): Promise<{ width: number; height: number } | undefined> {
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return undefined;
  }
}

/** Whether the browser can play the video, with its duration and size as the browser reads them. */
function probeVideo(file: Blob): Promise<{ durationUs: number; width: number; height: number } | undefined> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    const done = (result: { durationUs: number; width: number; height: number } | undefined) => {
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const timer = setTimeout(() => done(undefined), VIDEO_PROBE_MS);
    video.preload = "metadata";
    video.muted = true;
    video.onloadedmetadata = () =>
      done(
        Number.isFinite(video.duration) && video.videoWidth > 0
          ? { durationUs: Math.round(video.duration * 1_000_000), width: video.videoWidth, height: video.videoHeight }
          : undefined,
      );
    video.onerror = () => done(undefined);
    video.src = url;
  });
}

/** Whether the browser can play the audio, with its duration as the browser reads it. */
function probeAudio(file: Blob): Promise<number | undefined> {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(file);
    const done = (durationUs: number | undefined) => {
      clearTimeout(timer);
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(url);
      resolve(durationUs);
    };
    const timer = setTimeout(() => done(undefined), VIDEO_PROBE_MS);
    audio.preload = "metadata";
    audio.onloadedmetadata = () =>
      done(Number.isFinite(audio.duration) && audio.duration > 0 ? Math.round(audio.duration * 1_000_000) : undefined);
    audio.onerror = () => done(undefined);
    audio.src = url;
  });
}

async function* chunks(file: Blob): AsyncIterable<Uint8Array> {
  const reader = file.stream().getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

const read = (file: Blob) => async (offset: number, length: number) =>
  new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());

async function audioInfo(file: File, mimeType: string, durationUs?: number): Promise<MediaInfo> {
  const probed = await probeAudio(file);
  if (!probed) throw new MediaFailure("unsupported", `"${file.name}" is not audio this browser can play`);
  return {
    kind: "audio",
    fileName: file.name,
    byteSize: file.size,
    contentHash: await contentHash(file),
    mimeType,
    durationUs: durationUs || probed,
  };
}

/**
 * Reads what the application needs of a photo, video or music file. The format is recognized from
 * the file's bytes, never from its name, and only files the browser can decode are accepted.
 */
export async function inspectMediaFile(file: File): Promise<MediaInfo> {
  const head = new Uint8Array(await file.slice(0, IMAGE_HEAD_BYTES).arrayBuffer());
  const base = { fileName: file.name, byteSize: file.size, rotation: 0 as const };
  const image = readImageMetadata(head);
  if (image || isHeif(head)) {
    const decoded = await decodes(file);
    if (!decoded) throw new MediaFailure("unsupported", `"${file.name}" cannot be decoded by this browser`);
    return {
      ...base,
      kind: "photo",
      contentHash: await contentHash(file),
      mimeType: image ? `image/${image.format}` : "image/heic",
      width: image?.width ?? decoded.width,
      height: image?.height ?? decoded.height,
      ...(image?.captureTime ? { captureTime: image.captureTime } : {}),
      ...(image?.gps ? { gps: image.gps } : {}),
    };
  }
  const audio = audioFormat(head);
  if (audio) return audioInfo(file, audio);
  let metadata: VideoMetadata | undefined;
  try {
    metadata = await readVideoMetadata(read(file), file.size);
  } catch {
    metadata = undefined;
  }
  // An MP4 file with sound and no picture, such as M4A, is music.
  if (metadata && metadata.width === 0 && metadata.hasAudio) return audioInfo(file, "audio/mp4", metadata.durationUs);
  const probed = await probeVideo(file);
  if (!probed) throw new MediaFailure("unsupported", `"${file.name}" is not a photo or video this browser can show`);
  const quickTime = String.fromCharCode(...head.subarray(8, 12)) === "qt  ";
  return {
    ...base,
    kind: "video",
    contentHash: await contentHash(file),
    mimeType: quickTime ? "video/quicktime" : "video/mp4",
    width: probed.width,
    height: probed.height,
    durationUs: metadata?.durationUs || probed.durationUs,
    hasAudio: metadata?.hasAudio ?? true,
    ...(metadata?.captureTime ? { captureTime: metadata.captureTime } : {}),
    ...(metadata?.gps ? { gps: metadata.gps } : {}),
  };
}

export interface MediaPortOptions {
  /** The media store: files that no saved project refers to are removed at start-up. */
  readonly store: AssetStore<Blob>;
}

/** MediaPort with the browser's decoders, storing files in `store` (docs/architecture.md §4.2). */
export function createMediaPort({ store }: MediaPortOptions): MediaPort<File> {
  return {
    fileName: (file) => file.name,
    inspect: (file) => inspectMediaFile(file),
    async store(file, id) {
      try {
        await store.put(id, chunks(file), file.size);
      } catch (error) {
        throw new MediaFailure("failed", `"${file.name}" could not be stored: ${(error as Error).message}`);
      }
    },
    discard: (id) => store.remove(id),
  };
}
