import { useSyncExternalStore } from 'react';

export interface LoadProgress {
  loaded: number;
  total: number;
  cards: number;
}

/** Set-file loading progress. Kept out of the app context so a progress event re-renders only what displays it. */
let state: LoadProgress = { loaded: 0, total: 0, cards: 0 };
const listeners = new Set<() => void>();

export function setLoadProgress(patch: Partial<LoadProgress>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function useLoadProgress(): LoadProgress {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}
