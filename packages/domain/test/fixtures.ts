import { addAsset, addStop, createProject, type Project, type Stop, seconds } from "../src/index.ts";

export function stop(id: string, date: string, lon = 135.76, lat = 35.0): Stop {
  return { id, name: id, description: "", date, location: { lon, lat } };
}

export function photo(id: string) {
  return {
    kind: "photo",
    id,
    contentHash: `h-${id}`,
    fileName: `${id}.jpg`,
    mimeType: "image/jpeg",
    byteSize: 1000,
    width: 4000,
    height: 3000,
    rotation: 0,
  } as const;
}

export function video(id: string, durationSeconds = 10) {
  return {
    kind: "video",
    id,
    contentHash: `h-${id}`,
    fileName: `${id}.mp4`,
    mimeType: "video/mp4",
    byteSize: 1000,
    width: 1920,
    height: 1080,
    rotation: 0,
    durationUs: seconds(durationSeconds),
    hasAudio: true,
  } as const;
}

export function audio(id: string, durationSeconds = 120) {
  return {
    kind: "audio",
    id,
    contentHash: `h-${id}`,
    fileName: `${id}.mp3`,
    mimeType: "audio/mpeg",
    byteSize: 1000,
    durationUs: seconds(durationSeconds),
  } as const;
}

/** Recursively freezes a value, so that tests fail if an operation mutates its input. */
export function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** Three stops over two days, with a photo and a video asset. */
export function sampleProject(): Project {
  let p = createProject({ id: "t1", title: "Kyoto", timeZone: "Asia/Tokyo", themeId: "classic" });
  p = addStop(p, stop("a", "2026-04-01"));
  p = addStop(p, stop("b", "2026-04-01"));
  p = addStop(p, stop("c", "2026-04-02"));
  p = addAsset(p, photo("p1"));
  p = addAsset(p, photo("p2"));
  p = addAsset(p, video("v1"));
  return deepFreeze(p);
}
