import { type AssetStore, MediaFailure } from "@tripreplay/app";
import { describe, expect, it } from "vitest";
import { contentHash, createMediaPort, inspectMediaFile } from "../../src/index.ts";
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
