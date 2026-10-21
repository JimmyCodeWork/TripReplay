/** A duration or position on the timeline, in integer microseconds. */
export type Microseconds = number;

export const US_PER_SECOND = 1_000_000;

export function seconds(value: number): Microseconds {
  return Math.round(value * US_PER_SECOND);
}

export function toSeconds(value: Microseconds): number {
  return value / US_PER_SECOND;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
