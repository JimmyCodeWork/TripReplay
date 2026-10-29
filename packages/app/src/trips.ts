import { createProject, type Project, renameTrip, type TripId } from "@tripreplay/domain";
import type { ProjectRepository, TripSummary } from "./ports.ts";
import { createStore, type Listener } from "./store.ts";

/** The summary of a project for the trip list; repositories use it to implement `list`. */
export function summarizeProject(project: Project): TripSummary {
  return {
    id: project.trip.id,
    title: project.trip.title,
    revision: project.trip.revision,
    stopCount: project.stops.length,
    firstDate: project.stops[0]?.date,
    lastDate: project.stops.at(-1)?.date,
    mediaBytes: project.assets.reduce((sum, asset) => sum + asset.byteSize, 0),
  };
}

export interface TripLibraryOptions {
  readonly repository: ProjectRepository;
  /** Creates ids for new trips, for example `crypto.randomUUID`. */
  readonly newId: () => TripId;
  /** Theme of new trips. */
  readonly themeId: string;
}

export interface TripLibrary {
  /** Trips by title. */
  getState(): readonly TripSummary[];
  subscribe(listener: Listener): () => void;
  refresh(): Promise<void>;
  /** Creates and stores an empty trip; returns its id. */
  create(title: string, timeZone: string): Promise<TripId>;
  rename(id: TripId, title: string): Promise<void>;
  /** Stores a copy under a new id; the copy refers to the same media files. */
  duplicate(id: TripId, title: string): Promise<TripId>;
  /** Deletes the trip; its media files are removed by start-up recovery once nothing refers to them. */
  remove(id: TripId): Promise<void>;
}

/** The trip list screen's use cases (docs/ui-design.md §2). Opening a trip for editing is `createEditor`. */
export function createTripLibrary({ repository, newId, themeId }: TripLibraryOptions): TripLibrary {
  const store = createStore<readonly TripSummary[]>([]);
  const refresh = async () => {
    const trips = await repository.list();
    store.setState(() => [...trips].sort((a, b) => a.title.localeCompare(b.title)));
  };
  const save = async (project: Project) => {
    const result = await repository.save(project);
    if (result.kind === "conflict") throw new Error(`Trip "${project.trip.id}" was changed elsewhere`);
  };
  const load = async (id: TripId) => {
    const project = await repository.load(id);
    if (!project) throw new Error(`Trip "${id}" does not exist`);
    return project;
  };

  return {
    getState: store.getState,
    subscribe: store.subscribe,
    refresh,
    async create(title, timeZone) {
      const id = newId();
      await save(createProject({ id, title, timeZone, themeId }));
      await refresh();
      return id;
    },
    async rename(id, title) {
      await save(renameTrip(await load(id), title));
      await refresh();
    },
    async duplicate(id, title) {
      const source = await load(id);
      const copy = newId();
      await save(renameTrip({ ...source, trip: { ...source.trip, id: copy, revision: 0 } }, title));
      await refresh();
      return copy;
    },
    async remove(id) {
      await repository.remove(id);
      await refresh();
    },
  };
}
