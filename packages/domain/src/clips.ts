import { DomainError, invalid } from "./errors.ts";
import { DEFAULT_CLIP_VOLUME, MIN_VIDEO_CLIP, PHOTO_DURATION } from "./limits.ts";
import { findAsset, findClip, findStop, replaceById } from "./lookup.ts";
import type { AssetId, Clip, ClipId, Fit, PhotoClip, Project, StopId, VideoClip } from "./model.ts";
import { clamp, type Microseconds } from "./time.ts";

/** Snaps a photo duration to the 0.5-second grid and the allowed range. */
export function normalizePhotoDuration(durationUs: Microseconds): Microseconds {
  const snapped = Math.round(durationUs / PHOTO_DURATION.step) * PHOTO_DURATION.step;
  return clamp(snapped, PHOTO_DURATION.min, PHOTO_DURATION.max);
}

function insertIntoStop(clips: readonly Clip[], clip: Clip, position?: number): Clip[] {
  const siblings = clips.filter((c) => c.stopId === clip.stopId);
  const at = position === undefined ? siblings.length : clamp(position, 0, siblings.length);
  const anchor = siblings[at];
  if (anchor) {
    const index = clips.indexOf(anchor);
    return [...clips.slice(0, index), clip, ...clips.slice(index)];
  }
  const last = siblings.at(-1);
  if (!last) return [...clips, clip];
  const index = clips.indexOf(last) + 1;
  return [...clips.slice(0, index), clip, ...clips.slice(index)];
}

/** Places an imported asset at a stop, as a photo or video clip according to the asset's kind. */
export function addClip(
  project: Project,
  input: { id: ClipId; stopId: StopId; assetId: AssetId; position?: number },
): Project {
  if (project.clips.some((c) => c.id === input.id)) throw invalid(`Clip "${input.id}" already exists`);
  findStop(project, input.stopId);
  const asset = findAsset(project, input.assetId);
  let clip: Clip;
  if (asset.kind === "photo") {
    clip = {
      kind: "photo",
      id: input.id,
      stopId: input.stopId,
      assetId: asset.id,
      durationUs: PHOTO_DURATION.default,
      fit: "contain",
    };
  } else if (asset.kind === "video") {
    clip = {
      kind: "video",
      id: input.id,
      stopId: input.stopId,
      assetId: asset.id,
      inUs: 0,
      outUs: asset.durationUs,
      volume: DEFAULT_CLIP_VOLUME,
      fit: "contain",
    };
  } else {
    throw new DomainError("kindMismatch", `Audio asset "${asset.id}" cannot be placed at a stop`);
  }
  return { ...project, clips: insertIntoStop(project.clips, clip, input.position) };
}

/** Moves a clip to `position` within a stop, which may be a different stop. */
export function moveClip(project: Project, id: ClipId, stopId: StopId, position: number): Project {
  findStop(project, stopId);
  const clip = { ...findClip(project, id), stopId };
  const rest = project.clips.filter((c) => c.id !== id);
  return { ...project, clips: insertIntoStop(rest, clip, position) };
}

export function removeClip(project: Project, id: ClipId): Project {
  findClip(project, id);
  return { ...project, clips: project.clips.filter((c) => c.id !== id) };
}

function updateClip<K extends Clip["kind"]>(
  project: Project,
  id: ClipId,
  kind: K,
  change: (clip: Extract<Clip, { kind: K }>) => Clip,
): Project {
  const clip = findClip(project, id);
  if (clip.kind !== kind) throw new DomainError("kindMismatch", `Clip "${id}" is not a ${kind} clip`);
  return { ...project, clips: replaceById(project.clips, change(clip as Extract<Clip, { kind: K }>)) };
}

export function setPhotoDuration(project: Project, id: ClipId, durationUs: Microseconds): Project {
  return updateClip(
    project,
    id,
    "photo",
    (clip): PhotoClip => ({ ...clip, durationUs: normalizePhotoDuration(durationUs) }),
  );
}

/**
 * Trims a video clip. Values are clamped to the asset's length, and the clip never becomes
 * shorter than the minimum; the edge being dragged yields when the two would cross.
 */
export function trimVideo(project: Project, id: ClipId, trim: { inUs?: Microseconds; outUs?: Microseconds }): Project {
  return updateClip(project, id, "video", (clip): VideoClip => {
    const asset = findAsset(project, clip.assetId);
    const length = asset.kind === "video" ? asset.durationUs : clip.outUs;
    const minimum = Math.min(MIN_VIDEO_CLIP, length);
    let inUs = clip.inUs;
    let outUs = clip.outUs;
    if (trim.outUs !== undefined) outUs = clamp(Math.round(trim.outUs), minimum, length);
    if (trim.inUs !== undefined) inUs = clamp(Math.round(trim.inUs), 0, length - minimum);
    if (outUs - inUs < minimum) {
      if (trim.inUs !== undefined) inUs = outUs - minimum;
      else outUs = inUs + minimum;
    }
    return { ...clip, inUs, outUs };
  });
}

export function setClipVolume(project: Project, id: ClipId, volume: number): Project {
  if (!Number.isFinite(volume)) throw invalid("Volume must be a number");
  return updateClip(project, id, "video", (clip): VideoClip => ({ ...clip, volume: clamp(volume, 0, 1) }));
}

export function setClipFit(project: Project, id: ClipId, fit: Fit): Project {
  const clip = findClip(project, id);
  return { ...project, clips: replaceById(project.clips, { ...clip, fit }) };
}

/** Length of a clip on the recap timeline. */
export function clipDuration(clip: Clip): Microseconds {
  return clip.kind === "photo" ? clip.durationUs : clip.outUs - clip.inUs;
}
