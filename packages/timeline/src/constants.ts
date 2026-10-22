import type { AspectRatio } from "@tripreplay/domain";
import { seconds } from "@tripreplay/domain";

/** Frame size in pixels that camera zoom levels refer to. */
export const REFERENCE_FRAME: Readonly<Record<AspectRatio, { readonly width: number; readonly height: number }>> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
};

/** Width in pixels of the world at zoom 0, matching 512-pixel vector tiles. */
export const WORLD_SIZE = 512;

/** Zoom level of the camera at a stop. */
export const STOP_ZOOM = 13;

/** Zoom limits for overviews, so that a single stop is not shown at street level or the world repeated. */
export const MIN_ZOOM = 1;
export const MAX_OVERVIEW_ZOOM = 11;

/** Fraction of the frame that an overview may fill. */
export const FIT_PADDING = 0.7;

/** Zoom levels the camera pulls back beyond the fitted view during long moves. */
export const TRAVEL_PULL_BACK = 0.5;

/** Scale reached by the slow push-in at the end of a photo. */
export const PHOTO_PUSH_IN = 1.05;

/** Music gain multiplier while clips with sound play, and the length of the change. */
export const DUCK_GAIN = 0.25;
export const DUCK_RAMP = seconds(0.3);
