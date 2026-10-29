/** What a photo file says about itself, read from its bytes. */
export interface ImageMetadata {
  readonly format: "jpeg" | "png";
  /** Size as displayed, after the EXIF orientation is applied. */
  readonly width: number;
  readonly height: number;
  /** ISO 8601 date-time, with an offset when the file records one. */
  readonly captureTime?: string;
  readonly gps?: { readonly lon: number; readonly lat: number };
}

const TAG = {
  orientation: 0x0112,
  exifIfd: 0x8769,
  gpsIfd: 0x8825,
  dateTimeOriginal: 0x9003,
  offsetTimeOriginal: 0x9011,
  gpsLatitudeRef: 1,
  gpsLatitude: 2,
  gpsLongitudeRef: 3,
  gpsLongitude: 4,
} as const;

/** Byte sizes of the TIFF field types: BYTE, ASCII, SHORT, LONG, RATIONAL, …, SLONG, SRATIONAL. */
const TYPE_SIZE: Readonly<Record<number, number>> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

interface Entry {
  readonly type: number;
  readonly count: number;
  /** Offset of the value in the TIFF data: inline values sit in the entry itself. */
  readonly offset: number;
}

/** A TIFF structure inside an EXIF segment; offsets are relative to its start. */
class Tiff {
  private readonly view: DataView;
  private readonly little: boolean;

  constructor(bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const order = this.view.getUint16(0);
    if (order !== 0x4949 && order !== 0x4d4d) throw new Error("No TIFF byte order");
    this.little = order === 0x4949;
  }

  get length() {
    return this.view.byteLength;
  }

  u16 = (at: number) => this.view.getUint16(at, this.little);
  u32 = (at: number) => this.view.getUint32(at, this.little);

  firstIfd(): number {
    return this.u32(4);
  }

  /** The entries of the directory at `at`, by tag. */
  entries(at: number): Map<number, Entry> {
    const entries = new Map<number, Entry>();
    if (at <= 0 || at + 2 > this.length) return entries;
    const count = this.u16(at);
    for (let i = 0; i < count; i++) {
      const base = at + 2 + i * 12;
      if (base + 12 > this.length) break;
      const type = this.u16(base + 2);
      const n = this.u32(base + 4);
      const size = (TYPE_SIZE[type] ?? 1) * n;
      entries.set(this.u16(base), { type, count: n, offset: size <= 4 ? base + 8 : this.u32(base + 8) });
    }
    return entries;
  }

  number(entry: Entry | undefined): number | undefined {
    if (!entry || entry.offset + 4 > this.length) return undefined;
    if (entry.type === 3) return this.u16(entry.offset);
    if (entry.type === 4) return this.u32(entry.offset);
    return undefined;
  }

  text(entry: Entry | undefined): string | undefined {
    if (entry?.type !== 2 || entry.offset + entry.count > this.length) return undefined;
    let out = "";
    for (let i = 0; i < entry.count; i++) {
      const c = this.view.getUint8(entry.offset + i);
      if (c === 0) break;
      out += String.fromCharCode(c);
    }
    return out.trim();
  }

  rationals(entry: Entry | undefined): number[] | undefined {
    if (entry?.type !== 5 || entry.offset + entry.count * 8 > this.length) return undefined;
    const values: number[] = [];
    for (let i = 0; i < entry.count; i++) {
      const denominator = this.u32(entry.offset + i * 8 + 4);
      values.push(denominator === 0 ? Number.NaN : this.u32(entry.offset + i * 8) / denominator);
    }
    return values;
  }
}

