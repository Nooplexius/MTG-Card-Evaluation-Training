import { afterEach, describe, expect, it, vi } from 'vitest';

function storage(initial: Record<string, string>) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}

async function loadWith(saved: unknown) {
  vi.resetModules();
  vi.stubGlobal('localStorage', storage(saved === undefined ? {} : { 'loupe.settings': JSON.stringify(saved) }));
  return import('../../src/app/settings.ts');
}

afterEach(() => vi.unstubAllGlobals());

describe('settings', () => {
  it('defaults to Random mode', async () => {
    const s = await loadWith(undefined);
    expect(s.getSettings().mode).toBe('random');
  });

  it('moves settings saved before version 2 to Random once, keeping everything else', async () => {
    const s = await loadWith({ mode: 'adaptive', sessionLength: 10, volume: 0.4 });
    expect(s.getSettings()).toMatchObject({ mode: 'random', sessionLength: 10, volume: 0.4, settingsVersion: 2 });
  });

  it('keeps Adaptive when it was chosen after the change', async () => {
    const s = await loadWith({ mode: 'adaptive', settingsVersion: 2 });
    expect(s.getSettings().mode).toBe('adaptive');
  });
});
