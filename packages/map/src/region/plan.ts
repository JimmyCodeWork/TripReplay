import { layOutArchive, type TileRef } from "../pmtiles/archive.ts";
import type { RangeSource } from "./range-source.ts";
import type { RemoteArchive } from "./remote-archive.ts";
import { type Bounds, tilesInBounds } from "./tiles.ts";

export interface ThemeRequest {
  readonly theme: string;
  readonly archive: RemoteArchive;
  readonly minZoom: number;
  readonly maxZoom: number;
}

export interface RegionRequest {
  readonly bounds: Bounds;
  readonly themes: readonly ThemeRequest[];
  /** Metadata stored in every downloaded archive, such as the attribution. */
  readonly metadata: Readonly<Record<string, unknown>>;
  /** Target size of a stored part in bytes; a part is the unit that a resumed download skips. */
  readonly partSize?: number;
}

/** A byte range of the remote archive. */
export interface Range {
  readonly offset: number;
  readonly length: number;
}

/** One stored file of a downloaded archive: the remote ranges whose bytes it holds, in order. */
export interface PartPlan {
  readonly size: number;
  readonly ranges: readonly Range[];
}

export interface ThemePlan {
  readonly theme: string;
  readonly source: RangeSource;
  /** Version of the remote archive the plan was made from. */
  readonly etag: string | undefined;
  readonly tileCompression: number;
  /** Header, directories and metadata of the archive to store; its tile data follows in `parts`. */
  readonly head: Uint8Array;
  readonly parts: readonly PartPlan[];
  readonly size: number;
}

export interface RegionPlan {
  readonly bounds: Bounds;
  readonly themes: readonly ThemePlan[];
  /** Bytes the region occupies once stored, known before anything is downloaded. */
  readonly size: number;
}

export const DEFAULT_PART_SIZE = 8 * 1024 * 1024;

async function planTheme(request: RegionRequest, theme: ThemeRequest): Promise<ThemePlan> {
  const { archive } = theme;
  const minZoom = Math.max(theme.minZoom, archive.header.minZoom);
  const maxZoom = Math.min(theme.maxZoom, archive.header.maxZoom);
  const tiles: TileRef[] = [];
  /** Unique tile data in the order it is stored: remote range and local offset. */
  const contents: Range[] = [];
  const localOffsets = new Map<number, number>();
  let dataLength = 0;
  for (const tileId of minZoom <= maxZoom ? tilesInBounds(request.bounds, minZoom, maxZoom) : []) {
    const entry = await archive.find(tileId);
    if (!entry) continue;
    let offset = localOffsets.get(entry.offset);
    if (offset === undefined) {
      offset = dataLength;
      localOffsets.set(entry.offset, offset);
      contents.push({ offset: archive.header.tileDataOffset + entry.offset, length: entry.length });
      dataLength += entry.length;
    }
    tiles.push({ tileId, offset, length: entry.length });
  }

  const [west, south, east, north] = request.bounds;
  const centerLon = west <= east ? (west + east) / 2 : (((west + east + 360) / 2 + 180) % 360) - 180;
  const layout = layOutArchive(tiles, {
    tileType: archive.header.tileType,
    tileCompression: archive.header.tileCompression,
    minZoom,
    maxZoom: Math.max(minZoom, maxZoom),
    bounds: request.bounds,
    center: [centerLon, (south + north) / 2, minZoom],
    metadata: request.metadata,
  });

  const partSize = request.partSize ?? DEFAULT_PART_SIZE;
  const parts: PartPlan[] = [];
  let ranges: Range[] = [];
  let size = 0;
  for (const content of contents) {
    const last = ranges[ranges.length - 1];
    if (last && last.offset + last.length === content.offset) {
      ranges[ranges.length - 1] = { offset: last.offset, length: last.length + content.length };
    } else {
      ranges.push(content);
    }
    size += content.length;
    if (size >= partSize) {
      parts.push({ size, ranges });
      ranges = [];
      size = 0;
    }
  }
  if (size > 0) parts.push({ size, ranges });

  return {
    theme: theme.theme,
    source: archive.source,
    etag: archive.source.etag,
    tileCompression: archive.header.tileCompression,
    head: layout.head,
    parts,
    size: layout.size,
  };
}

/**
 * Plans the download of a region by reading only the directories of the remote archives: which
 * tiles cover the region, where their data is, and how large the stored archives will be. Tiles
 * that the remote archive shares, such as open sea, are stored once.
 */
export async function planRegion(request: RegionRequest): Promise<RegionPlan> {
  const themes: ThemePlan[] = [];
  for (const theme of request.themes) themes.push(await planTheme(request, theme));
  return { bounds: request.bounds, themes, size: themes.reduce((sum, t) => sum + t.size, 0) };
}
