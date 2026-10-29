import { bytesToHeader, findTile, type Header, type Entry as PmtilesEntry } from "pmtiles";
import { Compression } from "../pmtiles/archive.ts";
import { deserializeDirectory, type Entry } from "../pmtiles/directory.ts";
import { RegionError } from "./errors.ts";
import type { RangeSource } from "./range-source.ts";

/** The directories of a remote PMTiles archive, read on demand. */
export interface RemoteArchive {
  readonly source: RangeSource;
  readonly header: Header;
  /** The entry with the data of a tile, or undefined when the archive has no such tile. */
  find(tileId: number): Promise<Entry | undefined>;
}

const HEAD_LENGTH = 16384;
const MAX_DEPTH = 4;

async function decompress(bytes: Uint8Array, compression: number): Promise<Uint8Array> {
  if (compression === Compression.none) return bytes;
  if (compression !== Compression.gzip) {
    throw new RegionError("invalidArchive", `Unsupported directory compression ${compression}`);
  }
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Reads the header and root directory of a remote archive; leaf directories are read when needed. */
export async function openRemoteArchive(source: RangeSource, signal?: AbortSignal): Promise<RemoteArchive> {
  const head = await source.read(0, HEAD_LENGTH, signal);
  const magic = new TextDecoder().decode(head.subarray(0, 7));
  if (head.length < 127 || magic !== "PMTiles" || head[7] !== 3) {
    throw new RegionError("invalidArchive", "The remote file is not a PMTiles v3 archive");
  }
  const header = bytesToHeader(head.slice(0, 127).buffer);
  const parse = async (bytes: Uint8Array) => deserializeDirectory(await decompress(bytes, header.internalCompression));
  const rootEnd = header.rootDirectoryOffset + header.rootDirectoryLength;
  if (rootEnd > head.length) throw new RegionError("invalidArchive", "The root directory is not in the first 16 KiB");
  const root = await parse(head.subarray(header.rootDirectoryOffset, rootEnd));
  const leaves = new Map<number, Promise<Entry[]>>();

  const leaf = (offset: number, length: number): Promise<Entry[]> => {
    let entries = leaves.get(offset);
    if (!entries) {
      entries = source.read(header.leafDirectoryOffset + offset, length, signal).then(parse);
      leaves.set(offset, entries);
      entries.catch(() => leaves.delete(offset));
    }
    return entries;
  };

  return {
    source,
    header,
    async find(tileId) {
      let directory = root;
      for (let depth = 0; depth < MAX_DEPTH; depth++) {
        const entry = findTile(directory as PmtilesEntry[], tileId);
        if (!entry) return undefined;
        if (entry.runLength > 0) return entry;
        directory = await leaf(entry.offset, entry.length);
      }
      throw new RegionError("invalidArchive", "Leaf directories are nested too deeply");
    },
  };
}
