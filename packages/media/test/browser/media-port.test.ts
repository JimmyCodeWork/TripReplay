import { type AssetStore, MediaFailure } from "@tripreplay/app";
import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import { createFile, MP4BoxBuffer } from "mp4box";
import { describe, expect, it } from "vitest";
import { contentHash, createMediaPort, inspectMediaFile, shrinkPhoto } from "../../src/index.ts";
import { shrinkVideo } from "../../src/shrink-video.ts";
import { withExif } from "../support/exif.ts";

const FIXTURES = {
  jpeg: new URL("../fixtures/plain.jpg", import.meta.url),
  png: new URL("../fixtures/plain.png", import.meta.url),
  video: new URL("../fixtures/kyoto.mp4", import.meta.url),
  text: new URL("../fixtures/notes.txt", import.meta.url),
};

async function file(url: URL, name: string, transform?: (bytes: Uint8Array) => Uint8Array): Promise<File> {
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  return new File([(transform ? transform(bytes) : bytes) as Uint8Array<ArrayBuffer>], name);
}

class MemoryStore implements AssetStore<Blob> {
  readonly files = new Map<string, Blob>();
  async put(id: string, source: AsyncIterable<Uint8Array>, size: number) {
    const parts: Uint8Array[] = [];
    for await (const part of source) parts.push(part);
    const blob = new Blob(parts as Uint8Array<ArrayBuffer>[]);
    if (blob.size !== size) throw new Error("size mismatch");
    this.files.set(id, blob);
  }
  open = async (id: string) => this.files.get(id);
  remove = async (id: string) => void this.files.delete(id);
  list = async () => [...this.files.keys()];
}

describe("inspectMediaFile", () => {
  it("reads a photo's size, capture time and position, and hashes its content", async () => {
    const photo = await file(FIXTURES.jpeg, "IMG_0001.JPG", (bytes) =>
      withExif(bytes, {
        dateTimeOriginal: "2026:04:01 10:15:30",
        offsetTimeOriginal: "+09:00",
        lat: 34.9949,
        lon: 135.785,
      }),
    );
    const info = await inspectMediaFile(photo);
    expect(info).toMatchObject({
      kind: "photo",
      fileName: "IMG_0001.JPG",
      mimeType: "image/jpeg",
      byteSize: photo.size,
      width: 64,
      height: 48,
      rotation: 0,
      captureTime: "2026-04-01T10:15:30+09:00",
    });
    expect(info.gps?.lat).toBeCloseTo(34.9949, 4);
    const digest = await crypto.subtle.digest("SHA-256", await photo.arrayBuffer());
    expect(info.contentHash).toBe(
      `sha256:${[...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("")}`,
    );
    expect((await inspectMediaFile(await file(FIXTURES.png, "map.png"))).mimeType).toBe("image/png");
  });

  it("reads a video the browser can play, with its sound and location", async () => {
    const info = await inspectMediaFile(await file(FIXTURES.video, "kyoto.mp4"));
    expect(info).toMatchObject({ kind: "video", mimeType: "video/mp4", width: 320, height: 180, hasAudio: true });
    if (info.kind !== "video") throw new Error("not a video");
    expect(info.durationUs).toBeGreaterThan(1_900_000);
    expect(info.captureTime).toBe("2026-04-01T01:15:00Z");
    expect(info.gps?.lon).toBeCloseTo(135.7681, 3);
  });

  it("reads music, recognized by its bytes", async () => {
    const rate = 8000;
    const samples = rate * 2;
    const view = new DataView(new ArrayBuffer(44 + samples * 2));
    const text = (at: number, value: string) => {
      for (const [i, c] of [...value].entries()) view.setUint8(at + i, c.charCodeAt(0));
    };
    text(0, "RIFF");
    view.setUint32(4, 36 + samples * 2, true);
    text(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    text(36, "data");
    view.setUint32(40, samples * 2, true);
    const info = await inspectMediaFile(new File([view.buffer], "song.dat"));
    expect(info).toMatchObject({ kind: "audio", mimeType: "audio/wav", fileName: "song.dat" });
    if (info.kind !== "audio") throw new Error("not audio");
    expect(info.durationUs).toBeCloseTo(2_000_000, -4);
  });

  it("rejects files that are neither, whatever their name", async () => {
    const error = await inspectMediaFile(await file(FIXTURES.text, "holiday.jpg")).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MediaFailure);
    expect((error as MediaFailure).reason).toBe("unsupported");
    // A JPEG header with nothing decodable behind it.
    const broken = await inspectMediaFile(
      await file(FIXTURES.jpeg, "broken.jpg", (bytes) => bytes.subarray(0, 200)),
    ).catch((e: unknown) => e);
    expect((broken as MediaFailure).reason).toBe("unsupported");
  });
});

