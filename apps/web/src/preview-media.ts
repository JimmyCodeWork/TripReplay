import type { AssetStore } from "@tripreplay/app";
import type { Asset } from "@tripreplay/domain";
import type { MediaSource } from "@tripreplay/renderer";

/** Longest side of a photo as decoded for the preview; the stored original stays untouched. */
const PREVIEW_SIZE = 1920;
/** A video is moved to the requested time when it is further away than this, in seconds. */
const VIDEO_DRIFT_S = 0.3;
/** Requests closer together than this, moving forward, mean the recap is playing. */
const PLAYING_STEP_S = 0.5;

type Picture = { readonly image: CanvasImageSource; readonly width: number; readonly height: number };

export interface PreviewMedia extends MediaSource<CanvasImageSource> {
  /** A URL of the stored file, for thumbnails; undefined when it is not stored. */
  url(assetId: string): Promise<string | undefined>;
  /** The video element that shows a clip, whose sound the audio mixer takes over. */
  videoElement(assetId: string): HTMLVideoElement;
  /** Called when a picture finished loading or a video reached the requested time, to draw again. */
  subscribe(listener: () => void): () => void;
  /** Stops every video and releases the decoded pictures and URLs. */
  dispose(): void;
}

/**
 * The pictures of the preview (the renderer's MediaSource): photos decoded once at preview size,
 * and muted videos that follow the requested time, playing while the recap plays.
 */
export function createPreviewMedia(store: AssetStore<Blob>, assets: () => readonly Asset[]): PreviewMedia {
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) listener();
  };
  const urls = new Map<string, Promise<string | undefined>>();
  const photos = new Map<string, Picture | "loading" | "failed">();
  const videos = new Map<string, { element: HTMLVideoElement; lastTime: number }>();

  const url = (id: string) => {
    let pending = urls.get(id);
    if (!pending) {
      pending = store.open(id).then((blob) => (blob ? URL.createObjectURL(blob) : undefined));
      urls.set(id, pending);
    }
    return pending;
  };

  /**
   * Decodes a photo straight at preview size, from the size recorded at import, so that a phone
   * photo of 50 megapixels never needs its full size in memory, which a WebView may refuse. Where
   * the browser cannot decode it that way, an image element decodes it instead.
   */
  const decodePhoto = async (id: string, width: number, height: number): Promise<Picture> => {
    const blob = await store.open(id);
    if (!blob) throw new Error("missing");
    const scale = Math.min(1, PREVIEW_SIZE / Math.max(width, height));
    try {
      const bitmap = await createImageBitmap(blob, {
        resizeWidth: Math.max(1, Math.round(width * scale)),
        resizeHeight: Math.max(1, Math.round(height * scale)),
        resizeQuality: "high",
      });
      return { image: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      const src = await url(id);
      if (!src) throw new Error("missing");
      const image = new Image();
      image.src = src;
      await image.decode();
      return { image, width: image.naturalWidth, height: image.naturalHeight };
    }
  };

  const loadPhoto = (id: string, width: number, height: number) => {
    photos.set(id, "loading");
    decodePhoto(id, width, height).then(
      (picture) => {
        photos.set(id, picture);
        notify();
      },
      () => photos.set(id, "failed"),
    );
  };

  const video = (id: string) => {
    let entry = videos.get(id);
    if (!entry) {
      const element = document.createElement("video");
      element.muted = true;
      element.playsInline = true;
      element.preload = "auto";
      element.addEventListener("loadeddata", notify);
      element.addEventListener("seeked", notify);
      entry = { element, lastTime: Number.NaN };
      videos.set(id, entry);
      void url(id).then((src) => {
        if (src) element.src = src;
      });
    }
    return entry;
  };

  return {
    url,
    videoElement: (assetId) => video(assetId).element,

    frame(assetId, mediaTimeUs) {
      const asset = assets().find((a) => a.id === assetId);
      if (asset?.kind === "photo") {
        const photo = photos.get(assetId);
        if (photo === undefined) loadPhoto(assetId, asset.width, asset.height);
        return typeof photo === "object" ? photo : undefined;
      }
      if (asset?.kind !== "video") return undefined;
      const entry = video(assetId);
      const { element } = entry;
      const time = mediaTimeUs / 1_000_000;
      const step = time - entry.lastTime;
      entry.lastTime = time;
      const playing = step > 0 && step < PLAYING_STEP_S;
      if (playing && element.paused) void element.play().catch(() => {});
      if (!playing && !element.paused) element.pause();
      if (Math.abs(element.currentTime - time) > VIDEO_DRIFT_S) element.currentTime = time;
      // Pause the other videos once the recap has moved on from them.
      for (const [id, other] of videos) if (id !== assetId && !other.element.paused) other.element.pause();
      return element.readyState >= 2
        ? { image: element, width: element.videoWidth, height: element.videoHeight }
        : undefined;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    dispose() {
      for (const { element } of videos.values()) {
        element.pause();
        element.removeAttribute("src");
        element.load();
      }
      for (const photo of photos.values()) {
        if (typeof photo === "object" && photo.image instanceof ImageBitmap) photo.image.close();
      }
      for (const pending of urls.values()) void pending.then((u) => u && URL.revokeObjectURL(u));
      videos.clear();
      photos.clear();
      urls.clear();
      listeners.clear();
    },
  };
}
