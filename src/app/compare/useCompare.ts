import { useCallback, useEffect, useRef, useState } from 'react';
import type { CompareRecord } from '../../lib/types.ts';
import type { CardView } from '../../lib/view.ts';
import { engine } from '../engineClient.ts';
import { feedback } from '../feedback/feedback.ts';
import { cardImageUrl, preloadImage } from '../practice/CardFace.tsx';
import { getSettings } from '../settings.ts';

export interface Pair {
  left: CardView;
  right: CardView;
  level: number;
  z: number;
}

export type Side = 'left' | 'right';
export type ComparePhase = 'loading' | 'picking' | 'revealed' | 'empty';

export interface CompareSummary {
  total: number;
  recentN: number;
  recentRight: number;
  level: number;
}

/** Pool keys from the last few pairs, kept out of the next one. */
const RECENT = 16;

async function fetchPair(avoid: string[]): Promise<Pair | null> {
  const p = await engine().call('comparePair', avoid);
  if (!p) return null;
  const images = Promise.all([p.left, p.right].map((v) => preloadImage(cardImageUrl(v.card.p)).catch(() => undefined)));
  await Promise.race([images, new Promise((r) => setTimeout(r, 1500))]);
  return p;
}

export function winnerOf(p: Pair): Side {
  return p.left.card.s.gihWr > p.right.card.s.gihWr ? 'left' : 'right';
}

export function useCompare(ready: boolean, filterVersion: number) {
  const [phase, setPhase] = useState<ComparePhase>('loading');
  const [pair, setPair] = useState<Pair | null>(null);
  const [pick, setPick] = useState<Side | null>(null);
  const [visit, setVisit] = useState({ n: 0, right: 0, streak: 0 });
  const [summary, setSummary] = useState<CompareSummary | null>(null);
  const recent = useRef<string[]>([]);
  const shownAt = useRef(0);
  const upcoming = useRef<Promise<Pair | null> | null>(null);

  const show = useCallback((p: Pair | null) => {
    setPick(null);
    setPair(p);
    setPhase(p ? 'picking' : 'empty');
    shownAt.current = performance.now();
    if (p) recent.current = [...recent.current, p.left.key, p.right.key].slice(-RECENT);
  }, []);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    upcoming.current = null;
    setPhase('loading');
    void fetchPair(recent.current).then((p) => {
      if (!cancelled) show(p);
    });
    void engine()
      .call('compareSummary')
      .then((s) => {
        if (!cancelled) setSummary(s);
      });
    return () => {
      cancelled = true;
    };
  }, [ready, filterVersion]);

  const choose = useCallback(
    (side: Side) => {
      if (!pair || phase !== 'picking') return;
      const rtMs = Math.round(performance.now() - shownAt.current);
      const correct = winnerOf(pair) === side;
      setPick(side);
      setPhase('revealed');
      setVisit((v) => ({ n: v.n + 1, right: v.right + (correct ? 1 : 0), streak: correct ? v.streak + 1 : 0 }));
      setTimeout(() => feedback(correct ? 'compare.right' : 'compare.wrong'), 90);
      const { left, right } = pair;
      const rec: CompareRecord = {
        ts: Date.now(),
        lset: left.set,
        format: left.format,
        dataDate: left.dataDate,
        left: left.key,
        right: right.key,
        leftOracle: left.card.o,
        rightOracle: right.card.o,
        leftWr: left.card.s.gihWr,
        rightWr: right.card.s.gihWr,
        leftN: left.card.s.gih,
        rightN: right.card.s.gih,
        leftG: left.card.g,
        rightG: right.card.g,
        pick: side,
        correct,
        level: pair.level,
        z: pair.z,
        rtMs,
        filter: getSettings().query,
      };
      const saved = engine().call('saveCompare', rec);
      void saved.then(setSummary);
      upcoming.current = saved.then(() => fetchPair(recent.current));
    },
    [pair, phase],
  );

  const next = useCallback(async () => {
    const pending = upcoming.current ?? fetchPair(recent.current);
    upcoming.current = null;
    const slow = setTimeout(() => setPhase('loading'), 120);
    const p = await pending;
    clearTimeout(slow);
    show(p);
  }, [show]);

  return { phase, pair, pick, visit, summary, choose, next };
}
