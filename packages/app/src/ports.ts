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
