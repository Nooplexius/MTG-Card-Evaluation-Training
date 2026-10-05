import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Manifest } from '../lib/data.ts';
import { baseUrl, engine } from './engineClient.ts';
import { setLoadProgress, type LoadProgress } from './loadProgress.ts';

export interface StarterInfo {
  card: { set: string; o: string; id: string; v?: string; name: string };
  url: string;
  hash?: string;
}

export interface AppState {
  manifest: Manifest | null;
  error: string | null;
  starter: StarterInfo | null;
}

const Ctx = createContext<AppState>({ manifest: null, error: null, starter: null });

export function useApp(): AppState {
  return useContext(Ctx);
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(() => ({
    manifest: null,
    error: null,
    starter: window.__LOUPE_STARTER__ ?? null,
  }));

  useEffect(() => {
    const e = engine();
    const off = e.on('progress', (p) => setLoadProgress(p as LoadProgress));
    const start = () => {
      e.call('init', baseUrl(), state.starter?.card.set)
        .then((m) => {
          setLoadProgress({ total: (m as Manifest).sets.length });
          setState((s) => ({ ...s, manifest: m as Manifest }));
        })
        .catch((err: Error) => setState((s) => ({ ...s, error: err.message })));
      void e.call('persist');
    };
    if (state.starter) {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = state.starter.url;
      let started = false;
      const go = () => {
        if (started) return;
        started = true;
        setTimeout(start, 150);
      };
      img.decode().then(go, go);
      setTimeout(go, 2500);
    } else start();
    return () => {
      off();
    };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}
