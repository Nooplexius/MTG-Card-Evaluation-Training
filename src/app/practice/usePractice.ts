import { useCallback, useEffect, useRef, useState } from 'react';
import type { Manifest } from '../../lib/data.ts';
import { isCorrect } from '../../lib/grades.ts';
import type { CardSnapshot, Evaluation, Mode, SelectionReason, Session } from '../../lib/types.ts';
import type { CardView, Selection } from '../../lib/view.ts';
import type { StarterInfo } from '../AppContext.tsx';
import { engine } from '../engineClient.ts';
import { feedback } from '../feedback/feedback.ts';
import { prefetchUpcoming } from '../offline.ts';
import { getSettings } from '../settings.ts';
import { cardImageUrl, preloadImage } from './CardFace.tsx';

export const DEAL_MS = 220;
/** Matches InsightService's DRILL_CARDS; a drill can end earlier on mastery. */
const DRILL_LENGTH = 20;
const QUEUE = 3;

export interface Current {
  key: string;
  view: CardView | null;
  image: { id: string; image_version?: string; name: string };
  reason: SelectionReason;
  prob: number;
  uniform: boolean;
  shownAt: number;
  visibleAt: number | null;
}

export type Phase = 'boot' | 'grading' | 'revealed' | 'summary' | 'empty';

export interface RevealState {
  user: number;
  contrasts: CardView[] | null;
  firstLook: boolean | null;
  /** Set on the card that reaches today's goal. */
  goalReached: boolean;
  drillMastered: boolean;
}

