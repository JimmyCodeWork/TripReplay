import type { Command } from "@tripreplay/app";

const SECOND = 1_000_000;
/** Photo durations as the domain allows them (PHOTO_DURATION): 1 s to 15 s on a 0.5 s grid. */
const PHOTO = { min: SECOND, max: 15 * SECOND, step: SECOND / 2 } as const;
/** Shortest piece of a video or music track shown while dragging; the domain sets the exact limits. */
const MIN_PIECE = SECOND / 2;

/** What a drag on the timeline changes (docs/ui-design.md §3.4). */
export type DragTarget =
  | { readonly kind: "photo"; readonly clipId: string; readonly durationUs: number }
  | { readonly kind: "videoIn"; readonly clipId: string; readonly inUs: number; readonly lengthUs: number }
  | { readonly kind: "videoOut"; readonly clipId: string; readonly outUs: number; readonly lengthUs: number }
  | { readonly kind: "music"; readonly trackId: string; readonly startUs: number }
  | { readonly kind: "musicIn"; readonly trackId: string; readonly inUs: number; readonly lengthUs: number }
  | { readonly kind: "musicOut"; readonly trackId: string; readonly outUs: number; readonly lengthUs: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** A photo duration snapped to the grid, as it will be stored. */
export function snapPhotoDuration(durationUs: number): number {
  return clamp(Math.round(durationUs / PHOTO.step) * PHOTO.step, PHOTO.min, PHOTO.max);
}

/**
 * How the dragged piece looks while dragging: the change of its start and of its length on the
 * timeline, in microseconds. The stored result may differ slightly, as the domain clamps it.
 */
export function dragPreview(
  target: DragTarget,
  deltaUs: number,
): { readonly startUs: number; readonly lengthUs: number } {
  switch (target.kind) {
    case "photo":
      return { startUs: 0, lengthUs: snapPhotoDuration(target.durationUs + deltaUs) - target.durationUs };
    case "videoIn":
    case "musicIn": {
      const moved = clamp(deltaUs, -target.inUs, target.lengthUs - MIN_PIECE);
      return { startUs: target.kind === "musicIn" ? moved : 0, lengthUs: -moved };
    }
    case "videoOut":
    case "musicOut":
      return { startUs: 0, lengthUs: Math.max(deltaUs, MIN_PIECE - target.lengthUs) };
    case "music":
      return { startUs: Math.max(deltaUs, -target.startUs), lengthUs: 0 };
  }
}

/** The one command a finished drag makes, or undefined when nothing changed. */
export function dragCommand(target: DragTarget, deltaUs: number): Command | undefined {
  const delta = Math.round(deltaUs);
  if (delta === 0) return undefined;
  switch (target.kind) {
    case "photo": {
      const durationUs = snapPhotoDuration(target.durationUs + delta);
      return durationUs === target.durationUs ? undefined : { type: "setPhotoDuration", id: target.clipId, durationUs };
    }
    case "videoIn":
      return { type: "trimVideo", id: target.clipId, inUs: target.inUs + delta };
    case "videoOut":
      return { type: "trimVideo", id: target.clipId, outUs: target.outUs + delta };
    case "music":
      return { type: "moveMusicTrack", id: target.trackId, startUs: Math.max(0, target.startUs + delta) };
    case "musicIn":
      return { type: "trimMusicTrack", id: target.trackId, inUs: target.inUs + delta, keepAligned: true };
    case "musicOut":
      return { type: "trimMusicTrack", id: target.trackId, outUs: target.outUs + delta };
  }
}