describe("createMediaPort", () => {
  it("stores a file under its asset id and removes it again", async () => {
    const store = new MemoryStore();
    const media = createMediaPort({ store });
    const video = await file(FIXTURES.video, "kyoto.mp4");
    expect(media.fileName(video)).toBe("kyoto.mp4");
    await media.store(video, "a1");
    expect(new Uint8Array(await (store.files.get("a1") as Blob).arrayBuffer())).toEqual(
      new Uint8Array(await video.arrayBuffer()),
    );
    await media.discard("a1");
    expect(store.files.size).toBe(0);
  });

  it("reports a file that cannot be stored", async () => {
    const store = new MemoryStore();
    store.put = async () => {
      throw new Error("QuotaExceededError");
    };
    const error = await createMediaPort({ store })
      .store(await file(FIXTURES.png, "map.png"), "a1")
      .catch((e: unknown) => e);
    expect((error as MediaFailure).reason).toBe("failed");
  });
});

describe("contentHash", () => {
  it("is equal for equal content and different otherwise", async () => {
    const a = await contentHash(new Blob(["abc"]));
    expect(a).toBe(await contentHash(new Blob(["abc"])));
    expect(a).not.toBe(await contentHash(new Blob(["abd"])));
  });
});

/** A noisy photo, which compresses as poorly as a camera's, as an encoded file. */
async function camera(width: number, height: number, type = "image/jpeg"): Promise<File> {
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
  const pixels = context.createImageData(width, height);
  for (let i = 0; i < pixels.data.length; i += 4) {
    const v = (i * 2654435761) >>> 24;
    pixels.data.set([v, (v * 3) & 255, (v * 7) & 255, 255], i);
  }
  context.putImageData(pixels, 0, 0);
  const blob = await canvas.convertToBlob({ type, quality: 0.98 });
  return new File([blob], `IMG.${type.split("/")[1]}`, { type });
}

describe("shrinkPhoto", () => {
  it("makes a large photo at most 2560 pixels on its longest side, as a smaller JPEG", async () => {
    const original = await camera(4000, 3000);
    const shrunk = await shrinkPhoto(original);
    expect(shrunk).toMatchObject({ width: 2560, height: 1920, mimeType: "image/jpeg" });
    expect(shrunk?.blob.size).toBeLessThan(original.size * 0.8);
    const decoded = await createImageBitmap(shrunk?.blob as Blob);
    expect([decoded.width, decoded.height]).toEqual([2560, 1920]);
  });

  it("keeps photos that would not get noticeably smaller, and those it cannot decode", async () => {
    const small = await file(FIXTURES.jpeg, "small.jpg");
    expect(await shrinkPhoto(small)).toBeUndefined();
    expect(await shrinkPhoto(new File(["not a photo"], "x.jpg", { type: "image/jpeg" }))).toBeUndefined();
  });

  it("is offered by the media port, keeping the file's name", async () => {
    const port = createMediaPort({ store: new MemoryStore() });
    const shrunk = await port.shrinkPhoto?.(await camera(3000, 4000, "image/png"));
    expect(shrunk).toMatchObject({ width: 1920, height: 2560, mimeType: "image/jpeg" });
    expect(shrunk?.file.name).toBe("IMG.png");
    expect(shrunk?.byteSize).toBe(shrunk?.file.size);
  });
});

