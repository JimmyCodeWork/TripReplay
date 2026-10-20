export { addAsset, findAssetByHash, isAssetReferenced, removeUnreferencedAssets } from "./assets.ts";
export { type IsoDate, isIsoDate, isValidTimeZone } from "./calendar.ts";
export {
  addClip,
  clipDuration,
  moveClip,
  normalizePhotoDuration,
  removeClip,
  setClipFit,
  setClipVolume,
  setPhotoDuration,
  trimVideo,
} from "./clips.ts";
export { DomainError, type DomainErrorCode } from "./errors.ts";
export { isValidLonLat, type LonLat } from "./geo.ts";
export * from "./limits.ts";
export { clipsOfStop, findAsset, findClip, findMusicTrack, findStop } from "./lookup.ts";
export type * from "./model.ts";
export { SCHEMA_VERSION } from "./model.ts";
export {
  addMusicTrack,
  type MusicSettings,
  moveMusicTrack,
  removeMusicTrack,
  trimMusicTrack,
  updateMusicSettings,
} from "./music.ts";
export { createProject, type NewProject, renameTrip, setAspectRatio, setTheme, setTimeZone } from "./project.ts";
export {
  addStop,
  moveStop,
  type RemoveStopOptions,
  removeStop,
  type StopChanges,
  type StopDay,
  stopsByDate,
  updateStop,
} from "./stops.ts";
export { clamp, type Microseconds, seconds, toSeconds, US_PER_SECOND } from "./time.ts";
export { type ValidationIssue, validateProject } from "./validate.ts";
