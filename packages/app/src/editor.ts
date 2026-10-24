import { DomainError, type Project } from "@tripreplay/domain";
import type { CompileSettings, Timeline } from "@tripreplay/timeline";
import { createAutosave, type SaveStatus } from "./autosave.ts";
import { applyCommand, type Command } from "./commands.ts";
import { createHistory, HISTORY_LIMIT, type History, record, redo, replacePresent, undo } from "./history.ts";
import type { ProjectRepository, Scheduler } from "./ports.ts";
import { createStore, type Listener } from "./store.ts";
import { createTimelineCache } from "./timeline-cache.ts";

export interface EditorState {
  readonly project: Project;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly save: SaveStatus;
}

export type DispatchResult = { readonly ok: true } | { readonly ok: false; readonly error: DomainError };

export interface Editor {
  getState(): EditorState;
  subscribe(listener: Listener): () => void;
  /** Applies a command as one undoable step. An invalid command leaves the project unchanged. */
  dispatch(command: Command): DispatchResult;
  undo(): void;
  redo(): void;
  /** The compiled timeline of the current project, reused until the project or settings change. */
  timeline(settings?: CompileSettings): Timeline;
  /** Saves pending changes now, for example before the page is hidden. */
  flush(): Promise<void>;
  dispose(): void;
}

export interface EditorOptions {
  readonly project: Project;
  readonly repository: ProjectRepository;
  readonly scheduler: Scheduler;
  readonly autosaveDelayMs?: number;
  readonly historyLimit?: number;
}

function withRevision(project: Project, revision: number): Project {
  return project.trip.revision === revision ? project : { ...project, trip: { ...project.trip, revision } };
}

/**
 * Opens a project for editing: commands with undo and redo, autosave with revision checks, and the
 * compiled timeline. The revision belongs to storage, not to the edit history, so undo and redo
 * keep the latest stored revision.
 */
export function createEditor(options: EditorOptions): Editor {
  const limit = options.historyLimit ?? HISTORY_LIMIT;
  let history: History<Project> = createHistory(options.project);
  const store = createStore<EditorState>({
    project: options.project,
    canUndo: false,
    canRedo: false,
    save: { kind: "saved" },
  });

  const publish = (next: History<Project>) => {
    history = next;
    store.setState((state) => ({
      ...state,
      project: next.present,
      canUndo: next.past.length > 0,
      canRedo: next.future.length > 0,
    }));
  };

  const autosave = createAutosave(
    {
      project: () => history.present,
      saved: (revision) => publish(replacePresent(history, withRevision(history.present, revision))),
      status: (save) => store.setState((state) => (state.save === save ? state : { ...state, save })),
    },
    options.repository,
    options.scheduler,
    options.autosaveDelayMs,
  );

  const move = (step: (h: History<Project>) => History<Project>) => {
    const revision = history.present.trip.revision;
    const next = step(history);
    if (next === history) return;
    publish(replacePresent(next, withRevision(next.present, revision)));
    autosave.changed();
  };

  const timeline = createTimelineCache();

  return {
    getState: store.getState,
    subscribe: store.subscribe,
    dispatch(command) {
      let next: Project;
      try {
        next = applyCommand(history.present, command);
      } catch (error) {
        if (error instanceof DomainError) return { ok: false, error };
        throw error;
      }
      if (next !== history.present) {
        publish(record(history, next, limit));
        autosave.changed();
      }
      return { ok: true };
    },
    undo: () => move(undo),
    redo: () => move(redo),
    timeline: (settings) => timeline(history.present, settings),
    flush: () => autosave.flush(),
    dispose: () => autosave.dispose(),
  };
}
