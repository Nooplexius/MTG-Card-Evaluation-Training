import { m } from 'motion/react';
import { GRADES } from '../../lib/grades.ts';

const pct = (g: number) => ((g + 0.5) / GRADES.length) * 100;

/** The 13-step assay strip, F left to A+ right, with the user's mark and the 17Lands marker. */
export function GradeStrip({ user, actual, reduced, uncertainty }: { user: number; actual: number; reduced: boolean; uncertainty?: number }) {
  const band = uncertainty && uncertainty >= 0.75 ? Math.min(6, uncertainty) : 0;
  return (
    <div className="strip" aria-hidden>
      <div className="strip__track">
        {GRADES.map((g, i) => (
          <span key={g} className="strip__seg" style={{ background: `var(--g${i})` }} />
        ))}
        {band > 0 && <span className="strip__noise" style={{ left: `${pct(actual) - (band / GRADES.length) * 100}%`, width: `${((2 * band) / GRADES.length) * 100}%` }} />}
      </div>
      <span className="strip__rail" style={{ transform: `translateX(${pct(user)}%)` }}>
        <span className="strip__you" />
      </span>
      <m.span
        className="strip__rail"
        initial={reduced ? false : { x: `${pct(user)}%`, opacity: 0.5 }}
        animate={{ x: `${pct(actual)}%`, opacity: 1 }}
        transition={{ duration: reduced ? 0 : 0.28, ease: [0.2, 0.8, 0.2, 1] }}
      >
        <span className="strip__truth" />
      </m.span>
      <div className="strip__ends">
        <span>F</span>
        <span>C</span>
        <span>A+</span>
      </div>
    </div>
  );
}
