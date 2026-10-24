import type { Project, TripId } from "@tripreplay/domain";

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
