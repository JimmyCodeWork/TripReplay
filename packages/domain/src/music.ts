import { DomainError, invalid } from "./errors.ts";
import { DEFAULT_MUSIC_FADE, DEFAULT_MUSIC_VOLUME, MIN_MUSIC_CLIP } from "./limits.ts";
import { findAsset, findMusicTrack, replaceById } from "./lookup.ts";
import type { AssetId, MusicTrack, MusicTrackId, Project } from "./model.ts";
import { clamp, type Microseconds } from "./time.ts";

export function addMusicTrack(
  project: Project,
  input: { id: MusicTrackId; assetId: AssetId; startUs?: Microseconds },
): Project {
  if (project.music.some((m) => m.id === input.id)) throw invalid(`Music track "${input.id}" already exists`);
  const asset = findAsset(project, input.assetId);
  if (asset.kind !== "audio") throw new DomainError("kindMismatch", `Asset "${asset.id}" is not audio`);
  const fade = Math.min(DEFAULT_MUSIC_FADE, Math.floor(asset.durationUs / 2));
  const track: MusicTrack = {
    id: input.id,
    assetId: asset.id,
    startUs: Math.max(0, Math.round(input.startUs ?? 0)),
    inUs: 0,
    outUs: asset.durationUs,
    volume: DEFAULT_MUSIC_VOLUME,
    fadeInUs: fade,
    fadeOutUs: fade,
    duckUnderClips: true,
  };
  return { ...project, music: [...project.music, track] };
}

function update(
  project: Project,
  id: MusicTrackId,
  change: (track: MusicTrack, length: Microseconds) => MusicTrack,
): Project {
  const track = findMusicTrack(project, id);
  const asset = findAsset(project, track.assetId);
  const length = asset.kind === "audio" ? asset.durationUs : track.outUs;
  const next = change(track, length);
  const span = next.outUs - next.inUs;
  const fadeInUs = clamp(next.fadeInUs, 0, span);
  const fadeOutUs = clamp(next.fadeOutUs, 0, span - fadeInUs);
  return { ...project, music: replaceById(project.music, { ...next, fadeInUs, fadeOutUs }) };
}

/** Moves a track along the recap timeline. */
export function moveMusicTrack(project: Project, id: MusicTrackId, startUs: Microseconds): Project {
  return update(project, id, (track) => ({ ...track, startUs: Math.max(0, Math.round(startUs)) }));
}

/** Trims either end of a track, keeping at least the minimum length. */
export function trimMusicTrack(
  project: Project,
  id: MusicTrackId,
  trim: { inUs?: Microseconds; outUs?: Microseconds },
): Project {
  return update(project, id, (track, length) => {
    const minimum = Math.min(MIN_MUSIC_CLIP, length);
    let inUs = track.inUs;
    let outUs = track.outUs;
    if (trim.outUs !== undefined) outUs = clamp(Math.round(trim.outUs), minimum, length);
    if (trim.inUs !== undefined) inUs = clamp(Math.round(trim.inUs), 0, length - minimum);
    if (outUs - inUs < minimum) {
      if (trim.inUs !== undefined) inUs = outUs - minimum;
      else outUs = inUs + minimum;
    }
    return { ...track, inUs, outUs };
  });
}

export interface MusicSettings {
  readonly volume?: number;
  readonly fadeInUs?: Microseconds;
  readonly fadeOutUs?: Microseconds;
  readonly duckUnderClips?: boolean;
}

export function updateMusicSettings(project: Project, id: MusicTrackId, settings: MusicSettings): Project {
  if (settings.volume !== undefined && !Number.isFinite(settings.volume)) throw invalid("Volume must be a number");
  return update(project, id, (track) => ({
    ...track,
    ...settings,
    volume: clamp(settings.volume ?? track.volume, 0, 1),
  }));
}

export function removeMusicTrack(project: Project, id: MusicTrackId): Project {
  findMusicTrack(project, id);
  return { ...project, music: project.music.filter((m) => m.id !== id) };
}
