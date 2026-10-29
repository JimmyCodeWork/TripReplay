import type { Source } from "pmtiles";

/** Reads a PMTiles archive by range from a `Blob`, such as a map file stored in OPFS. */
export function blobSource(key: string, blob: Blob): Source {
  return {
    getKey: () => key,
    getBytes: async (offset, length) => ({ data: await blob.slice(offset, offset + length).arrayBuffer() }),
  };
}
