import type { PlaceIndex } from "./place-index.ts";

const MAGIC = 0x49505254; // "TRPI" in little-endian byte order
export const PLACE_INDEX_VERSION = 1;

interface Header {
  readonly count: number;
  readonly gramCount: number;
  readonly postingCount: number;
  readonly labels: readonly string[];
  readonly names: readonly string[];
  readonly keys: readonly string[];
  readonly kinds: readonly string[];
  readonly grams: readonly string[];
}

/** Binary sections in file order; each starts at a multiple of 8 bytes. */
const SECTIONS = ["lon", "lat", "gramOffsets", "postings", "kind", "source", "confidence", "prominence"] as const;

const align = (n: number) => Math.ceil(n / 8) * 8;

/**
 * Serializes an index to store it with the region: a 12-byte prefix (magic, version, header
 * length), a JSON header with the strings, then the typed arrays.
 */
export function encodePlaceIndex(index: PlaceIndex): Uint8Array {
  const header: Header = {
    count: index.labels.length,
    gramCount: index.grams.length,
    postingCount: index.postings.length,
    labels: index.labels,
    names: index.names,
    keys: index.keys,
    kinds: index.kinds,
    grams: index.grams,
  };
  const json = new TextEncoder().encode(JSON.stringify(header));
  const arrays = SECTIONS.map((name) => index[name]);
  const start = align(12 + json.length);
  const size = arrays.reduce((at, array) => align(at + array.byteLength), start);
  const out = new Uint8Array(size);
  const view = new DataView(out.buffer);
  view.setUint32(0, MAGIC, true);
  view.setUint32(4, PLACE_INDEX_VERSION, true);
  view.setUint32(8, json.length, true);
  out.set(json, 12);
  let at = start;
  for (const array of arrays) {
    out.set(new Uint8Array(array.buffer, array.byteOffset, array.byteLength), at);
    at = align(at + array.byteLength);
  }
  return out;
}

/** Reads an index written by `encodePlaceIndex`; the typed arrays are views on `bytes`. */
export function decodePlaceIndex(bytes: Uint8Array): PlaceIndex {
  const aligned = bytes.byteOffset % 8 === 0 ? bytes : bytes.slice();
  const view = new DataView(aligned.buffer, aligned.byteOffset, aligned.byteLength);
  if (aligned.length < 12 || view.getUint32(0, true) !== MAGIC) throw new Error("Not a place index");
  if (view.getUint32(4, true) !== PLACE_INDEX_VERSION) throw new Error("Unsupported place index version");
  const jsonLength = view.getUint32(8, true);
  const header = JSON.parse(new TextDecoder().decode(aligned.subarray(12, 12 + jsonLength))) as Header;
  let at = align(12 + jsonLength);
  const take = <T>(
    make: (buffer: ArrayBufferLike, offset: number, length: number) => T,
    length: number,
    size: number,
  ) => {
    if (at + length * size > aligned.length) throw new Error("Truncated place index");
    const array = make(aligned.buffer, aligned.byteOffset + at, length);
    at = align(at + length * size);
    return array;
  };
  const f64 = (b: ArrayBufferLike, o: number, n: number) => new Float64Array(b, o, n);
  const u32 = (b: ArrayBufferLike, o: number, n: number) => new Uint32Array(b, o, n);
  return {
    labels: header.labels,
    names: header.names,
    keys: header.keys,
    kinds: header.kinds,
    grams: header.grams,
    lon: take(f64, header.count, 8),
    lat: take(f64, header.count, 8),
    gramOffsets: take(u32, header.gramCount + 1, 4),
    postings: take(u32, header.postingCount, 4),
    kind: take((b, o, n) => new Uint16Array(b, o, n), header.count, 2),
    source: take((b, o, n) => new Uint8Array(b, o, n), header.count, 1),
    confidence: take((b, o, n) => new Uint8Array(b, o, n), header.count, 1),
    prominence: take((b, o, n) => new Uint8Array(b, o, n), header.count, 1),
  };
}
