import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isHeif, parseIso6709, readImageMetadata, readVideoMetadata } from "../src/index.ts";
import { withExif } from "./support/exif.ts";

/*
 * The fixtures are generated, with no camera data in them:
 *   kyoto.mp4  ffmpeg -f lavfi -i testsrc=size=320x180:rate=15:duration=2 -f lavfi -i sine=duration=2
 *              -c:v libvpx-vp9 -c:a libopus -metadata location=+35.0116+135.7681/
 *              -metadata creation_time=2026-04-01T01:15:00Z -movflags +faststart kyoto.mp4
 *   rotated.mp4  a 320×180 VP9 clip remuxed with ffmpeg -display_rotation 90 -c copy
 *   chile.mov  ffmpeg -f lavfi -i testsrc=size=160x90 -c:v mjpeg -metadata location=-33.8568-070.6483/ -f mov
 *   plain.jpg, plain.png  ImageMagick: convert -size 64x48 gradient:… and convert -size 40x30 xc:…
 */
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const reader = (bytes: Uint8Array) => async (offset: number, length: number) => bytes.slice(offset, offset + length);

describe("readImageMetadata", () => {
  const jpeg = fixture("plain.jpg");

  it("reads the size of JPEG and PNG files", () => {
    expect(readImageMetadata(jpeg)).toEqual({ format: "jpeg", width: 64, height: 48 });
    expect(readImageMetadata(fixture("plain.png"))).toEqual({ format: "png", width: 40, height: 30 });
    expect(readImageMetadata(fixture("notes.txt"))).toBeUndefined();
  });

  it("reads the capture time with its offset and the GPS position", () => {
    for (const littleEndian of [false, true]) {
      const tagged = withExif(jpeg, {
        dateTimeOriginal: "2026:04:01 10:15:30",
        offsetTimeOriginal: "+09:00",
        lat: 34.9949,
        lon: 135.785,
        littleEndian,
      });
      const metadata = readImageMetadata(tagged);
      expect(metadata?.captureTime).toBe("2026-04-01T10:15:30+09:00");
      expect(metadata?.gps?.lat).toBeCloseTo(34.9949, 4);
      expect(metadata?.gps?.lon).toBeCloseTo(135.785, 4);
    }
  });

  it("reads southern and western positions and local times without an offset", () => {
    const metadata = readImageMetadata(
      withExif(jpeg, { dateTimeOriginal: "2026:01:05 08:00:00", lat: -33.8568, lon: -70.6483 }),
    );
    expect(metadata?.captureTime).toBe("2026-01-05T08:00:00");
    expect(metadata?.gps?.lat).toBeCloseTo(-33.8568, 4);
    expect(metadata?.gps?.lon).toBeCloseTo(-70.6483, 4);
  });

  it("swaps the size of photos turned by a quarter and ignores empty values", () => {
    const turned = readImageMetadata(
      withExif(jpeg, { orientation: 6, dateTimeOriginal: "0000:00:00 00:00:00", lat: 0, lon: 0 }),
    );
    expect(turned).toEqual({ format: "jpeg", width: 48, height: 64 });
  });

  it("keeps the photo when its EXIF data is damaged", () => {
    const tagged = withExif(jpeg, { dateTimeOriginal: "2026:04:01 10:15:30" });
    tagged.set([0x12, 0x34], 10);
    expect(readImageMetadata(tagged)).toEqual({ format: "jpeg", width: 64, height: 48 });
  });
});

describe("readVideoMetadata", () => {
  it("reads duration, size, sound, creation time and the recorded location", async () => {
    const bytes = fixture("kyoto.mp4");
    const metadata = await readVideoMetadata(reader(bytes), bytes.length);
    expect(metadata).toMatchObject({ width: 320, height: 180, hasAudio: true, captureTime: "2026-04-01T01:15:00Z" });
    expect(metadata?.durationUs).toBeGreaterThan(1_900_000);
    expect(metadata?.durationUs).toBeLessThan(2_100_000);
    // MP4 writers record the location in a 3GPP `loci` box, with 16.16 fixed-point degrees.
    expect(metadata?.gps?.lat).toBeCloseTo(35.0116, 3);
    expect(metadata?.gps?.lon).toBeCloseTo(135.7681, 3);
  });

  it("reads the QuickTime location of a MOV file", async () => {
    const bytes = fixture("chile.mov");
    const metadata = await readVideoMetadata(reader(bytes), bytes.length);
    expect(metadata).toMatchObject({ width: 160, height: 90, hasAudio: false, captureTime: "2026-01-05T11:00:00Z" });
    expect(metadata?.gps).toEqual({ lat: -33.8568, lon: -70.6483 });
  });

  it("applies the track rotation to the size", async () => {
    const bytes = fixture("rotated.mp4");
    expect(await readVideoMetadata(reader(bytes), bytes.length)).toMatchObject({
      width: 180,
      height: 320,
      hasAudio: false,
    });
  });

  it("finds a moov box after the media data and rejects other files", async () => {
    const original = fixture("kyoto.mp4");
    // Move moov to the end, as cameras write it.
    const view = new DataView(original.buffer, original.byteOffset);
    const boxes: { type: string; bytes: Uint8Array }[] = [];
    for (let at = 0; at < original.length; ) {
      const size = view.getUint32(at);
      boxes.push({
        type: String.fromCharCode(...original.subarray(at + 4, at + 8)),
        bytes: original.subarray(at, at + size),
      });
      at += size;
    }
    const order = [...boxes.filter((b) => b.type !== "moov"), ...boxes.filter((b) => b.type === "moov")];
    const moved = new Uint8Array(original.length);
    let at = 0;
    for (const box of order) {
      moved.set(box.bytes, at);
      at += box.bytes.length;
    }
    expect((await readVideoMetadata(reader(moved), moved.length))?.width).toBe(320);
    const text = fixture("notes.txt");
    expect(await readVideoMetadata(reader(text), text.length)).toBeUndefined();
  });

  it("parses ISO 6709 locations and recognizes HEIF images", () => {
    expect(parseIso6709("-33.8568-070.6483+520.000/")).toEqual({ lat: -33.8568, lon: -70.6483 });
    expect(parseIso6709("+00.0000+000.0000/")).toBeUndefined();
    expect(parseIso6709("nowhere")).toBeUndefined();
    const heic = new Uint8Array(12);
    heic.set(new TextEncoder().encode("ftypheic"), 4);
    expect(isHeif(heic)).toBe(true);
    expect(isHeif(fixture("kyoto.mp4"))).toBe(false);
  });
});
