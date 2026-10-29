import { VectorTile } from "@mapbox/vector-tile";
import type { AssetStore } from "@tripreplay/app";
import { PbfReader } from "pbf";
import type { Header } from "pmtiles";
import { Compression, TileType } from "../pmtiles/archive.ts";
import { deserializeDirectory } from "../pmtiles/directory.ts";
import { MAP_THEMES } from "../style.ts";
import type { DownloadProgress } from "./download.ts";
import { RegionError } from "./errors.ts";
import { type RegionRecord, readArchiveHeader } from "./region.ts";
import { openRemoteArchive } from "./remote-archive.ts";
import type { Bounds } from "./tiles.ts";

/**
 * Layers that identify each Overture Maps theme, as in the archives that Overture publishes and in
 * extracts made from them with `pmtiles extract` (docs/spikes/s1-map-rendering.md §3.1). `water`
 * is left out because other schemas, such as the Protomaps basemap, use it too.
 */
const THEME_LAYERS: Readonly<Record<string, readonly string[]>> = {
  base: ["bathymetry", "infrastructure", "land", "land_cover", "land_use"],
  transportation: ["connector", "segment"],
  divisions: ["division", "division_area", "division_boundary"],
  places: ["place"],
};

/** Tiles read to find the layers of an archive whose metadata does not list them. */
const SAMPLE_TILES = 8;

/** A map file opened from the device: one Overture Maps theme of a region. */
export interface MapFileInfo {
  readonly theme: string;
  readonly bounds: Bounds;
}

async function inflate(bytes: Uint8Array, compression: number): Promise<Uint8Array> {
  if (compression === Compression.none) return bytes;
  if (compression !== Compression.gzip) throw new RegionError("unsupported", "The compression is not supported");
  const stream = new Blob([bytes as Uint8Array<ArrayBuffer>]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

const read = async (file: Blob, offset: number, length: number) =>
  new Uint8Array(await file.slice(offset, offset + length).arrayBuffer());

/** The layers listed in the metadata, or undefined when it lists none. */
async function metadataLayers(file: Blob, header: Header): Promise<string[] | undefined> {
  const raw = await read(file, header.jsonMetadataOffset, header.jsonMetadataLength);
  const metadata = JSON.parse(new TextDecoder().decode(await inflate(raw, header.internalCompression)));
  const layers = metadata?.vector_layers;
  return Array.isArray(layers) && layers.length > 0 ? layers.map((layer) => String(layer?.id)) : undefined;
}

/** The layers of the first tiles of the archive. */
async function tileLayers(file: Blob, header: Header): Promise<string[]> {
  const archive = await openRemoteArchive({ etag: undefined, read: (offset, length) => read(file, offset, length) });
  const root = deserializeDirectory(
    await inflate(await read(file, header.rootDirectoryOffset, header.rootDirectoryLength), header.internalCompression),
  );
  const layers = new Set<string>();
  for (const { tileId } of root.slice(0, SAMPLE_TILES)) {
    const entry = await archive.find(tileId);
    if (!entry) continue;
    const tile = await inflate(
      await read(file, header.tileDataOffset + entry.offset, entry.length),
      header.tileCompression,
    );
    for (const layer of Object.keys(new VectorTile(new PbfReader(tile)).layers)) layers.add(layer);
  }
  return [...layers];
}

/**
 * Reads which theme a map file holds: from the layers its metadata lists, or else from the layers
 * of its first tiles. Throws `invalidArchive` for a file that is not a complete PMTiles archive,
 * and `unsupported` for one that holds no single Overture Maps theme, such as a Protomaps basemap.
 */
export async function inspectMapFile(file: Blob, name: string): Promise<MapFileInfo> {
  const header = await readArchiveHeader(file, `"${name}"`);
  if (header.tileType !== TileType.mvt) {
    throw new RegionError("unsupported", `"${name}" does not hold vector tiles`);
  }
  let layers: string[];
  try {
    layers = (await metadataLayers(file, header)) ?? (await tileLayers(file, header));
  } catch (error) {
    if (error instanceof RegionError && error.code === "unsupported") throw error;
    throw new RegionError("unsupported", `The layers of "${name}" cannot be read`);
  }
  const themes = Object.keys(THEME_LAYERS).filter((theme) => THEME_LAYERS[theme]?.some((l) => layers.includes(l)));
  if (themes.length !== 1) {
    throw new RegionError("unsupported", `"${name}" holds no single Overture Maps theme`);
  }
  return { theme: themes[0] as string, bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat] };
}

/**
 * A name for a region from the name of its base map file: `taiwan-base.pmtiles` becomes `taiwan`.
 */
export function regionName(fileName: string): string {
  const name = fileName.replace(/\.pmtiles$/i, "").replace(/[-_. ]*base$/i, "");
  return name || fileName.replace(/\.pmtiles$/i, "");
}

export interface OpenedFiles {
  readonly record: RegionRecord;
  /** Copies the files into the store, one stored file per theme. */
  copy(signal: AbortSignal, onProgress: (progress: DownloadProgress) => void): Promise<void>;
}

async function* chunks(file: Blob, signal: AbortSignal, onChunk: (bytes: number) => void): AsyncIterable<Uint8Array> {
  const reader = file.stream().getReader();
  try {
    for (;;) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) return;
      onChunk(value.length);
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Checks map files the user opened and plans storing them as region `regionId`. The files must
 * hold the themes the map draws (base, transportation and divisions), each once; `places` adds
 * points of interest to place search. The region covers the area of its base map.
 */
export async function openMapFiles(
  files: readonly File[],
  regionId: string,
  store: AssetStore<Blob>,
): Promise<OpenedFiles> {
  const themes = new Map<string, { readonly file: File; readonly info: MapFileInfo }>();
  for (const file of files) {
    const info = await inspectMapFile(file, file.name);
    if (themes.has(info.theme)) {
      throw new RegionError("unsupported", `Two of the files hold the ${info.theme} theme`);
    }
    themes.set(info.theme, { file, info });
  }
  const missing = MAP_THEMES.filter((theme) => !themes.has(theme));
  if (missing.length > 0) throw new RegionError("incomplete", `No file holds the ${missing.join(", ")} theme`);
  const base = themes.get("base") as { readonly file: File; readonly info: MapFileInfo };
  const opened = [...themes].map(([theme, { file }]) => ({ theme, file, id: `${regionId}-${theme}-file` }));
  const record: RegionRecord = {
    id: regionId,
    name: regionName(base.file.name),
    bounds: base.info.bounds,
    size: opened.reduce((sum, { file }) => sum + file.size, 0),
    themes: opened.map(({ theme, file, id }) => ({ theme, etag: undefined, parts: [{ id, size: file.size }] })),
  };
  return {
    record,
    async copy(signal, onProgress) {
      let completedBytes = 0;
      const progress = (bytes: number) => {
        completedBytes += bytes;
        onProgress({ completedBytes, totalBytes: record.size });
      };
      for (const { file, id } of opened) {
        await store.remove(id);
        await store.put(id, chunks(file, signal, progress), file.size);
      }
    },
  };
}