/** "2026:04:01 10:15:00" and an optional "+09:00" as ISO 8601. */
function exifTime(value: string | undefined, offset: string | undefined): string | undefined {
  const match = value && /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!match || match[1] === "0000") return undefined;
  const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}`;
  return offset && /^[+-]\d{2}:\d{2}$/.test(offset) ? iso + offset : iso;
}

function degrees(values: number[] | undefined, ref: string | undefined, negative: string): number | undefined {
  if (!values || values.length < 3 || values.some((v) => !Number.isFinite(v))) return undefined;
  const [d = 0, m = 0, s = 0] = values;
  const value = d + m / 60 + s / 3600;
  return ref?.toUpperCase() === negative ? -value : value;
}

interface Exif {
  readonly orientation?: number;
  readonly captureTime?: string;
  readonly gps?: { readonly lon: number; readonly lat: number };
}

/** Reads orientation, capture time and position from the TIFF data of an EXIF segment. */
export function readExif(bytes: Uint8Array): Exif {
  const tiff = new Tiff(bytes);
  const ifd0 = tiff.entries(tiff.firstIfd());
  const exif = tiff.entries(tiff.number(ifd0.get(TAG.exifIfd)) ?? 0);
  const gpsIfd = tiff.entries(tiff.number(ifd0.get(TAG.gpsIfd)) ?? 0);
  const lat = degrees(tiff.rationals(gpsIfd.get(TAG.gpsLatitude)), tiff.text(gpsIfd.get(TAG.gpsLatitudeRef)), "S");
  const lon = degrees(tiff.rationals(gpsIfd.get(TAG.gpsLongitude)), tiff.text(gpsIfd.get(TAG.gpsLongitudeRef)), "W");
  const captureTime = exifTime(tiff.text(exif.get(TAG.dateTimeOriginal)), tiff.text(exif.get(TAG.offsetTimeOriginal)));
  const orientation = tiff.number(ifd0.get(TAG.orientation));
  // 0, 0 is what cameras write without a fix.
  const hasGps =
    lat !== undefined && lon !== undefined && (lat !== 0 || lon !== 0) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  return {
    ...(orientation === undefined ? {} : { orientation }),
    ...(captureTime ? { captureTime } : {}),
    ...(hasGps ? { gps: { lon, lat } } : {}),
  };
}

/** Start-of-frame markers, which carry the image size; C4, C8 and CC are other segments. */
const isStartOfFrame = (marker: number) =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;

function readJpeg(bytes: Uint8Array): ImageMetadata | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let exif: Exif = {};
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return undefined;
    const marker = bytes[at + 1] as number;
    if (marker === 0xff) {
      at++;
      continue;
    }
    const length = view.getUint16(at + 2);
    const start = at + 4;
    if (marker === 0xe1 && String.fromCharCode(...bytes.subarray(start, start + 6)) === "Exif\0\0") {
      try {
        exif = readExif(bytes.subarray(start + 6, at + 2 + length));
      } catch {
        // Damaged EXIF: the photo is still usable, without metadata.
      }
    }
    if (isStartOfFrame(marker) && start + 5 <= bytes.length) {
      const height = view.getUint16(start + 1);
      const width = view.getUint16(start + 3);
      // Orientations 5 to 8 turn the picture by a quarter.
      const turned = (exif.orientation ?? 1) >= 5 && (exif.orientation ?? 1) <= 8;
      return {
        format: "jpeg",
        width: turned ? height : width,
        height: turned ? width : height,
        ...(exif.captureTime ? { captureTime: exif.captureTime } : {}),
        ...(exif.gps ? { gps: exif.gps } : {}),
      };
    }
    if (marker === 0xda) return undefined;
    at += 2 + length;
  }
  return undefined;
}

function readPng(bytes: Uint8Array): ImageMetadata | undefined {
  if (bytes.length < 24 || String.fromCharCode(...bytes.subarray(12, 16)) !== "IHDR") return undefined;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { format: "png", width: view.getUint32(16), height: view.getUint32(20) };
}

/** How many leading bytes `readImageMetadata` needs: the EXIF segment comes before the image data. */
export const IMAGE_HEAD_BYTES = 256 * 1024;

/**
 * Reads the size, capture time and position of a JPEG or PNG from its first bytes. Undefined when
 * the bytes are neither, or the size cannot be found in them.
 */
export function readImageMetadata(head: Uint8Array): ImageMetadata | undefined {
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return readJpeg(head);
  if (head[0] === 0x89 && String.fromCharCode(...head.subarray(1, 4)) === "PNG") return readPng(head);
  return undefined;
}
