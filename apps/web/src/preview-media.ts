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

  const loadPhoto = (id: string) => {
    photos.set(id, "loading");
    void (async () => {
      const blob = await store.open(id);
      if (!blob) throw new Error("missing");
      const full = await createImageBitmap(blob);
      const scale = Math.min(1, PREVIEW_SIZE / Math.max(full.width, full.height));
      if (scale === 1) return full;
      full.close();
      return createImageBitmap(blob, { resizeWidth: Math.round(full.width * scale), resizeQuality: "high" });
    })().then(
      (bitmap) => {
        photos.set(id, { image: bitmap, width: bitmap.width, height: bitmap.height });
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

    frame(assetId, mediaTimeUs) {
      const asset = assets().find((a) => a.id === assetId);
      if (asset?.kind === "photo") {
        const photo = photos.get(assetId);
        if (photo === undefined) loadPhoto(assetId);
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
      for (const photo of photos.values()) if (typeof photo === "object") (photo.image as ImageBitmap).close();
      for (const pending of urls.values()) void pending.then((u) => u && URL.revokeObjectURL(u));
      videos.clear();
      photos.clear();
      urls.clear();
      listeners.clear();
    },
  };
}
