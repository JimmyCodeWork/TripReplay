import type { ProjectRepository, SaveResult, TripSummary } from "@tripreplay/app";
import { type Project, SCHEMA_VERSION, type TripId, validateProject } from "@tripreplay/domain";
import { StorageError } from "./errors.ts";
import { openDatabase, request, transaction } from "./idb.ts";

const DATABASE = "tripreplay";
const VERSION = 1;
const PROJECTS = "projects";

/** Checks a project read from storage, which may come from another version of the application. */
export function checkStoredProject(project: Project): Project {
  if (project.trip?.schemaVersion !== SCHEMA_VERSION) {
    throw new StorageError(
      "unsupportedVersion",
      `Project schema version ${String(project.trip?.schemaVersion)} is not supported`,
    );
  }
  const issues = validateProject(project);
  if (issues.length > 0) {
    throw new StorageError("invalidProject", `Stored project is invalid: ${issues.map((i) => i.path).join(", ")}`);
  }
  return project;
}

export interface IndexedDbProjectRepository extends ProjectRepository {
  /** Every stored project, for example to find the media still in use. */
  loadAll(): Promise<Project[]>;
  close(): void;
}

/** Stores projects in IndexedDB, keyed by trip id, with the revision check of `ProjectRepository.save`. */
export async function openProjectRepository(name = DATABASE): Promise<IndexedDbProjectRepository> {
  const db = await openDatabase(name, VERSION, (database) => {
    if (!database.objectStoreNames.contains(PROJECTS)) database.createObjectStore(PROJECTS);
  });
  const all = () => transaction(db, PROJECTS, "readonly", (store) => request<Project[]>(store.getAll()));
  return {
    async load(id: TripId) {
      const stored = await transaction(db, PROJECTS, "readonly", (store) =>
        request<Project | undefined>(store.get(id)),
      );
      return stored && checkStoredProject(stored);
    },
    save(project: Project): Promise<SaveResult> {
      return transaction(db, PROJECTS, "readwrite", async (store) => {
        const current = await request<Project | undefined>(store.get(project.trip.id));
        if (current && current.trip.revision !== project.trip.revision) {
          return { kind: "conflict", storedRevision: current.trip.revision };
        }
        const revision = project.trip.revision + 1;
        await request(store.put({ ...project, trip: { ...project.trip, revision } }, project.trip.id));
        return { kind: "saved", revision };
      });
    },
    async list(): Promise<readonly TripSummary[]> {
      return (await all()).map((p) => ({ id: p.trip.id, title: p.trip.title, revision: p.trip.revision }));
    },
    async remove(id: TripId) {
      await transaction(db, PROJECTS, "readwrite", (store) => request(store.delete(id)));
    },
    loadAll: async () => (await all()).map(checkStoredProject),
    close: () => db.close(),
  };
}
