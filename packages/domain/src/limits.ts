import { seconds } from "./time.ts";

export const PHOTO_DURATION = { min: seconds(1), max: seconds(15), step: seconds(0.5), default: seconds(3) } as const;

/** Shortest video segment that can remain after trimming. */
export const MIN_VIDEO_CLIP = seconds(0.5);

/** Shortest music segment that can remain after trimming. */
export const MIN_MUSIC_CLIP = seconds(1);

export const DEFAULT_CLIP_VOLUME = 1;
export const DEFAULT_MUSIC_VOLUME = 0.7;
export const DEFAULT_MUSIC_FADE = seconds(2);
