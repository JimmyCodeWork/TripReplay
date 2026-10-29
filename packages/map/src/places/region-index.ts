import type { PlaceMatch, PlaceSearch } from "@tripreplay/app";
import { tileIdToZxy } from "pmtiles";
import { Compression } from "../pmtiles/archive.ts";
import { openRemoteArchive } from "../region/remote-archive.ts";
import { type Bounds, tilesInBounds } from "../region/tiles.ts";
import { type PlaceFeature, type PlaceSource, placesInTile } from "./extract.ts";
import { buildPlaceIndex, type PlaceIndex } from "./place-index.ts";
import { type PlaceResult, searchPlaces } from "./search.ts";

/** The theme archive and zoom level each source of names is read from (S1 §5.1). */
const INDEX_ZOOM: Readonly<Record<PlaceSource, number>> = { divisions: 12, base: 13, places: 14 };

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

export interface IndexProgress {
  readonly completedTiles: number;
  readonly totalTiles: number;
}

/**
 * Builds the place index of a downloaded region from its archives (see openRegion). Reads every
 * tile at the index zoom level of each source; run it in a worker, as it takes seconds for a country.
 */
export async function buildRegionPlaceIndex(
  archives: Readonly<Record<string, Blob>>,
  bounds: Bounds,
  onProgress?: (progress: IndexProgress) => void,
): Promise<PlaceIndex> {
  const jobs = (Object.keys(INDEX_ZOOM) as PlaceSource[])
    .filter((source) => archives[source])
    .map((source) => ({
      source,
      blob: archives[source] as Blob,
      tiles: tilesInBounds(bounds, INDEX_ZOOM[source], INDEX_ZOOM[source]),
    }));
  const totalTiles = jobs.reduce((sum, job) => sum + job.tiles.length, 0);
  let completedTiles = 0;
  const features: PlaceFeature[] = [];
  for (const { source, blob, tiles } of jobs) {
    const archive = await openRemoteArchive({
      etag: undefined,
      read: async (offset, length) => new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer()),
    });
    const { tileDataOffset, tileCompression } = archive.header;
    for (const tileId of tiles) {
      const entry = await archive.find(tileId);
      if (entry) {
        const start = tileDataOffset + entry.offset;
        const raw = new Uint8Array(await blob.slice(start, start + entry.length).arrayBuffer());
        const data = tileCompression === Compression.gzip ? await gunzip(raw) : raw;
        const [z, x, y] = tileIdToZxy(tileId);
        features.push(...placesInTile(source, data, z, x, y));
      }
      onProgress?.({ completedTiles: ++completedTiles, totalTiles });
    }
  }
  return buildPlaceIndex(features);
}

const toMatch = (result: PlaceResult): PlaceMatch => ({
  label: result.label,
  name: result.name,
  kind: result.kind,
  location: { lon: result.lon, lat: result.lat },
});

/** Searches the indexes of the downloaded regions together; `indexes` is read on every search. */
export function createPlaceSearch(indexes: () => readonly PlaceIndex[]): PlaceSearch {
  return {
    async search(query, limit = 8) {
      const results = indexes().flatMap((index) => searchPlaces(index, query, limit));
      // Regions overlap at their edges; keep one result per name and position.
      const unique = new Map<string, PlaceResult>();
      for (const result of results.sort((a, b) => b.score - a.score)) {
        const key = `${result.label}|${result.lon.toFixed(2)}|${result.lat.toFixed(2)}`;
        if (!unique.has(key)) unique.set(key, result);
      }
      return [...unique.values()].slice(0, limit).map(toMatch);
    },
  };
}