/** Two seconds of noisy 720p video with sound, recorded turned by 90°, as a camera would. */
async function cameraVideo(): Promise<File> {
  const [width, height, fps, frames] = [1280, 720, 30, 60];
  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    fastStart: "in-memory",
    video: { codec: "vp9", width, height, rotation: 90 },
    audio: { codec: "opus", numberOfChannels: 2, sampleRate: 48_000 },
  });
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      throw e;
    },
  });
  encoder.configure({ codec: "vp09.00.40.08", width, height, framerate: fps, bitrate: 20_000_000 });
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d") as OffscreenCanvasRenderingContext2D;
  const pixels = context.createImageData(width, height);
  for (let f = 0; f < frames; f++) {
    for (let i = 0; i < pixels.data.length; i += 4) {
      const v = ((i + f * 7919) * 2654435761) >>> 24;
      pixels.data.set([v, (v * 3) & 255, (v * 7) & 255, 255], i);
    }
    context.putImageData(pixels, 0, 0);
    const frame = new VideoFrame(canvas, { timestamp: (f * 1_000_000) / fps, duration: 1_000_000 / fps });
    encoder.encode(frame, { keyFrame: f % 30 === 0 });
    frame.close();
  }
  await encoder.flush();
  const audio = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => {
      throw e;
    },
  });
  audio.configure({ codec: "opus", sampleRate: 48_000, numberOfChannels: 2, bitrate: 96_000 });
  const samples = new Float32Array(48_000 * 2 * 2).map((_, i) => Math.sin(i / 20) * 0.3);
  audio.encode(
    new AudioData({
      format: "f32",
      sampleRate: 48_000,
      numberOfFrames: 96_000,
      numberOfChannels: 2,
      timestamp: 0,
      data: samples,
    }),
  );
  await audio.flush();
  muxer.finalize();
  return new File([target.buffer], "VID_0001.mp4", { type: "video/mp4" });
}

async function tracksOf(blob: Blob) {
  const iso = createFile();
  const ready = new Promise<
    { type?: string; matrix: ArrayLike<number>; nb_samples: number; video?: { width: number; height: number } }[]
  >((resolve) => {
    iso.onReady = (info) => resolve(info.tracks);
  });
  iso.appendBuffer(MP4BoxBuffer.fromArrayBuffer(await blob.arrayBuffer(), 0));
  iso.flush();
  return ready;
}

describe("shrinkVideo", () => {
  it("encodes a large video again at the smaller size, keeping its sound and rotation", async () => {
    const original = await cameraVideo();
    const progress: number[] = [];
    const shrunk = await shrinkVideo(original, { maxSide: 640, onProgress: (share) => void progress.push(share) });
    expect(shrunk).toMatchObject({ width: 360, height: 640, mimeType: "video/mp4" });
    expect(shrunk?.blob.size).toBeLessThan(original.size * 0.8);
    expect(progress.at(-1)).toBe(1);
    const [before, after] = [await tracksOf(original), await tracksOf(shrunk?.blob as Blob)];
    const video = after.find((t) => t.type === "video");
    expect(video?.video).toEqual({ width: 640, height: 360 });
    expect(Array.from(video?.matrix ?? [])).toEqual(Array.from(before.find((t) => t.type === "video")?.matrix ?? []));
    expect(video?.nb_samples).toBe(60);
    expect(after.find((t) => t.type === "audio")?.nb_samples).toBe(before.find((t) => t.type === "audio")?.nb_samples);
    // The browser plays the copy, turned as recorded.
    const shown = await inspectMediaFile(new File([shrunk?.blob as Blob], "copy.mp4"));
    expect(shown).toMatchObject({ kind: "video", width: 360, height: 640, hasAudio: true });
  });

  it("keeps videos that are already small, and files that are not video", async () => {
    expect(await shrinkVideo(await file(FIXTURES.video, "kyoto.mp4"))).toBeUndefined();
    expect(await shrinkVideo(await file(FIXTURES.text, "notes.txt"))).toBeUndefined();
  });

  it("stops when cancelled", async () => {
    const controller = new AbortController();
    controller.abort(new Error("stop"));
    await expect(shrinkVideo(await cameraVideo(), { maxSide: 640, signal: controller.signal })).rejects.toThrow("stop");
  });
});
