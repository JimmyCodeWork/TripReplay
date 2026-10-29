import { type ArchiveInfo, layOutArchive, type TileRef } from "../../src/pmtiles/archive.ts";

/** Builds a complete archive in memory from tile data keyed by tile id, sharing identical data. */
export function buildArchive(tiles: ReadonlyMap<number, Uint8Array>, info: ArchiveInfo): Uint8Array {
  const refs: TileRef[] = [];
  const data: Uint8Array[] = [];
  const offsets = new Map<Uint8Array, number>();
  let end = 0;
  for (const tileId of [...tiles.keys()].sort((a, b) => a - b)) {
    const bytes = tiles.get(tileId) as Uint8Array;
    let offset = offsets.get(bytes);
    if (offset === undefined) {
      offset = end;
      offsets.set(bytes, offset);
      data.push(bytes);
      end += bytes.length;
    }
    refs.push({ tileId, offset, length: bytes.length });
  }
  const layout = layOutArchive(refs, info);
  const out = new Uint8Array(layout.size);
  out.set(layout.head, 0);
  let at = layout.head.length;
  for (const bytes of data) {
    out.set(bytes, at);
    at += bytes.length;
  }
  return out;
}
