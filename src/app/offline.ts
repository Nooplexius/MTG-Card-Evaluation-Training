import { useSyncExternalStore } from 'react';
import { engine } from './engineClient.ts';

export interface OfflineState {
  offline: boolean;
  /** Cards practicable offline (display image cached), when offline. */
  cards: number | null;
}

let state: OfflineState = { offline: typeof navigator !== 'undefined' ? !navigator.onLine : false, cards: null };
const listeners = new Set<() => void>();
const emit = (s: OfflineState) => {
  state = s;
  for (const l of listeners) l();
};

export function useOffline(): OfflineState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
}

async function sync(offline: boolean) {
  const r = await engine().call('setOffline', offline);
  emit({ offline, cards: r.cards });
}

/** Tracks connectivity; offline practice draws only from cards whose images are cached. */
export function watchConnectivity(): void {
  window.addEventListener('online', () => void sync(false));
  window.addEventListener('offline', () => void sync(true));
  if (!navigator.onLine) void sync(true);
}

const PREFETCH_KEY = 'loupe.prefetch';
const DAILY_PREFETCH = 240;

function budgetLeft(): number {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFETCH_KEY) ?? '{}') as { day?: string; n?: number };
    const day = new Date().toDateString();
    return raw.day === day ? DAILY_PREFETCH - (raw.n ?? 0) : DAILY_PREFETCH;
  } catch {
    return DAILY_PREFETCH;
  }
}

function spend(n: number) {
  const day = new Date().toDateString();
  const left = budgetLeft();
  localStorage.setItem(PREFETCH_KEY, JSON.stringify({ day, n: DAILY_PREFETCH - left + n }));
}

let prefetching = false;

/** Keeps a rolling cache of likely upcoming cards' images so practice keeps working when the connection drops. */
export async function prefetchUpcoming(n = 8): Promise<void> {
  if (prefetching || state.offline || !navigator.serviceWorker?.controller) return;
  const allowed = Math.min(n, budgetLeft());
  if (allowed <= 0) return;
  prefetching = true;
  try {
    const urls = await engine().call('prefetchUrls', allowed);
    for (const u of urls) {
      await new Promise<void>((r) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => r(), { timeout: 2000 }) : setTimeout(r, 200)));
      await fetch(u, { mode: 'cors' }).catch(() => undefined);
    }
    spend(urls.length);
  } finally {
    prefetching = false;
  }
}
