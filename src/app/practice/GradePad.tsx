import { useEffect, useRef, useState } from 'react';
import { GRADES } from '../../lib/grades.ts';
import { feedback } from '../feedback/feedback.ts';
import { unlockAudio } from '../feedback/sound.ts';

/** Columns F, D, C, B, A left to right (same direction as the reveal strip); rows +, plain, −; F spans all rows. */
const KEYS: Array<{ g: number; col: number; row: number; span?: number }> = [
  { g: 0, col: 1, row: 1, span: 3 },
  { g: 3, col: 2, row: 1 },
  { g: 2, col: 2, row: 2 },
  { g: 1, col: 2, row: 3 },
  { g: 6, col: 3, row: 1 },
  { g: 5, col: 3, row: 2 },
  { g: 4, col: 3, row: 3 },
  { g: 9, col: 4, row: 1 },
  { g: 8, col: 4, row: 2 },
  { g: 7, col: 4, row: 3 },
  { g: 12, col: 5, row: 1 },
  { g: 11, col: 5, row: 2 },
  { g: 10, col: 5, row: 3 },
];

export const gradeLabel = (g: number) => GRADES[g].replace('-', '\u2212');
export const gradeSpoken = (g: number) => GRADES[g].replace('+', ' plus').replace('-', ' minus');

const LETTER_BASE: Record<string, number> = { a: 11, b: 8, c: 5, d: 2 };

export function GradePad({ onCommit, disabled, showHints }: { onCommit: (g: number) => void; disabled?: boolean; showHints?: boolean }) {
  const [pressed, setPressed] = useState<number | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const pressedRef = useRef<number | null>(null);
  const committed = useRef(false);

  useEffect(() => {
    committed.current = false;
  }, [onCommit]);

  const commit = (g: number) => {
    if (disabled || committed.current) return;
    committed.current = true;
    pressedRef.current = null;
    setPressed(null);
    setPending(null);
    feedback('grade.commit');
    onCommit(g);
  };

  useEffect(() => {
    if (disabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      const k = e.key.toLowerCase();
      if (k === 'f' && !pending) {
        e.preventDefault();
        unlockAudio();
        commit(0);
        return;
      }
      if (k in LETTER_BASE) {
        e.preventDefault();
        unlockAudio();
        feedback('grade.press');
        setPending(k);
        return;
      }
      if (!pending) return;
      const base = LETTER_BASE[pending];
      if (k === '+' || k === '=') {
        e.preventDefault();
        commit(base + 1);
      } else if (k === '-' || k === '_') {
        e.preventDefault();
        commit(base - 1);
      } else if (k === 'enter' || k === ' ') {
        e.preventDefault();
        commit(base);
      } else if (k === 'escape') {
        feedback('grade.cancel');
        setPending(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [disabled, pending]);

  return (
    <div className="pad" role="group" aria-label="Grade this card">
      {KEYS.map(({ g, col, row, span }) => {
        const letter = GRADES[g][0].toLowerCase();
        return (
          <button
            key={g}
            type="button"
            className={`key${pressed === g ? ' is-pressed' : ''}${pending === letter ? ' is-pending' : ''}${span ? ' key--tall' : ''}`}
            style={{ gridColumn: col, gridRow: span ? `${row} / span ${span}` : row, ['--gc' as string]: `var(--g${g})` }}
            aria-label={gradeLabel(g)}
            title={gradeSpoken(g)}
            disabled={disabled}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              unlockAudio();
              if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
              pressedRef.current = g;
              setPressed(g);
              feedback('grade.press');
            }}
            onPointerLeave={() => {
              if (pressedRef.current === g) {
                pressedRef.current = null;
                setPressed(null);
                feedback('grade.cancel');
              }
            }}
            onPointerCancel={() => {
              pressedRef.current = null;
              setPressed(null);
            }}
            onPointerUp={() => {
              if (pressedRef.current === g) commit(g);
            }}
            onClick={(e) => {
              if (e.detail === 0) commit(g);
            }}
          >
            <span className="key__label display">{gradeLabel(g)}</span>
            {showHints && row === 2 && <span className="key__hint" aria-hidden>{letter === 'f' ? 'F' : `${letter.toUpperCase()}⏎`}</span>}
          </button>
        );
      })}
    </div>
  );
}
