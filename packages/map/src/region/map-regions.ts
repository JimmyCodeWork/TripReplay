import {
  type AssetStore,
  type MapRegions,
  type PlaceSearch,
  type PlannedRegion,
  type RegionBounds,
  RegionFailure,
} from "@tripreplay/app";
import type { MapFiles } from "../maplibre-layer.ts";
import { decodePlaceIndex, encodePlaceIndex, PLACE_INDEX_VERSION } from "../places/encode.ts";
import type { PlaceIndex } from "../places/place-index.ts";
import { buildRegionPlaceIndex, createPlaceSearch } from "../places/region-index.ts";
import { downloadRegion, regionRecord } from "./download.ts";
import { RegionError } from "./errors.ts";
import { openMapFiles } from "./map-file.ts";
import { listOvertureReleases, overtureRegionRequest } from "./overture.ts";
import { planRegion } from "./plan.ts";
import { openRegion, type RegionRecord, verifyRegion } from "./region.ts";

/** What the application stores for a region: the record of its map files. Plain data. */
export interface MapRegionData {
  readonly record: RegionRecord;
}

export interface MapRegionsOptions {
  /** A store for map files only; the media store removes files that no project refers to. */
  readonly store: AssetStore<Blob>;
  readonly fetch?: typeof fetch;
  /** `navigator.storage.estimate`. */
  readonly estimate?: () => Promise<{ readonly quota?: number; readonly usage?: number }>;
  /** Builds a place index; the shell passes one that runs in a worker. */
  readonly buildIndex?: (archives: Readonly<Record<string, Blob>>, bounds: RegionBounds) => Promise<PlaceIndex>;
}

export interface OvertureMapRegions extends MapRegions<MapRegionData, File> {
  /** Searches the place names of every region that is open. */
  readonly placeSearch: PlaceSearch;
  /** The map files of a region for the renderer. */
  files(data: MapRegionData): Promise<MapFiles>;
  /** The map files of a region that is open (prepared or opened at start-up), by region id. */
  regionFiles(regionId: string): Promise<MapFiles | undefined>;
}

/** Part of the quota left free, since browsers count storage approximately. */
const RESERVE = 0.05;

function indexId(record: RegionRecord): string {
  const places = record.themes.find((t) => t.theme === "places") ?? record.themes[0];
  const version = (places?.parts[0]?.id ?? "").split("-").at(-2) ?? "none";
  return `${record.id}-index${PLACE_INDEX_VERSION}-${version}`;
}

async function transform(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const output = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(output).arrayBuffer());
}

/** Translates failures into the reasons the application shows; aborts stay aborts. */
function failure(error: unknown): unknown {
  if (error instanceof RegionError) {
    if (error.code === "http") {
      const gone = error.status === 403 || error.status === 404;
      return new RegionFailure(gone ? "unavailable" : "network", error.message);
    }
    const reason = {
      changed: "changed",
      invalidArchive: "damaged",
      missingPart: "missing",
      unsupported: "unsupported",
      incomplete: "incomplete",
    } as const;
    return new RegionFailure(reason[error.code], error.message);
  }
  if (error instanceof TypeError) return new RegionFailure("network", error.message);
  return error;
}

async function translated<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw failure(error);
  }
}

/** MapRegions on Overture Maps: regions are downloaded into `store`, with a place index for each. */
export function createMapRegions(options: MapRegionsOptions): OvertureMapRegions {
  const { store } = options;
  const build = options.buildIndex ?? buildRegionPlaceIndex;
  /** Open regions by id, with the record they were opened from and their place index. */
  const open = new Map<string, { readonly record: RegionRecord; readonly index: PlaceIndex }>();

  const storeIndex = async (record: RegionRecord): Promise<PlaceIndex> => {
    const index = await build(await openRegion(record, store), record.bounds);
    const bytes = await transform(encodePlaceIndex(index), new CompressionStream("gzip"));
    const id = indexId(record);
    await store.remove(id);
    await store.put(
      id,
      (async function* () {
        yield bytes;
      })(),
      bytes.length,
    );
    open.set(record.id, { record, index });
    return index;
  };

  const loadIndex = async (record: RegionRecord): Promise<void> => {
    const file = await store.open(indexId(record));
    if (!file) {
      await storeIndex(record);
      return;
    }
    try {
      const bytes = await transform(new Uint8Array(await file.arrayBuffer()), new DecompressionStream("gzip"));
      open.set(record.id, { record, index: decodePlaceIndex(bytes) });
    } catch {
      await storeIndex(record);
    }
  };

  const storedFiles = (record: RegionRecord) => [
    ...record.themes.flatMap((theme) => theme.parts.map((part) => part.id)),
    indexId(record),
  ];

  const filesOf = async (record: RegionRecord): Promise<MapFiles> => {
    const archives = await translated(() => openRegion(record, store));
    return { base: archives.base, transportation: archives.transportation, divisions: archives.divisions } as MapFiles;
  };

  return {
    placeSearch: createPlaceSearch(() => [...open.values()].map((region) => region.index)),

    files: ({ record }) => filesOf(record),

    async regionFiles(regionId) {
      const region = open.get(regionId);
      return region && filesOf(region.record);
    },

    latestRelease: () =>
      translated(async () => {
        const [latest] = await listOvertureReleases(options.fetch);
        if (!latest) throw new RegionFailure("unavailable", "The download source lists no map release");
        return latest;
      }),

    plan: (release, bounds, regionId, signal) =>
      translated(async (): Promise<PlannedRegion<MapRegionData>> => {
        const request = await overtureRegionRequest(release, bounds, {
          ...(options.fetch ? { fetch: options.fetch } : {}),
          ...(signal ? { signal } : {}),
        });
        const plan = await planRegion(request);
        const record = regionRecord(plan, regionId, regionId);
        return {
          size: plan.size,
          data: { record },
          download: (downloadSignal, onProgress) =>
            translated(async () => {
              await downloadRegion(plan, { store, regionId, name: regionId, signal: downloadSignal, onProgress });
            }),
        };
      }),

    planFiles: (files, regionId) =>
      translated(async () => {
        const opened = await openMapFiles(files, regionId, store);
        const { record } = opened;
        return {
          name: record.name,
          bounds: record.bounds,
          size: record.size,
          data: { record },
          download: (signal, onProgress) => translated(() => opened.copy(signal, onProgress)),
        };
      }),

    async storedBytes({ record }) {
      let bytes = 0;
      for (const theme of record.themes) {
        for (const part of theme.parts) if ((await store.open(part.id))?.size === part.size) bytes += part.size;
      }
      return bytes;
    },

    prepare: ({ record }) =>
      translated(async () => {
        await verifyRegion(record, store);
        await storeIndex(record);
      }),

    async open({ record }) {
      try {
        await verifyRegion(record, store);
      } catch (error) {
        if (error instanceof RegionError) return false;
        throw error;
      }
      await loadIndex(record);
      return true;
    },

    async remove({ record }) {
      // During an update the new release is already open under the same id; keep it.
      const current = open.get(record.id);
      if (current && indexId(current.record) === indexId(record)) open.delete(record.id);
      for (const id of storedFiles(record)) await store.remove(id);
    },

    async removeUnused(keep) {
      const used = new Set(keep.flatMap(({ record }) => storedFiles(record)));
      for (const id of await store.list()) if (!used.has(id)) await store.remove(id);
    },

    async freeSpace() {
      const estimate = await options.estimate?.();
      if (estimate?.quota === undefined) return undefined;
      return Math.max(0, Math.floor(estimate.quota * (1 - RESERVE) - (estimate.usage ?? 0)));
    },
  };
}