export interface PracticeApi {
  phase: Phase;
  current: Current | null;
  reveal: RevealState | null;
  session: Session | null;
  streak: number;
  commit: (g: number) => void;
  next: () => void;
  skip: (reason: 'image' | 'unreadable' | 'other') => void;
  markVisible: () => void;
  newSession: () => void;
  mode: Mode;
  today: number;
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`);

function fromSelection(s: Selection): Current {
  return { key: s.view.key, view: s.view, image: s.view.card.p, reason: s.reason, prob: s.prob, uniform: s.uniform, shownAt: Date.now(), visibleAt: null };
}

function newSessionRecord(mode: Mode, drillId?: string): Session {
  const s = getSettings();
  return { id: uid(), startedAt: Date.now(), endedAt: null, length: drillId ? DRILL_LENGTH : s.sessionLength, mode, filter: drillId ? '' : s.query, done: 0, queue: [], current: null, summarySeen: false, drillId };
}

export function snapshotOf(v: CardView): CardSnapshot {
  return { id: v.card.p.id, lset: v.set, printing: v.card.p, tags: v.tags, bonus: v.card.b, col: v.card.col, crowd: v.card.c, updatedAt: Date.now() };
}

export function usePractice(manifest: Manifest | null, starter: StarterInfo | null, opts: { mode: Mode; drillKeys?: string[]; drillId?: string; filterVersion: number }): PracticeApi {
  const e = engine();
  const [phase, setPhase] = useState<Phase>(starter ? 'grading' : 'boot');
  const [current, setCurrent] = useState<Current | null>(() =>
    starter
      ? { key: `${starter.card.set}:${starter.card.o}`, view: null, image: { id: starter.card.id, image_version: starter.card.v, name: starter.card.name }, reason: 'starter', prob: 0, uniform: true, shownAt: Date.now(), visibleAt: null }
      : null,
  );
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [streak, setStreak] = useState(0);
  const [today, setToday] = useState(0);
  const todayRef = useRef(0);
  const queue = useRef<Selection[]>([]);
  const planning = useRef<Promise<void> | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const currentRef = useRef<Current | null>(current);
  const modeRef = useRef(opts.mode);
  modeRef.current = opts.mode;
  currentRef.current = current;

  const persistSession = useCallback((s: Session) => {
    sessionRef.current = s;
    setSession(s);
    void e.call('saveSession', s);
  }, []);

  /** The starter card can be graded before boot finishes, so the session is created on first need. */
  const ensureSession = useCallback((): Session => {
    if (sessionRef.current) return sessionRef.current;
    const s = { ...newSessionRecord(modeRef.current, opts.drillId), current: currentRef.current?.key ?? null };
    persistSession(s);
    return s;
  }, [opts.drillId]);

  const versionRef = useRef(opts.filterVersion);
  const refill = useCallback(async () => {
    if (planning.current) return planning.current;
    const p = (async () => {
      let sels: Selection[] = [];
      for (let attempt = 0; attempt < 4; attempt++) {
        const need = QUEUE - queue.current.length;
        if (need <= 0) return;
        const version = versionRef.current;
        const exclude = [currentRef.current?.key, ...queue.current.map((q) => q.view.key)].filter((k): k is string => !!k);
        await e.call('waitAll');
        sels = await e.call('plan', { mode: modeRef.current, n: need, exclude, drillKeys: opts.drillKeys });
        if (version === versionRef.current) break;
        sels = [];
      }
      queue.current.push(...sels);
      for (const s of sels) void preloadImage(cardImageUrl(s.view.card.p)).catch(() => {});
      const ses = sessionRef.current;
      if (ses) persistSession({ ...ses, queue: queue.current.map((q) => q.view.key) });
      void prefetchUpcoming();
    })();
    planning.current = p;
    try {
      await p;
    } finally {
      planning.current = null;
    }
  }, [opts.drillKeys]);

  const show = useCallback((c: Current) => {
    setCurrent(c);
    setReveal(null);
    setPhase('grading');
    const ses = sessionRef.current;
    if (ses) persistSession({ ...ses, current: c.key, queue: queue.current.map((q) => q.view.key) });
  }, []);

  // Boot: resume an open session, keep the inline starter card, or plan a first card.
  useEffect(() => {
    if (!manifest) return;
    let cancelled = false;
    void e.call('todayCount').then((n) => {
      todayRef.current = n;
      setToday(n);
    });
    (async () => {
      const open = opts.drillId ? null : await e.call('getOpenSession');
      if (cancelled) return;
      const startedHere = sessionRef.current !== null && !opts.drillId;
      if (!startedHere && open && open.current && (!starter || open.done > 0) && open.mode === modeRef.current) {
        sessionRef.current = open;
        setSession(open);
        const v = await e.call('viewWhenReady', open.current);
        if (cancelled) return;
        if (v) {
          show({ key: v.key, view: v, image: v.card.p, reason: 'resume', prob: 0, uniform: false, shownAt: Date.now(), visibleAt: null });
          void refill();
          return;
        }
      }
      if (current && current.reason === 'starter' && !opts.drillId) {
        ensureSession();
        const v = await e.call('viewWhenReady', current.key);
        if (cancelled) return;
        const total = manifest.sets.reduce((n, s) => n + s.cards, 0);
        setCurrent((c) => (c && c.key === current.key ? { ...c, view: v, prob: total > 0 ? 1 / total : 0 } : c));
        void refill();
        return;
      }
      sessionRef.current = null;
      persistSession(newSessionRecord(modeRef.current, opts.drillId));
      await refill();
      if (cancelled) return;
      const first = queue.current.shift();
      if (!first) {
        setPhase('empty');
        return;
      }
      show(fromSelection(first));
      void refill();
    })();
    return () => {
      cancelled = true;
    };
  }, [manifest, opts.drillId]);

  // A new filter or mode replans the upcoming cards (the card on screen stays).
  useEffect(() => {
    versionRef.current = opts.filterVersion * 10 + (opts.mode === 'random' ? 1 : 0);
    queue.current = [];
  }, [opts.filterVersion, opts.mode]);

  const markVisible = useCallback(() => {
    setCurrent((c) => (c && c.visibleAt === null ? { ...c, visibleAt: Math.max(Date.now(), c.shownAt + DEAL_MS) } : c));
  }, []);

  const commit = useCallback(async (g: number) => {
    const cur = currentRef.current;
    if (!cur) return;
    const now = Date.now();
    const rtMs = Math.max(0, now - (cur.visibleAt ?? cur.shownAt + DEAL_MS));
    todayRef.current += 1;
    const goal = getSettings().dailyGoal;
    const goalReached = todayRef.current === goal;
    setToday(todayRef.current);
    setReveal({ user: g, contrasts: null, firstLook: null, goalReached, drillMastered: false });
    setPhase('revealed');
    const sesAtCommit = ensureSession();
    persistSession({ ...sesAtCommit, done: sesAtCommit.done + 1 });
    if (goalReached) setTimeout(() => feedback('milestone'), 420);
    let view = cur.view;
    if (!view) {
      view = await e.call('viewWhenReady', cur.key);
      if (!view) return;
      setCurrent((c) => (c && c.key === cur.key ? { ...c, view } : c));
    }
    const actual = view.card.g;
    const correct = isCorrect(g, actual);
    setStreak((s) => {
      const next = correct ? s + 1 : 0;
      const ev = g === actual ? 'reveal.exact' : correct ? 'reveal.close' : 'reveal.miss';
      setTimeout(() => feedback(ev, { level: correct ? Math.min(next, 10) : 0 }), 90);
      return next;
    });
    const ses = sesAtCommit;
    const evaluation: Evaluation = {
      ts: now,
      key: view.key,
      oracleId: view.card.o,
      lset: view.set,
      printingId: view.card.p.id,
      user: g,
      actual,
      gihWr: view.card.s.gihWr,
      gih: view.card.s.gih,
      mean: view.mean,
      sd: view.sd,
      n: view.n,
      rank: view.card.r,
      z: view.card.z,
      alsa: view.card.s.alsa ?? null,
      ata: view.card.s.ata ?? null,
      crowd: view.card.c,
      dataDate: view.dataDate,
      source: view.source,
      format: view.format,
      mode: modeRef.current,
      reason: cur.reason,
      prob: cur.prob,
      filter: ses?.filter ?? getSettings().query,
      rtMs,
      firstLook: false,
      uniform: cur.uniform,
      sessionId: ses?.id ?? 'none',
      seq: (ses?.done ?? 0) + 1,
      drillId: ses?.drillId,
    };
    try {
      localStorage.setItem('loupe.visited', '1');
    } catch {
      /* ignore */
    }
    const saved = await e.call('saveEvaluation', evaluation, snapshotOf(view));
    setReveal((r) => (r ? { ...r, firstLook: saved.firstLook, drillMastered: Boolean(saved.drill?.mastered) } : r));
    const s2 = sessionRef.current;
    if (s2 && saved.drill?.finished && s2.length !== s2.done) persistSession({ ...s2, length: s2.done });
    const avoid = [view.key, ...queue.current.map((q) => q.view.key)];
    const contrasts = await e.call('contrasts', view.key, 3, avoid);
    setReveal((r) => (r && r.user === g ? { ...r, contrasts } : r));
    void e.call('expose', contrasts.map((c) => c.card.o), 'contrast');
    void refill();
  }, []);

  const advance = useCallback(async () => {
    const ses = sessionRef.current;
    if (ses && ses.length > 0 && ses.done >= ses.length) {
      persistSession({ ...ses, endedAt: Date.now(), current: null, queue: [] });
      feedback('session.complete');
      setPhase('summary');
      return;
    }
    let nextSel = queue.current.shift();
    if (!nextSel) {
      await refill();
      nextSel = queue.current.shift();
    }
    if (!nextSel) {
      setPhase('empty');
      return;
    }
    show(fromSelection(nextSel));
    void refill();
  }, []);

  const skip = useCallback(
    async (reason: 'image' | 'unreadable' | 'other') => {
      const cur = currentRef.current;
      if (!cur) return;
      void e.call('skip', { ts: Date.now(), key: cur.key, reason, sessionId: sessionRef.current?.id ?? 'none' });
      await advance();
    },
    [advance],
  );

  const newSession = useCallback(async () => {
    const ses = newSessionRecord(modeRef.current, opts.drillId);
    persistSession(ses);
    setStreak(0);
    await advance();
  }, [advance, opts.drillId]);

  return { phase, current, reveal, session, streak, commit, next: advance, skip, markVisible, newSession, mode: opts.mode, today };
}
