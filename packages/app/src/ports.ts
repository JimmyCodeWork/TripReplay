import type { AssetId, LonLat, Project, TripId } from "@tripreplay/domain";

/**
 * Ports the application layer needs from the outside world (docs/architecture.md §4.2). Adapters
 * implement them; tests use in-memory fakes. Ports for media, audio and the playback clock are
 * added together with their adapters.
 */

export type SaveResult =
  | { readonly kind: "saved"; readonly revision: number }
  /** The stored project has a different revision, for example because another tab saved it. */
  | { readonly kind: "conflict"; readonly storedRevision: number };

export interface TripSummary {
  readonly id: TripId;
  readonly title: string;
  readonly revision: number;
}

export interface ProjectRepository {
  load(id: TripId): Promise<Project | undefined>;
  /**
   * Saves the project if the stored revision equals `project.trip.revision` (or nothing is stored
   * yet), and stores it with the next revision.
   */
  save(project: Project): Promise<SaveResult>;
  list(): Promise<readonly TripSummary[]>;
  remove(id: TripId): Promise<void>;
}

/** Runs a callback once after a delay; returns a function that cancels it. */
export interface Scheduler {
  schedule(delayMs: number, callback: () => void): () => void;
}

/**
 * Media files, stored by asset id. `File` is the adapter's readable file type, kept opaque here so
 * that the application layer does not depend on browser types.
 */
export interface AssetStore<File = unknown> {
  /**
   * Stores `byteSize` bytes from `source` under `id`. The file becomes visible only once it is
   * complete, so a failed or interrupted write never leaves a partial file under `id`.
   */
  put(id: AssetId, source: AsyncIterable<Uint8Array>, byteSize: number): Promise<void>;
  open(id: AssetId): Promise<File | undefined>;
  /** Removes the file; succeeds when it does not exist. */
  remove(id: AssetId): Promise<void>;
  list(): Promise<readonly AssetId[]>;
}

/** A place found in the downloaded maps. */
export interface PlaceMatch {
  /** Name to show: Traditional Chinese where the map has it, otherwise the local name. */
  readonly label: string;
  /** Local name, for example 京都駅 when the label is 京都車站. */
  readonly name: string;
  /** Category, for example `locality` or `transit/railway_station`. */
  readonly kind: string;
  readonly location: LonLat;
}

/** Finds places by name in the downloaded maps, on the device (ADR 0006); best matches first. */
export interface PlaceSearch {
  search(query: string, limit?: number): Promise<readonly PlaceMatch[]>;
}

/** West, south, east, north in degrees; west is greater than east for a region across the Date Line. */
export type RegionBounds = readonly [west: number, south: number, east: number, north: number];

/**
 * A downloaded or partly downloaded map region, as the application stores it. `Data` belongs to the
 * MapRegions adapter, for example the names of the stored files; the application only keeps it.
 */
export interface StoredRegion<Data = unknown> {
  readonly id: string;
  readonly name: string;
  readonly bounds: RegionBounds;
  readonly release: string;
  readonly size: number;
  readonly data: Data;
  /** False while the download is incomplete. */
  readonly ready: boolean;
  /** A newer release being downloaded while this one stays in use. */
  readonly update?: { readonly release: string; readonly size: number; readonly data: Data };
}

export interface RegionRepository<Data = unknown> {
  list(): Promise<readonly StoredRegion<Data>[]>;
  save(region: StoredRegion<Data>): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface DownloadProgress {
  readonly completedBytes: number;
  readonly totalBytes: number;
}

/** A planned download: its size is known before anything is downloaded. */
export interface PlannedRegion<Data = unknown> {
  readonly size: number;
  readonly data: Data;
  /** Downloads what is not stored yet; rejects when `signal` aborts, keeping what was stored. */
  download(signal: AbortSignal, onProgress: (progress: DownloadProgress) => void): Promise<void>;
}

/**
 * Downloading and keeping map regions (docs/specification.md §4.1). Adapters throw `RegionFailure`
 * for failures the user can act on.
 */
export interface MapRegions<Data = unknown> {
  /** The newest map release offered by the download source. */
  latestRelease(signal?: AbortSignal): Promise<string>;
  plan(release: string, bounds: RegionBounds, regionId: string, signal?: AbortSignal): Promise<PlannedRegion<Data>>;
  /** Bytes of the region already stored, for the progress of a paused download. */
  storedBytes(data: Data): Promise<number>;
  /** Verifies a completed download and makes the region usable, including its place search. */
  prepare(data: Data, signal?: AbortSignal): Promise<void>;
  /** Makes a stored region usable at start-up; false if its files are gone, as after eviction. */
  open(data: Data): Promise<boolean>;
  remove(data: Data): Promise<void>;
  /** Removes stored map files that belong to none of `keep`, such as those of an abandoned download. */
  removeUnused(keep: readonly Data[]): Promise<void>;
  /** Free storage in bytes, or undefined if the browser does not report it. */
  freeSpace(): Promise<number | undefined>;
}
