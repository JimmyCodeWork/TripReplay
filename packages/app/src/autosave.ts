import type { Project } from "@tripreplay/domain";
import type { ProjectRepository, Scheduler } from "./ports.ts";

/** Delay after the last change before the project is saved. */
export const AUTOSAVE_DELAY_MS = 1000;

export type SaveStatus =
  | { readonly kind: "saved" }
  | { readonly kind: "pending" }
  | { readonly kind: "saving" }
  /** Saving failed; the next change or `flush` tries again. */
  | { readonly kind: "error"; readonly message: string }
  /** The stored project was changed elsewhere; autosave stops until the user resolves it. */
  | { readonly kind: "conflict"; readonly storedRevision: number };

export interface AutosaveHost {
  /** Current project. */
  project(): Project;
  /** Called after a save with the stored revision, which the host stamps onto its project. */
  saved(revision: number): void;
  status(status: SaveStatus): void;
}

export interface Autosave {
  /** Notes that the project changed and schedules a save. */
  changed(): void;
  /** Saves now if there are unsaved changes, and waits for any save in progress. */
  flush(): Promise<void>;
  dispose(): void;
}

/**
 * Saves the project a short time after the last change. Only one save runs at a time; changes made
 * during a save are saved afterwards, and a revision conflict stops further saves.
 */
export function createAutosave(
  host: AutosaveHost,
  repository: ProjectRepository,
  scheduler: Scheduler,
  delayMs = AUTOSAVE_DELAY_MS,
): Autosave {
  let saved = host.project();
  let cancel: (() => void) | undefined;
  let running: Promise<void> | undefined;
  let conflict = false;

  const dirty = () => host.project() !== saved;

  const save = async (): Promise<void> => {
    const project = host.project();
    host.status({ kind: "saving" });
    try {
      const result = await repository.save(project);
      if (result.kind === "conflict") {
        conflict = true;
        host.status({ kind: "conflict", storedRevision: result.storedRevision });
        return;
      }
      const unchanged = host.project() === project;
      host.saved(result.revision);
      if (unchanged) saved = host.project();
      host.status(dirty() ? { kind: "pending" } : { kind: "saved" });
      if (dirty()) schedule();
    } catch (error) {
      host.status({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  const start = (): Promise<void> => {
    running ??= save().finally(() => {
      running = undefined;
    });
    return running;
  };

  function schedule(): void {
    cancel?.();
    cancel = scheduler.schedule(delayMs, () => {
      cancel = undefined;
      // A save in progress reschedules itself when it finishes with changes left over.
      if (!running) void start();
    });
  }

  return {
    changed() {
      if (conflict) return;
      host.status({ kind: "pending" });
      schedule();
    },
    async flush() {
      cancel?.();
      cancel = undefined;
      if (running) await running;
      if (dirty() && !conflict) await start();
    },
    dispose() {
      cancel?.();
      cancel = undefined;
    },
  };
}
