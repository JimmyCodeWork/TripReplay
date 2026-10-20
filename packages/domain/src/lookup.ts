import { notFound } from "./errors.ts";
import type { Asset, Clip, MusicTrack, Project, Stop } from "./model.ts";

export function findStop(project: Project, id: string): Stop {
  const stop = project.stops.find((s) => s.id === id);
  if (!stop) throw notFound("Stop", id);
  return stop;
}

export function findClip(project: Project, id: string): Clip {
  const clip = project.clips.find((c) => c.id === id);
  if (!clip) throw notFound("Clip", id);
  return clip;
}

export function findAsset(project: Project, id: string): Asset {
  const asset = project.assets.find((a) => a.id === id);
  if (!asset) throw notFound("Asset", id);
  return asset;
}

export function findMusicTrack(project: Project, id: string): MusicTrack {
  const track = project.music.find((m) => m.id === id);
  if (!track) throw notFound("Music track", id);
  return track;
}

export function clipsOfStop(project: Project, stopId: string): readonly Clip[] {
  return project.clips.filter((c) => c.stopId === stopId);
}

export function replaceById<T extends { readonly id: string }>(items: readonly T[], next: T): T[] {
  return items.map((item) => (item.id === next.id ? next : item));
}
