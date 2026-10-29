import { type Entry, serializeDirectory } from "./directory.ts";

/** A tile in the data section of the archive being written. Tiles with the same data share an offset. */
export interface TileRef {
  readonly tileId: number;
  readonly offset: number;
  readonly length: number;
}

/** PMTiles compression and tile type codes. */
export const Compression = { none: 1, gzip: 2 } as const;
export const TileType = { mvt: 1 } as const;

export interface ArchiveInfo {
  readonly tileType: number;
  readonly tileCompression: number;
  readonly minZoom: number;
  readonly maxZoom: number;
  /** West, south, east, north in degrees. */
  readonly bounds: readonly [number, number, number, number];
  readonly center: readonly [lon: number, lat: number, zoom: number];
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface ArchiveLayout {
  /** Header, directories and metadata; the tile data follows directly after. */
  readonly head: Uint8Array;
  readonly tileDataLength: number;
  /** Size of the complete archive in bytes. */
  readonly size: number;
}

const HEADER_SIZE = 127;
/** Readers fetch the header and root directory together in the first 16 KiB. */
const ROOT_LIMIT = 16384 - HEADER_SIZE;

/** Merges consecutive tile ids with the same data into runs. */
function toEntries(tiles: readonly TileRef[]): Entry[] {
  const entries: Entry[] = [];
  let last: Entry | undefined;
  for (const tile of tiles) {
    if (last && tile.tileId <= last.tileId + last.runLength - 1) throw new Error("Tiles must be sorted by tile id");
    if (
      last &&
      tile.tileId === last.tileId + last.runLength &&
      tile.offset === last.offset &&
      tile.length === last.length
    ) {
      last = { ...last, runLength: last.runLength + 1 };
      entries[entries.length - 1] = last;
    } else {
      last = { tileId: tile.tileId, offset: tile.offset, length: tile.length, runLength: 1 };
      entries.push(last);
    }
  }
  return entries;
}

/** Splits entries into leaf directories until the root fits; one level of leaves suffices for any region. */
function directories(entries: readonly Entry[]): { root: Uint8Array; leaves: Uint8Array } {
  const root = serializeDirectory(entries);
  if (root.length <= ROOT_LIMIT) return { root, leaves: new Uint8Array(0) };
  for (let leafSize = 4096; ; leafSize = Math.ceil(leafSize * 1.2)) {
    const parts: Uint8Array[] = [];
    const pointers: Entry[] = [];
    let offset = 0;
    for (let i = 0; i < entries.length; i += leafSize) {
      const chunk = entries.slice(i, i + leafSize);
      const leaf = serializeDirectory(chunk);
      pointers.push({ tileId: (chunk[0] as Entry).tileId, offset, length: leaf.length, runLength: 0 });
      parts.push(leaf);
      offset += leaf.length;
    }
    const rootOfLeaves = serializeDirectory(pointers);
    if (rootOfLeaves.length <= ROOT_LIMIT) return { root: rootOfLeaves, leaves: concat(parts) };
  }
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

/**
 * Lays out a PMTiles v3 archive whose tile data is written afterwards, so that an archive can be
 * streamed to storage tile by tile once the tile sizes are known. Directories and metadata are not
 * compressed.
 */
export function layOutArchive(tiles: readonly TileRef[], info: ArchiveInfo): ArchiveLayout {
  const entries = toEntries(tiles);
  const contents = new Map<number, number>();
  let clustered = true;
  let expected = 0;
  for (const tile of tiles) {
    if (contents.has(tile.offset)) continue;
    contents.set(tile.offset, tile.length);
    if (tile.offset !== expected) clustered = false;
    expected = tile.offset + tile.length;
  }
  const tileDataLength = [...contents].reduce((end, [offset, length]) => Math.max(end, offset + length), 0);
  const { root, leaves } = directories(entries);
  const metadata = new TextEncoder().encode(JSON.stringify(info.metadata));

  const rootOffset = HEADER_SIZE;
  const metadataOffset = rootOffset + root.length;
  const leavesOffset = metadataOffset + metadata.length;
  const tileDataOffset = leavesOffset + leaves.length;

  const header = new DataView(new ArrayBuffer(HEADER_SIZE));
  for (let i = 0; i < 7; i++) header.setUint8(i, "PMTiles".charCodeAt(i));
  header.setUint8(7, 3);
  const u64 = (at: number, value: number) => {
    header.setUint32(at, value % 0x1_0000_0000, true);
    header.setUint32(at + 4, Math.floor(value / 0x1_0000_0000), true);
  };
  const degrees = (at: number, value: number) => header.setInt32(at, Math.round(value * 1e7), true);
  u64(8, rootOffset);
  u64(16, root.length);
  u64(24, metadataOffset);
  u64(32, metadata.length);
  u64(40, leavesOffset);
  u64(48, leaves.length);
  u64(56, tileDataOffset);
  u64(64, tileDataLength);
  u64(
    72,
    entries.reduce((sum, e) => sum + e.runLength, 0),
  );
  u64(80, entries.length);
  u64(88, contents.size);
  header.setUint8(96, clustered ? 1 : 0);
  header.setUint8(97, Compression.none);
  header.setUint8(98, info.tileCompression);
  header.setUint8(99, info.tileType);
  header.setUint8(100, info.minZoom);
  header.setUint8(101, info.maxZoom);
  for (const [i, value] of info.bounds.entries()) degrees(102 + i * 4, value);
  header.setUint8(118, info.center[2]);
  degrees(119, info.center[0]);
  degrees(123, info.center[1]);

  const head = concat([new Uint8Array(header.buffer), root, metadata, leaves]);
  return { head, tileDataLength, size: head.length + tileDataLength };
}
