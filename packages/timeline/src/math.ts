export function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

/** Position of `value` between `start` and `end`, clamped to 0–1; 1 when the interval is empty. */
export function progress(value: number, start: number, end: number): number {
  if (end <= start) return 1;
  return Math.min(1, Math.max(0, (value - start) / (end - start)));
}

export function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/**
 * Opacity of something visible during [start, end) that fades in and out over `fadeUs`.
 * The fades are shortened for intervals shorter than two fades.
 */
export function envelope(timeUs: number, start: number, end: number, fadeUs: number): number {
  const fade = Math.min(fadeUs, (end - start) / 2);
  if (timeUs < start || timeUs > end) return 0;
  if (fade <= 0) return 1;
  return Math.min(1, (timeUs - start) / fade, (end - timeUs) / fade);
}
