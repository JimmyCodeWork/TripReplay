/** Default number of steps that can be undone. */
export const HISTORY_LIMIT = 100;

/** Undo and redo stacks of immutable snapshots. Every operation returns a new history. */
export interface History<T> {
  readonly past: readonly T[];
  readonly present: T;
  readonly future: readonly T[];
}

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

/** Records a new present; the oldest steps are dropped beyond `limit`, and redo is cleared. */
export function record<T>(history: History<T>, next: T, limit = HISTORY_LIMIT): History<T> {
  const past = [...history.past, history.present];
  return { past: past.slice(Math.max(0, past.length - limit)), present: next, future: [] };
}

export function undo<T>(history: History<T>): History<T> {
  const previous = history.past.at(-1);
  if (previous === undefined) return history;
  return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}

export function redo<T>(history: History<T>): History<T> {
  const [next, ...future] = history.future;
  if (next === undefined) return history;
  return { past: [...history.past, history.present], present: next, future };
}

/** Replaces the present without recording a step, for changes that are not user edits. */
export function replacePresent<T>(history: History<T>, present: T): History<T> {
  return { ...history, present };
}
