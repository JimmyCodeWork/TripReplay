/** Fields of a test EXIF segment. */
export interface TestExif {
  readonly orientation?: number;
  readonly dateTimeOriginal?: string;
  readonly offsetTimeOriginal?: string;
  /** Degrees; negative values are written with the S or W reference. */
  readonly lat?: number;
  readonly lon?: number;
  readonly littleEndian?: boolean;
}

type Field = { tag: number; type: 2 | 3 | 4 | 5; values: number[] | string };

/** Writes a TIFF structure with IFD0, an EXIF IFD and a GPS IFD, as cameras do. */
export function buildTiff(exif: TestExif): Uint8Array {
  const little = exif.littleEndian ?? false;
  const dms = (value: number) => {
    const abs = Math.abs(value);
    const d = Math.floor(abs);
    const m = Math.floor((abs - d) * 60);
    const s = (abs - d - m / 60) * 3600;
    return [d, 1, m, 1, Math.round(s * 1000), 1000];
  };
  const ifd0: Field[] = [];
  const exifIfd: Field[] = [];
  const gps: Field[] = [];
  if (exif.orientation !== undefined) ifd0.push({ tag: 0x0112, type: 3, values: [exif.orientation] });
  if (exif.dateTimeOriginal) exifIfd.push({ tag: 0x9003, type: 2, values: exif.dateTimeOriginal });
  if (exif.offsetTimeOriginal) exifIfd.push({ tag: 0x9011, type: 2, values: exif.offsetTimeOriginal });
  if (exif.lat !== undefined && exif.lon !== undefined) {
    gps.push(
      { tag: 1, type: 2, values: exif.lat < 0 ? "S" : "N" },
      { tag: 2, type: 5, values: dms(exif.lat) },
      { tag: 3, type: 2, values: exif.lon < 0 ? "W" : "E" },
      { tag: 4, type: 5, values: dms(exif.lon) },
    );
  }
  const out = new Uint8Array(4096);
  const view = new DataView(out.buffer);
  const u16 = (at: number, v: number) => view.setUint16(at, v, little);
  const u32 = (at: number, v: number) => view.setUint32(at, v, little);
  u16(0, little ? 0x4949 : 0x4d4d);
  u16(2, 42);
  u32(4, 8);
  let data = 1024;
  const write = (at: number, fields: Field[], links: Field[] = []) => {
    const all = [...fields, ...links].sort((a, b) => a.tag - b.tag);
    u16(at, all.length);
    all.forEach((field, i) => {
      const base = at + 2 + i * 12;
      u16(base, field.tag);
      u16(base + 2, field.type);
      if (typeof field.values === "string") {
        const bytes = new TextEncoder().encode(`${field.values}\0`);
        u32(base + 4, bytes.length);
        if (bytes.length <= 4) out.set(bytes, base + 8);
        else {
          out.set(bytes, data);
          u32(base + 8, data);
          data += bytes.length + (bytes.length % 2);
        }
      } else if (field.type === 5) {
        u32(base + 4, field.values.length / 2);
        u32(base + 8, data);
        for (const v of field.values) {
          u32(data, v);
          data += 4;
        }
      } else {
        u32(base + 4, field.values.length);
        if (field.type === 3) u16(base + 8, field.values[0] ?? 0);
        else u32(base + 8, field.values[0] ?? 0);
      }
    });
    u32(at + 2 + all.length * 12, 0);
  };
  const exifAt = 256;
  const gpsAt = 512;
  write(8, ifd0, [
    ...(exifIfd.length ? [{ tag: 0x8769, type: 4 as const, values: [exifAt] }] : []),
    ...(gps.length ? [{ tag: 0x8825, type: 4 as const, values: [gpsAt] }] : []),
  ]);
  if (exifIfd.length) write(exifAt, exifIfd);
  if (gps.length) write(gpsAt, gps);
  return out.subarray(0, data);
}

/** Inserts an EXIF APP1 segment after the start of a JPEG. */
export function withExif(jpeg: Uint8Array, exif: TestExif): Uint8Array {
  const tiff = buildTiff(exif);
  const segment = new Uint8Array(4 + 6 + tiff.length);
  const view = new DataView(segment.buffer);
  view.setUint16(0, 0xffe1);
  view.setUint16(2, 2 + 6 + tiff.length);
  segment.set(new TextEncoder().encode("Exif\0\0"), 4);
  segment.set(tiff, 10);
  const out = new Uint8Array(jpeg.length + segment.length);
  out.set(jpeg.subarray(0, 2));
  out.set(segment, 2);
  out.set(jpeg.subarray(2), 2 + segment.length);
  return out;
}
