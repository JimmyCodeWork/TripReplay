import {
  addAsset,
  addClip,
  addMusicTrack,
  addStop,
  createProject,
  type Project,
  type Stop,
  seconds,
} from "@tripreplay/domain";
import { type FrameDescription, renderAt, type Timeline } from "../src/index.ts";

export function stop(id: string, date: string, lon: number, lat: number): Stop {
  return { id, name: id, description: "", date, location: { lon, lat } };
}

const base = { contentHash: "", mimeType: "", byteSize: 1, fileName: "" } as const;

export function withStops(stops: readonly Stop[], themeId = "classic"): Project {
  let p = createProject({ id: "t", title: "Trip", timeZone: "Asia/Taipei", themeId });
  for (const s of stops) p = addStop(p, s);
  return p;
}

/**
 * Two days in Kyoto: stop a has two photos and a video with sound, stop b has nothing, stop c has a
 * muted video. Background music starts at 0.
 */
export function kyoto(): Project {
  let p = withStops([
    stop("a", "2026-04-01", 135.7681, 35.0116),
    stop("b", "2026-04-01", 135.7292, 35.0394),
    stop("c", "2026-04-03", 135.6739, 35.0094),
  ]);
  p = addAsset(p, { ...base, kind: "photo", id: "p1", contentHash: "1", width: 4, height: 3, rotation: 0 });
  p = addAsset(p, { ...base, kind: "photo", id: "p2", contentHash: "2", width: 4, height: 3, rotation: 0 });
  p = addAsset(p, {
    ...base,
    kind: "video",
    id: "v1",
    contentHash: "3",
    width: 16,
    height: 9,
    rotation: 0,
    durationUs: seconds(4),
    hasAudio: true,
  });
  p = addAsset(p, {
    ...base,
    kind: "video",
    id: "v2",
    contentHash: "4",
    width: 16,
    height: 9,
    rotation: 0,
    durationUs: seconds(2),
    hasAudio: false,
  });
  p = addAsset(p, { ...base, kind: "audio", id: "m1", contentHash: "5", durationUs: seconds(300) });
  p = addClip(p, { id: "c1", stopId: "a", assetId: "p1" });
  p = addClip(p, { id: "c2", stopId: "a", assetId: "p2" });
  p = addClip(p, { id: "c3", stopId: "a", assetId: "v1" });
  p = addClip(p, { id: "c4", stopId: "c", assetId: "v2" });
  p = addMusicTrack(p, { id: "track", assetId: "m1" });
  return deepFreeze(p);
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** Frames at 30 fps over the whole recap, including the last instant. */
export function frames(timeline: Timeline, fps = 30): FrameDescription[] {
  const step = 1_000_000 / fps;
  const result: FrameDescription[] = [];
  for (let t = 0; t < timeline.durationUs; t += step) result.push(renderAt(timeline, Math.round(t)));
  result.push(renderAt(timeline, timeline.durationUs));
  return result;
}

/** Every number nested in a value. */
export function numbersIn(value: unknown): number[] {
  if (typeof value === "number") return [value];
  if (value && typeof value === "object") return Object.values(value).flatMap(numbersIn);
  return [];
}
