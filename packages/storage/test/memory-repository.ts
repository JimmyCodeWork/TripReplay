import type { ProjectRepository, SaveResult, TripSummary } from "@tripreplay/app";
import type { Project, TripId } from "@tripreplay/domain";

/** In-memory repository with the same revision check as the IndexedDB one. */
export class MemoryRepository implements ProjectRepository {
  readonly stored = new Map<TripId, Project>();

  async load(id: TripId) {
    return this.stored.get(id);
  }

  async save(project: Project): Promise<SaveResult> {
    const current = this.stored.get(project.trip.id);
    if (current && current.trip.revision !== project.trip.revision) {
      return { kind: "conflict", storedRevision: current.trip.revision };
    }
    const revision = project.trip.revision + 1;
    this.stored.set(project.trip.id, { ...project, trip: { ...project.trip, revision } });
    return { kind: "saved", revision };
  }

  async list(): Promise<readonly TripSummary[]> {
    return [...this.stored.values()].map((p) => ({ id: p.trip.id, title: p.trip.title, revision: p.trip.revision }));
  }

  async remove(id: TripId) {
    this.stored.delete(id);
  }
}
