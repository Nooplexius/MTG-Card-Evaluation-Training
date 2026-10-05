import { useSyncExternalStore } from 'react';
import { engine } from '../engineClient.ts';
import { getSettings, setSettings } from '../settings.ts';

export interface PracticeFilterState {
  query: string;
  count: number | null;
  version: number;
  pending: boolean;
  notice: string | null;
}

let state: PracticeFilterState = { query: getSettings().query, count: null, version: 0, pending: false, notice: null };
const listeners = new Set<() => void>();
const emit = (patch: Partial<PracticeFilterState>) => {
  state = { ...state, ...patch };
  for (const l of listeners) l();
};

export function usePracticeFilter(): PracticeFilterState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

/** Applies a query to the practice pool; the last valid pool stays active on errors or when offline. */
export async function applyPracticeQuery(q: string): Promise<{ ok: boolean; error: string | null; needsConnection: boolean }> {
  emit({ pending: true });
  const r = await engine().call('practiceQuery', q);
  if (r.error || r.needsConnection || r.count === null) {
    emit({ pending: false, notice: r.needsConnection ? 'This filter needs a connection to Scryfall; keeping the previous pool.' : r.error });
    return { ok: false, error: r.error, needsConnection: r.needsConnection };
  }
  setSettings({ query: r.query });
  emit({ query: r.query, count: r.count, version: state.version + 1, pending: false, notice: r.count === 0 ? 'No cards match; add or remove terms.' : null });
  return { ok: true, error: null, needsConnection: false };
}

export function filterLabel(q: string): string {
  return q.trim() === '' ? 'All sets' : q;
}
