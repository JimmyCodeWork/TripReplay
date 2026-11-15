import type { Clock, PreviewSurface } from "@tripreplay/app";
import { createMapLibreLayer, type MapFiles } from "@tripreplay/map";
import { createRecapRenderer, prepareViews, type RecapLabels } from "@tripreplay/renderer";
import { resolveTheme } from "@tripreplay/themes";
import type { PreviewMedia } from "./preview-media.ts";

/** The browser's frame clock for playback. */
export const animationClock: Clock = {
  now: () => performance.now(),
  requestFrame(callback) {
    const handle = requestAnimationFrame(() => callback());
    return () => cancelAnimationFrame(handle);
  },
};

/** A view whose tiles take longer than this to load is left to load while playing. */
const PREPARE_VIEW_TIMEOUT_MS = 5000;

/**
 * The preview surface: the downloaded base map, drawn by MapLibre, with a canvas on top for the
 * route, markers and overlays. Without map files the canvas draws the theme's background instead.
 */
export async function createRecapSurface(
  container: HTMLElement,
  files: readonly MapFiles[],
  labels: RecapLabels,
  media: PreviewMedia,
): Promise<PreviewSurface> {
  const mapHost = document.createElement("div");
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  container.append(mapHost, canvas);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is not available");
  const map =
    files.length > 0
      ? await createMapLibreLayer({ container: mapHost, files, colors: resolveTheme("classic").map })
      : undefined;
  const renderer = createRecapRenderer<CanvasImageSource>({
    canvas,
    context,
    labels,
    pixelRatio: window.devicePixelRatio || 1,
    media,
    ...(map ? { map } : {}),
  });
  // Draws the last frame again once a photo or video it shows is ready.
  let last: Parameters<PreviewSurface["draw"]> | undefined;
  let width = 0;
  const unsubscribe = media.subscribe(() => last && renderer.draw(...last));
  return {
    resize: (w, h) => {
      width = w;
      renderer.resize(w, h);
    },
    draw: (timeline, frame) => {
      last = [timeline, frame];
      renderer.draw(timeline, frame);
    },
    // Shows each view of the camera's path from `fromUs` on until its tiles are drawn, which keeps
    // them in the map's cache for playback; far from the stops, only the world overview is drawn and
    // loaded. The current frame is drawn again at the end.
    ...(map && {
      async prepare(timeline, fromUs, options = {}) {
        const views = prepareViews(timeline, fromUs, width, { nearKm: options.nearKm });
        try {
          for (const [index, { view, near }] of views.entries()) {
            options.signal?.throwIfAborted();
            map.setOverviewOnly?.(!near);
            map.setView(view);
            await Promise.race([
              map.whenDrawn(),
              new Promise((resolve) => setTimeout(resolve, PREPARE_VIEW_TIMEOUT_MS)),
            ]);
            options.onProgress?.((index + 1) / views.length);
          }
        } finally {
          map.setOverviewOnly?.(false);
          if (last) renderer.draw(...last);
        }
      },
    }),
    destroy() {
      unsubscribe();
      renderer.destroy();
      mapHost.remove();
      canvas.remove();
    },
  };
}
