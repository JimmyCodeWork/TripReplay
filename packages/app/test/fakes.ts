import { addStop, createProject, type Project, type Stop, type TripId } from "@tripreplay/domain";
import type { ProjectRepository, SaveResult, Scheduler, TripSummary } from "../src/index.ts";

export function stop(id: string, date = "2026-04-01"): Stop {
  return { id, name: id, description: "", date, location: { lon: 135.76, lat: 35.01 } };
}

export function sampleProject(): Project {
  let p = createProject({ id: "t1", title: "Kyoto", timeZone: "Asia/Tokyo", themeId: "classic" });
  p = addStop(p, stop("a"));
  return p;
}

/** In-memory repository with the same revision check as the real one. Saves can be held to test overlap. */
export class MemoryRepository implements ProjectRepository {
  readonly stored = new Map<TripId, Project>();
  readonly saves: Project[] = [];
  failNext: Error | undefined;
  private held: (() => void)[] | undefined;

  hold(): void {
    this.held = [];
  }

  release(): void {
    const held = this.held ?? [];
    this.held = undefined;
    for (const resume of held) resume();
  }

  async load(id: TripId): Promise<Project | undefined> {
    return this.stored.get(id);
  }

  async save(project: Project): Promise<SaveResult> {
    if (this.held) await new Promise<void>((resume) => this.held?.push(resume));
    if (this.failNext) {
      const error = this.failNext;
      this.failNext = undefined;
      throw error;
    }
    const current = this.stored.get(project.trip.id);
    if (current && current.trip.revision !== project.trip.revision) {
      return { kind: "conflict", storedRevision: current.trip.revision };
    }
    const revision = project.trip.revision + 1;
    this.stored.set(project.trip.id, { ...project, trip: { ...project.trip, revision } });
    this.saves.push(project);
    return { kind: "saved", revision };
  }

  async list(): Promise<readonly TripSummary[]> {
    return [...this.stored.values()].map((p) => ({ id: p.trip.id, title: p.trip.title, revision: p.trip.revision }));
  }

  async remove(id: TripId): Promise<void> {
    this.stored.delete(id);
  }
}

/** Scheduler driven by the test: time advances only through `advance`. */
export class ManualScheduler implements Scheduler {
  private now = 0;
  private tasks: { at: number; callback: () => void }[] = [];

  schedule(delayMs: number, callback: () => void): () => void {
    const task = { at: this.now + delayMs, callback };
    this.tasks.push(task);
    return () => {
      this.tasks = this.tasks.filter((t) => t !== task);
    };
  }

  get pending(): number {
    return this.tasks.length;
  }

  /** Advances time, runs due callbacks, and lets the resulting promises settle. */
  async advance(ms: number): Promise<void> {
    this.now += ms;
    const due = this.tasks.filter((t) => t.at <= this.now);
    this.tasks = this.tasks.filter((t) => t.at > this.now);
    for (const task of due) task.callback();
    await settle();
  }
}

export async function settle(): Promise<void> {
  for (let i = 0; i < 10; i++) await Promise.resolve();
}
