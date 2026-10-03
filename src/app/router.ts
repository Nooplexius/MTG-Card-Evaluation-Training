import { useSyncExternalStore } from 'react';

export type Route = 'practice' | 'menu' | 'filter' | 'stats' | 'insights' | 'history' | 'settings' | 'about' | 'data' | 'compare' | 'summary';

const ROUTES: Route[] = ['practice', 'menu', 'filter', 'stats', 'insights', 'history', 'settings', 'about', 'data', 'compare', 'summary'];

function parse(): { route: Route; param: string | null } {
  const h = location.hash.replace(/^#\/?/, '');
  const [r, ...rest] = h.split('/');
  const route = (ROUTES as string[]).includes(r) ? (r as Route) : 'practice';
  return { route, param: rest.length > 0 ? decodeURIComponent(rest.join('/')) : null };
}

let current = parse();
const listeners = new Set<() => void>();
window.addEventListener('hashchange', () => {
  current = parse();
  for (const l of listeners) l();
});

export function useRoute() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

export function go(route: Route, param?: string) {
  const hash = route === 'practice' ? '#/' : `#/${route}${param ? `/${encodeURIComponent(param)}` : ''}`;
  if (location.hash === hash) return;
  location.hash = hash;
}

export function back(parent: Route = 'practice') {
  go(parent);
}
