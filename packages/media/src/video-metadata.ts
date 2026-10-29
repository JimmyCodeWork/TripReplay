/** Reads `length` bytes at `offset` of a file; fewer at its end. */
export type ReadBytes = (offset: number, length: number) => Promise<Uint8Array>;

/** What an MP4 or QuickTime file says about itself, read from its `moov` box. */
export interface VideoMetadata {
  readonly durationUs: number;
  /** Size as displayed, after the track's rotation. */
  readonly width: number;
  readonly height: number;
  readonly hasAudio: boolean;
  /** ISO 8601 date-time: the recorded local time with its offset, or the creation time in UTC. */
  readonly captureTime?: string;
  readonly gps?: { readonly lon: number; readonly lat: number };
}

interface Box {
  readonly type: string;
  /** Offset of the content, after the header. */
  readonly start: number;
  readonly end: number;
}

/** Largest `moov` box read into memory; real ones are a few megabytes at most. */
const MAX_MOOV = 64 * 1024 * 1024;
/** Seconds from 1904-01-01, the MP4 epoch, to 1970-01-01. */
const MP4_EPOCH_S = 2_082_844_800;

const fourCc = (bytes: Uint8Array, at: number) => String.fromCharCode(...bytes.subarray(at, at + 4));

/** The boxes in `bytes` between `start` and `end`. */
function children(bytes: Uint8Array, start: number, end: number): Box[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxes: Box[] = [];
  let at = start;
  while (at + 8 <= end) {
    let size = view.getUint32(at);
    let header = 8;
    if (size === 1 && at + 16 <= end) {
      size = Number(view.getBigUint64(at + 8));
      header = 16;
    } else if (size === 0) size = end - at;
    if (size < header || at + size > end) break;
    boxes.push({ type: fourCc(bytes, at + 4), start: at + header, end: at + size });
    at += size;
  }
  return boxes;
}

const child = (bytes: Uint8Array, box: Box | undefined, type: string) =>
  box && children(bytes, box.start, box.end).find((b) => b.type === type);

/** ISO 6709 as written by phones: "+35.0116+135.7681+045.000/". */
export function parseIso6709(value: string): { lon: number; lat: number } | undefined {
  const match = /^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/.exec(value.trim());
  if (!match) return undefined;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return undefined;
  return { lon, lat };
}

/** The 3GPP location box that MP4 writers use: fixed-point longitude and latitude after a name. */
function readLoci(bytes: Uint8Array, box: Box): { lon: number; lat: number } | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // Version and flags, language, then a name ending in a zero byte, and the role.
  let at = box.start + 6;
  while (at < box.end && bytes[at] !== 0) at++;
  at += 2;
  if (at + 8 > box.end) return undefined;
  const lon = view.getInt32(at) / 65536;
  const lat = view.getInt32(at + 4) / 65536;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return undefined;
  return { lon: Math.round(lon * 1e4) / 1e4, lat: Math.round(lat * 1e4) / 1e4 };
}

/** Apple's metadata: `keys` names the items of `ilst` by index. */
function appleMetadata(bytes: Uint8Array, meta: Box): Map<string, string> {
  const values = new Map<string, string>();
  // In QuickTime files `meta` has no version field; in MP4 files it has four bytes of one.
  const start = fourCc(bytes, meta.start + 4) === "hdlr" ? meta.start : meta.start + 4;
  const boxes = children(bytes, start, meta.end);
  const keys = boxes.find((b) => b.type === "keys");
  const items = boxes.find((b) => b.type === "ilst");
  if (!keys || !items) return values;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const names: string[] = [];
  let at = keys.start + 8;
  while (at + 8 <= keys.end) {
    const size = view.getUint32(at);
    if (size < 8) break;
    names.push(new TextDecoder().decode(bytes.subarray(at + 8, at + size)));
    at += size;
  }
  for (const item of children(bytes, items.start, items.end)) {
    const index = view.getUint32(item.start - 4);
    const data = children(bytes, item.start, item.end).find((b) => b.type === "data");
    const name = names[index - 1];
    if (name && data && data.start + 8 <= data.end) {
      values.set(name, new TextDecoder().decode(bytes.subarray(data.start + 8, data.end)));
    }
  }
  return values;
}

/** Rotation of the transformation matrix of `tkhd`, in quarter turns. */
function quarterTurns(view: DataView, matrix: number): number {
  const a = view.getInt32(matrix);
  const b = view.getInt32(matrix + 4);
  return ((Math.round(Math.atan2(b, a) / (Math.PI / 2)) % 4) + 4) % 4;
}

