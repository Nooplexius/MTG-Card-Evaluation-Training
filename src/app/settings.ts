import { useSyncExternalStore } from 'react';

export interface Settings {
  volume: number;
  muted: boolean;
  haptics: boolean;
  reducedMotion: 'system' | 'on' | 'off';
  sessionLength: number;
  mode: 'adaptive' | 'random';
  dailyGoal: number;
  query: string;
  installPromptShown: boolean;
  lastBackupAt: number;
  showKeyHints: boolean;
}

export const DEFAULTS: Settings = {
  volume: 0.7,
  muted: false,
  haptics: true,
  reducedMotion: 'system',
  sessionLength: 20,
  mode: 'adaptive',
  dailyGoal: 30,
  query: '',
  installPromptShown: false,
  lastBackupAt: 0,
  showKeyHints: true,
};

const KEY = 'loupe.settings';
let current: Settings = load();
const listeners = new Set<() => void>();

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function getSettings(): Settings {
  return current;
}

export function setSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    /* storage full or blocked: keep in memory */
  }
  for (const l of listeners) l();
}

export function replaceSettings(s: Partial<Settings>): void {
  current = { ...DEFAULTS, ...s };
  setSettings({});
}

export function useSettings(): Settings {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

export function prefersReducedMotion(): boolean {
  if (current.reducedMotion === 'on') return true;
  if (current.reducedMotion === 'off') return false;
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function useReducedMotion(): boolean {
  const s = useSettings();
  void s;
  return prefersReducedMotion();
}
