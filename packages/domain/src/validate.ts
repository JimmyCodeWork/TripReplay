import { isIsoDate, isValidTimeZone } from "./calendar.ts";
import { isValidLonLat } from "./geo.ts";
import { MIN_MUSIC_CLIP, MIN_VIDEO_CLIP, PHOTO_DURATION } from "./limits.ts";
import type { Project } from "./model.ts";

export interface ValidationIssue {
  /** Location of the problem, for example `stops[2].date`. */
  readonly path: string;
  readonly message: string;
}

/**
 * Checks every invariant of a project. Operations in this package preserve them; this is
 * used when loading or restoring data that did not come from those operations.
 */
export function validateProject(project: Project): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const add = (path: string, message: string): void => {
    issues.push({ path, message });
  };
  const { trip } = project;

  if (trip.title.trim() === "") add("trip.title", "must not be empty");
  if (!isValidTimeZone(trip.timeZone)) add("trip.timeZone", `"${trip.timeZone}" is not a valid time zone`);
  if (trip.themeId === "") add("trip.themeId", "must not be empty");
  if (trip.aspectRatio !== "16:9" && trip.aspectRatio !== "9:16") add("trip.aspectRatio", "must be 16:9 or 9:16");

  const ids = new Set<string>();
  const unique = (path: string, id: string) => {
    if (ids.has(id)) add(path, `duplicate id "${id}"`);
    ids.add(id);
  };

  project.stops.forEach((stop, i) => {
    unique(`stops[${i}].id`, stop.id);
    if (stop.name.trim() === "") add(`stops[${i}].name`, "must not be empty");
    if (!isIsoDate(stop.date)) add(`stops[${i}].date`, `"${stop.date}" is not a valid date`);
    else if (i > 0 && (project.stops[i - 1]?.date ?? "") > stop.date)
      add(`stops[${i}].date`, "stops are not in date order");
    if (!isValidLonLat(stop.location)) add(`stops[${i}].location`, "is outside the valid range");
  });

  const stopIds = new Set(project.stops.map((s) => s.id));
  const assets = new Map(project.assets.map((a) => [a.id, a]));
  project.assets.forEach((asset, i) => {
    unique(`assets[${i}].id`, asset.id);
  });

  project.clips.forEach((clip, i) => {
    const path = `clips[${i}]`;
    unique(`${path}.id`, clip.id);
    if (!stopIds.has(clip.stopId)) add(`${path}.stopId`, `stop "${clip.stopId}" does not exist`);
    const asset = assets.get(clip.assetId);
    if (!asset) add(`${path}.assetId`, `asset "${clip.assetId}" does not exist`);
    else if (asset.kind !== clip.kind) add(`${path}.assetId`, `a ${clip.kind} clip refers to a ${asset.kind} asset`);
    if (clip.kind === "photo") {
      if (clip.durationUs < PHOTO_DURATION.min || clip.durationUs > PHOTO_DURATION.max)
        add(`${path}.durationUs`, "is outside the allowed range");
    } else {
      const length = asset?.kind === "video" ? asset.durationUs : Number.POSITIVE_INFINITY;
      if (clip.inUs < 0 || clip.outUs > length) add(`${path}`, "trim is outside the video");
      if (clip.outUs - clip.inUs < Math.min(MIN_VIDEO_CLIP, length)) add(`${path}`, "is shorter than the minimum");
      if (clip.volume < 0 || clip.volume > 1) add(`${path}.volume`, "must be between 0 and 1");
    }
  });

  project.music.forEach((track, i) => {
    const path = `music[${i}]`;
    unique(`${path}.id`, track.id);
    const asset = assets.get(track.assetId);
    if (!asset) add(`${path}.assetId`, `asset "${track.assetId}" does not exist`);
    else if (asset.kind !== "audio") add(`${path}.assetId`, "is not an audio asset");
    const length = asset?.kind === "audio" ? asset.durationUs : Number.POSITIVE_INFINITY;
    if (track.startUs < 0) add(`${path}.startUs`, "must not be negative");
    if (track.inUs < 0 || track.outUs > length) add(path, "trim is outside the audio");
    if (track.outUs - track.inUs < Math.min(MIN_MUSIC_CLIP, length)) add(path, "is shorter than the minimum");
    if (track.fadeInUs < 0 || track.fadeOutUs < 0 || track.fadeInUs + track.fadeOutUs > track.outUs - track.inUs)
      add(path, "fades exceed the track length");
    if (track.volume < 0 || track.volume > 1) add(`${path}.volume`, "must be between 0 and 1");
  });

  return issues;
}
