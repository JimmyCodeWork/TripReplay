import type { AssetStore } from "@tripreplay/app";
import { bytesToHeader, type Header } from "pmtiles";
import { RegionError } from "./errors.ts";
import type { Bounds } from "./tiles.ts";

/** A downloaded region, as the application stores it; plain data. */
export interface RegionRecord {
  readonly id: string;
  readonly name: string;
  readonly bounds: Bounds;
  readonly size: number;
  readonly themes: readonly {
    readonly theme: string;
    readonly etag: string | undefined;
    /** Stored files that together form the theme's PMTiles archive, in order. */
    readonly parts: readonly { readonly id: string; readonly size: number }[];
  }[];
}

/**
 * Opens the archives of a downloaded region, one Blob per theme. The stored parts are joined without
 * copying them. Fails with `missingPart` if a part is gone or has the wrong size, as after the
 * browser evicted storage.
 */
export async function openRegion(record: RegionRecord, store: AssetStore<Blob>): Promise<Record<string, Blob>> {
  const archives: Record<string, Blob> = {};
  for (const theme of record.themes) {
    const parts: Blob[] = [];
    for (const part of theme.parts) {
      const file = await store.open(part.id);
      if (file?.size !== part.size) {
        throw new RegionError("missingPart", `Part "${part.id}" of region "${record.name}" is missing or damaged`);
      }
      parts.push(file);
    }
    archives[theme.theme] = new Blob(parts);
  }
  return archives;
}

/**
 * Reads the header of a PMTiles v3 archive and checks that the archive is complete: the tile data,
 * which comes last, ends where the archive ends. `label` names the archive in errors.
 */
export async function readArchiveHeader(blob: Blob, label: string): Promise<Header> {
  const head = new Uint8Array(await blob.slice(0, 127).arrayBuffer());
  if (head.length < 127 || new TextDecoder().decode(head.subarray(0, 7)) !== "PMTiles" || head[7] !== 3) {
    throw new RegionError("invalidArchive", `${label} has no PMTiles v3 header`);
  }
  const header = bytesToHeader(head.buffer);
  if (header.tileDataOffset + (header.tileDataLength ?? 0) !== blob.size) {
    throw new RegionError("invalidArchive", `${label} has the wrong size`);
  }
  return header;
}

/** Checks that every stored archive of the region is complete: all parts present, and header and size agree. */
export async function verifyRegion(record: RegionRecord, store: AssetStore<Blob>): Promise<void> {
  const archives = await openRegion(record, store);
  for (const [theme, blob] of Object.entries(archives)) {
    await readArchiveHeader(blob, `The ${theme} archive of "${record.name}"`);
  }
}

/**
 * Files in the map store that no record refers to, such as parts of an abandoned download or of an
 * older release. Pass the records of paused downloads too (see `regionRecord`), so that their
 * parts are kept.
 */
export async function unusedMapFiles(records: readonly RegionRecord[], store: AssetStore<Blob>): Promise<string[]> {
  const used = new Set(records.flatMap((r) => r.themes.flatMap((t) => t.parts.map((p) => p.id))));
  return (await store.list()).filter((id) => !used.has(id));
}

/** Whether `bytes` fit into the storage quota with a reserve, from `navigator.storage.estimate()`. */
export function fitsInQuota(
  bytes: number,
  estimate: { readonly quota?: number; readonly usage?: number },
  reserve = 0.05,
): boolean {
  if (estimate.quota === undefined) return true;
  const free = estimate.quota * (1 - reserve) - (estimate.usage ?? 0);
  return bytes <= free;
}
