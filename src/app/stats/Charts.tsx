import { m } from 'motion/react';
import { GRADES } from '../../lib/grades.ts';
import { gradeLabel } from '../practice/GradePad.tsx';

const enter = (reduced: boolean) => (reduced ? { initial: { opacity: 0 }, animate: { opacity: 1 } } : { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.32 } });

export function LearningCurve({ points, reduced }: { points: Array<{ i: number; mae: number }>; reduced: boolean }) {
  const W = 340;
  const H = 150;
  const pad = { l: 30, r: 8, t: 10, b: 22 };
  if (points.length < 2) return <p className="chart__empty">The curve appears after about 20 uniformly sampled first looks (Random mode cards and Adaptive probes).</p>;
  const maxY = Math.max(3, Math.ceil(Math.max(...points.map((p) => p.mae))));
  const maxX = points[points.length - 1].i;
  const minX = points[0].i;
  const x = (i: number) => pad.l + ((i - minX) / Math.max(1, maxX - minX)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / maxY) * (H - pad.t - pad.b);
  const d = points.map((p, k) => `${k === 0 ? 'M' : 'L'}${x(p.i).toFixed(1)},${y(p.mae).toFixed(1)}`).join('');
  const area = `${d}L${x(maxX).toFixed(1)},${y(0)}L${x(minX).toFixed(1)},${y(0)}Z`;
  const last = points[points.length - 1];
  return (
    <m.svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Learning curve: rolling first-look error is ${last.mae.toFixed(2)} steps after ${last.i} first looks`} {...enter(reduced)}>
      {Array.from({ length: maxY + 1 }, (_, v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} className="chart__grid" />
          <text x={pad.l - 6} y={y(v) + 4} className="chart__tick" textAnchor="end">
            {v}
          </text>
        </g>
      ))}
      <path d={area} className="chart__area" />
      <path d={d} className="chart__line" />
      <circle cx={x(last.i)} cy={y(last.mae)} r={4} className="chart__dot" />
      <text x={pad.l} y={H - 4} className="chart__tick">
        first look #{minX}
      </text>
      <text x={W - pad.r} y={H - 4} className="chart__tick" textAnchor="end">
        #{maxX}
      </text>
    </m.svg>
  );
}

export function CalibrationPlot({ bins, reduced }: { bins: Array<{ actual: number; n: number; meanUser: number | null }>; reduced: boolean }) {
  const S = 300;
  const pad = 26;
  const cell = (S - pad - 6) / 13;
  const c = (g: number) => pad + (g + 0.5) * cell;
  const yy = (g: number) => S - pad - (g + 0.5) * cell;
  const maxN = Math.max(1, ...bins.map((b) => b.n));
  const shown = bins.filter((b) => b.meanUser !== null);
  return (
    <m.svg className="chart chart--square" viewBox={`0 0 ${S} ${S}`} role="img" aria-label="Calibration plot: your average grade for each 17Lands grade, against the diagonal" {...enter(reduced)}>
      <line x1={c(0)} y1={yy(0)} x2={c(12)} y2={yy(12)} className="chart__diag" />
      {GRADES.map((g, i) =>
        i % 3 === 0 || i === 12 ? (
          <g key={g}>
            <text x={c(i)} y={S - 8} textAnchor="middle" className="chart__tick">
              {gradeLabel(i)}
            </text>
            <text x={pad - 6} y={yy(i) + 4} textAnchor="end" className="chart__tick">
              {gradeLabel(i)}
            </text>
          </g>
        ) : null,
      )}
      {shown.length > 1 && <path d={shown.map((b, k) => `${k === 0 ? 'M' : 'L'}${c(b.actual)},${yy(b.meanUser as number)}`).join('')} className="chart__line chart__line--thin" />}
      {shown.map((b) => (
        <circle key={b.actual} cx={c(b.actual)} cy={yy(b.meanUser as number)} r={3 + 6 * Math.sqrt(b.n / maxN)} fill={`var(--g${b.actual})`} className="chart__bubble">
          <title>{`17Lands ${gradeLabel(b.actual)}: your average ${(b.meanUser as number).toFixed(1)} (n=${b.n})`}</title>
        </circle>
      ))}
      <text x={S - 6} y={S - 20} textAnchor="end" className="chart__axis">
        17Lands grade →
      </text>
      <text x={pad + 4} y={14} className="chart__axis">
        ↑ your grade
      </text>
    </m.svg>
  );
}

export function Confusion({ m: matrix, reduced }: { m: number[][]; reduced: boolean }) {
  const S = 320;
  const pad = 28;
  const cell = (S - pad) / 13;
  const max = Math.max(1, ...matrix.flat());
  return (
    <m.svg className="chart chart--square" viewBox={`0 0 ${S} ${S}`} role="img" aria-label="Confusion heatmap: rows are 17Lands grades, columns are your grades" {...enter(reduced)}>
      {matrix.map((row, a) =>
        row.map((v, u) => (
          <rect key={`${a}-${u}`} x={pad + u * cell} y={(12 - a) * cell} width={cell - 1.5} height={cell - 1.5} rx={2} className={a === u ? 'heat heat--diag' : 'heat'} style={{ fillOpacity: v === 0 ? 0.05 : 0.18 + 0.82 * (v / max) }}>
            <title>{`17Lands ${gradeLabel(a)}, you ${gradeLabel(u)}: ${v}`}</title>
          </rect>
        )),
      )}
      {GRADES.map((g, i) =>
        i % 3 === 0 || i === 12 ? (
          <g key={g}>
            <text x={pad + (i + 0.5) * cell} y={S - 6} textAnchor="middle" className="chart__tick">
              {gradeLabel(i)}
            </text>
            <text x={pad - 4} y={(12 - i + 0.5) * cell + 4} textAnchor="end" className="chart__tick">
              {gradeLabel(i)}
            </text>
          </g>
        ) : null,
      )}
    </m.svg>
  );
}
