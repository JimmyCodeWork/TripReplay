/** A media element is moved to the requested time when it is further away than this, in seconds. */
export const DRIFT_S = 0.25;

/** What to do with a media element so that it follows the recap. */
export interface SyncAction {
  /** The time to move to, or undefined to leave the position. */
  readonly seekTo?: number;
  readonly play: boolean;
  readonly pause: boolean;
}

/**
 * Keeps a media element in step with the recap: it plays while the recap plays, and is moved only
 * when it has drifted, since every move interrupts its sound. A paused element is placed exactly.
 */
export function syncAction(
  element: { readonly currentTime: number; readonly paused: boolean },
  targetS: number,
  playing: boolean,
): SyncAction {
  const drift = Math.abs(element.currentTime - targetS);
  const tolerance = playing && !element.paused ? DRIFT_S : 0.05;
  return {
    ...(drift > tolerance ? { seekTo: targetS } : {}),
    play: playing && element.paused,
    pause: !playing && !element.paused,
  };
}
