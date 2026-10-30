import { seconds } from "./time.ts";

export const PHOTO_DURATION = { min: seconds(1), max: seconds(15), step: seconds(0.5), default: seconds(3) } as const;

/** Shortest video segment that can remain after trimming. */
export const MIN_VIDEO_CLIP = seconds(0.5);

/** Shortest music segment that can remain after trimming. */
export const MIN_MUSIC_CLIP = seconds(1);

/** Lengths the user can give the opening, travel, stop title and closing phases of the recap. */
export const PHASE_DURATION = { min: seconds(0.5), max: seconds(15), step: seconds(0.5) } as const;

export const DEFAULT_CLIP_VOLUME = 1;
export const DEFAULT_MUSIC_VOLUME = 0.7;
export const DEFAULT_MUSIC_FADE = seconds(2);

/** Longest journal entry of a stop, in characters (UTF-16 code units). */
export const MAX_JOURNAL_LENGTH = 10_000;
/** Longest note of a photo or video; it is shown as the caption in the recap. */
export const MAX_NOTE_LENGTH = 500;
