import { useSyncExternalStore } from 'react';
import { engine } from './engineClient.ts';
import { go } from './router.ts';

export interface ActiveDrill {
  id: string;
  keys: string[];
  label: string;
}

let current: ActiveDrill | null = null;
const listeners = new Set<() => void>();
const set = (d: ActiveDrill | null) => {
  current = d;
  for (const l of listeners) l();
};

export function useDrill(): ActiveDrill | null {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

/** Starts a drill on a facet's query and opens practice in drill mode. */
export async function startDrill(facetId: string): Promise<boolean> {
  const r = await engine().call('startDrill', facetId);
  if (!r) return false;
  set({ id: r.drill.id, keys: r.keys, label: r.drill.label });
  go('practice');
  return true;
}

export function endDrill(): void {
  set(null);
  go('practice');
}
