import { compile } from "@tripreplay/timeline";

type Project = Parameters<typeof compile>[0];
const S = 1_000_000;

/** A trip of two stops, a video with sound at the second, and music under everything. */
export const project: Project = {
  trip: {
    id: "t",
    schemaVersion: 1,
    title: "京都",
    timeZone: "Asia/Tokyo",
    themeId: "classic",
    aspectRatio: "16:9",
    revision: 0,
  },
  stops: [
    { id: "a", name: "清水寺", description: "", date: "2026-04-01", location: { lon: 135.785, lat: 34.9949 } },
    { id: "b", name: "金閣寺", description: "", date: "2026-04-01", location: { lon: 135.7292, lat: 35.0394 } },
  ],
  clips: [{ kind: "video", id: "c1", stopId: "b", assetId: "v", inUs: 1 * S, outUs: 3 * S, volume: 1, fit: "contain" }],
  assets: [
    {
      kind: "video",
      id: "v",
      contentHash: "v",
      fileName: "v.mp4",
      mimeType: "video/mp4",
      byteSize: 1,
      width: 4,
      height: 3,
      rotation: 0,
      durationUs: 10 * S,
      hasAudio: true,
    },
    {
      kind: "audio",
      id: "m",
      contentHash: "m",
      fileName: "m.mp3",
      mimeType: "audio/mpeg",
      byteSize: 1,
      durationUs: 60 * S,
    },
  ],
  music: [
    {
      id: "t1",
      assetId: "m",
      startUs: 0,
      inUs: 0,
      outUs: 60 * S,
      volume: 0.7,
      fadeInUs: 0,
      fadeOutUs: 0,
      duckUnderClips: true,
    },
  ],
};

export const timeline = compile(project);
