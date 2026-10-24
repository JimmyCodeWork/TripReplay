export type Listener = () => void;

/**
 * A minimal observable state container. Its `getState` and `subscribe` match React's
 * `useSyncExternalStore`, so the UI can read it without a state library.
 */
export interface Store<T> {
  getState(): T;
  setState(update: (state: T) => T): void;
  subscribe(listener: Listener): () => void;
}

export function createStore<T>(initial: T): Store<T> {
  let state = initial;
  const listeners = new Set<Listener>();
  return {
    getState: () => state,
    setState(update) {
      const next = update(state);
      if (Object.is(next, state)) return;
      state = next;
      for (const listener of [...listeners]) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
