import type { Clock, PreviewSurface } from "@tripreplay/app";
import { createMapLibreLayer, type MapFiles } from "@tripreplay/map";
import { createRecapRenderer, type RecapLabels } from "@tripreplay/renderer";
import { resolveTheme } from "@tripreplay/themes";

/** The browser's frame clock for playback. */
export const animationClock: Clock = {
  now: () => performance.now(),
  requestFrame(callback) {
    const handle = requestAnimationFrame(() => callback());
    return () => cancelAnimationFrame(handle);
  },
};

/**
 * The preview surface: the downloaded base map, drawn by MapLibre, with a canvas on top for the
 * route, markers and overlays. Without map files the canvas draws the theme's background instead.
 */
export async function createRecapSurface(
  container: HTMLElement,
  files: MapFiles | undefined,
  labels: RecapLabels,
): Promise<PreviewSurface> {
  const mapHost = document.createElement("div");
  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  container.append(mapHost, canvas);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is not available");
  const map = files
    ? await createMapLibreLayer({ container: mapHost, files, colors: resolveTheme("classic").map })
    : undefined;
  const renderer = createRecapRenderer<CanvasImageSource>({
    canvas,
    context,
    labels,
    pixelRatio: window.devicePixelRatio || 1,
    ...(map ? { map } : {}),
  });
  return {
    resize: (width, height) => renderer.resize(width, height),
    draw: (timeline, frame) => renderer.draw(timeline, frame),
    destroy() {
      renderer.destroy();
      mapHost.remove();
      canvas.remove();
    },
  };
}