/** Reads the metadata from the content of a `moov` box. */
export function readMoov(bytes: Uint8Array): VideoMetadata | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const top = children(bytes, 0, bytes.length);
  const mvhd = top.find((b) => b.type === "mvhd");
  if (!mvhd) return undefined;
  const v1 = bytes[mvhd.start] === 1;
  const created = v1 ? Number(view.getBigUint64(mvhd.start + 4)) : view.getUint32(mvhd.start + 4);
  const timescale = view.getUint32(mvhd.start + (v1 ? 20 : 12));
  const duration = v1 ? Number(view.getBigUint64(mvhd.start + 24)) : view.getUint32(mvhd.start + 16);
  if (timescale === 0) return undefined;

  let width = 0;
  let height = 0;
  let hasAudio = false;
  for (const trak of top.filter((b) => b.type === "trak")) {
    const handler = child(bytes, child(bytes, trak, "mdia"), "hdlr");
    const kind = handler ? fourCc(bytes, handler.start + 8) : "";
    if (kind === "soun") hasAudio = true;
    const tkhd = child(bytes, trak, "tkhd");
    if (kind === "vide" && tkhd && width === 0) {
      const t1 = bytes[tkhd.start] === 1;
      const matrix = tkhd.start + (t1 ? 52 : 40);
      const w = view.getUint32(matrix + 36) / 65536;
      const h = view.getUint32(matrix + 40) / 65536;
      const turned = quarterTurns(view, matrix) % 2 === 1;
      width = Math.round(turned ? h : w);
      height = Math.round(turned ? w : h);
    }
  }

  const udta = top.find((b) => b.type === "udta");
  const userData = udta ? children(bytes, udta.start, udta.end) : [];
  // QuickTime writes ©xyz (0xA9 "xyz"); MP4 writers use the 3GPP `loci` box.
  const xyz = userData.find((b) => b.type === "\u00a9xyz");
  const loci = userData.find((b) => b.type === "loci");
  const meta = top.find((b) => b.type === "meta");
  const apple = meta ? appleMetadata(bytes, meta) : new Map<string, string>();
  const location =
    apple.get("com.apple.quicktime.location.ISO6709") ??
    (xyz ? new TextDecoder().decode(bytes.subarray(xyz.start + 4, xyz.end)) : undefined);
  const gps = (location ? parseIso6709(location) : undefined) ?? (loci ? readLoci(bytes, loci) : undefined);
  // Apple records the local time with its offset; otherwise the creation time, which is UTC.
  const appleDate = apple.get("com.apple.quicktime.creationdate");
  const local =
    appleDate && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}([+-]\d{2}:?\d{2}|Z)$/.test(appleDate) ? appleDate : undefined;
  const utc =
    created > MP4_EPOCH_S ? new Date((created - MP4_EPOCH_S) * 1000).toISOString().replace(".000", "") : undefined;
  const captureTime = local ?? utc;
  return {
    durationUs: Math.round((duration / timescale) * 1_000_000),
    width,
    height,
    hasAudio,
    ...(captureTime ? { captureTime } : {}),
    ...(gps ? { gps } : {}),
  };
}

/**
 * Finds the `moov` box of an MP4 or QuickTime file by reading box headers, wherever it is in the
 * file, and reads its metadata. Undefined when the file is not one or has no usable `moov`.
 */
export async function readVideoMetadata(read: ReadBytes, size: number): Promise<VideoMetadata | undefined> {
  const head = await read(0, 12);
  if (head.length < 12 || fourCc(head, 4) !== "ftyp") return undefined;
  let at = 0;
  while (at + 8 <= size) {
    const header = await read(at, 16);
    if (header.length < 8) return undefined;
    const view = new DataView(header.buffer, header.byteOffset, header.byteLength);
    let length = view.getUint32(0);
    let skip = 8;
    if (length === 1 && header.length >= 16) {
      length = Number(view.getBigUint64(8));
      skip = 16;
    } else if (length === 0) length = size - at;
    if (length < skip) return undefined;
    if (fourCc(header, 4) === "moov") {
      if (length > MAX_MOOV) return undefined;
      return readMoov(await read(at + skip, length - skip));
    }
    at += length;
  }
  return undefined;
}

/** Brands of HEIF images, which share the container with MP4 but are photos. */
export function isHeif(head: Uint8Array): boolean {
  if (head.length < 12 || fourCc(head, 4) !== "ftyp") return false;
  return ["heic", "heix", "hevc", "heim", "heis", "mif1", "msf1", "avif"].includes(fourCc(head, 8));
}
