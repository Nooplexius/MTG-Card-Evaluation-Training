import { describe, expect, it } from 'vitest';
import { bandLowerZ, GRADES, gradeIndexFor, gradeIndexFromZ, gradeName, gradePopulation, seInSteps, winRateSE } from '../../src/lib/grades.ts';
import { normalizeApiRows } from '../../pipeline/exports/normalizeApi.ts';
import { parseExportCsv } from '../../pipeline/exports/parseExport.ts';
import { rowsToExportTable } from '../../pipeline/exports/format.ts';
import { toCsv } from '../../pipeline/exports/csv.ts';
import { ALL_GROUPS } from '../../pipeline/types.ts';
import { fixtures } from '../helpers/fixtures.ts';

describe('17Lands grade formula', () => {
  it('maps every band edge z = (2t − 11)/6 to the band it opens (half-open bands)', () => {
    for (let t = 1; t < GRADES.length; t++) {
      const edge = (2 * t - 11) / 6;
      expect(gradeName(gradeIndexFromZ(edge)), `z=${edge}`).toBe(GRADES[t]);
      expect(gradeName(gradeIndexFromZ(edge - 1e-6)), `just below z=${edge}`).toBe(GRADES[t - 1]);
      expect(bandLowerZ(t)).toBeCloseTo(edge, 12);
    }
  });

  it('documents the bands: C is [−1/6, 1/6), A+ starts at 13/6, F is below −1.5', () => {
    expect(gradeName(gradeIndexFromZ(0))).toBe('C');
    expect(gradeName(gradeIndexFromZ(-1 / 6))).toBe('C');
    expect(gradeName(gradeIndexFromZ(1 / 6))).toBe('C+');
    expect(gradeName(gradeIndexFromZ(13 / 6))).toBe('A+');
    expect(gradeName(gradeIndexFromZ(10))).toBe('A+');
    expect(gradeName(gradeIndexFromZ(-1.5))).toBe('D-');
    expect(gradeName(gradeIndexFromZ(-1.5000001))).toBe('F');
    expect(gradeName(gradeIndexFromZ(-9))).toBe('F');
  });

  it('uses the unweighted mean and population SD and needs 15 graded cards', () => {
    const wrs = Array.from({ length: 14 }, (_, i) => 0.5 + i * 0.01);
    expect(gradePopulation(wrs)).toBeNull();
    const pop = gradePopulation([...wrs, null, undefined, 0.64]);
    expect(pop?.n).toBe(15);
    const xs = [...wrs, 0.64];
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
    expect(pop?.mean).toBeCloseTo(mean, 12);
    expect(pop?.sd).toBeCloseTo(sd, 12);
  });

  it('grades a full-precision fixture and rounded exports differ by at most one step for a few cards', () => {
    const { tla } = fixtures();
    const full = normalizeApiRows(tla).rows;
    const popFull = gradePopulation(full.map((r) => r.gihWr));
    expect(popFull?.n).toBe(295);
    const csv = toCsv(rowsToExportTable(full, ALL_GROUPS));
    const rounded = parseExportCsv(csv).rows;
    const popRounded = gradePopulation(rounded.map((r) => r.gihWr));
    let differ = 0;
    full.forEach((r, i) => {
      if (r.gihWr === null) return;
      const a = gradeIndexFor(r.gihWr, popFull!);
      const b = gradeIndexFor(rounded[i].gihWr as number, popRounded!);
      expect(Math.abs(a - b)).toBeLessThanOrEqual(1);
      if (a !== b) differ++;
    });
    expect(differ).toBeGreaterThan(0);
    expect(differ / 295).toBeLessThan(0.03);
  });

  it('expresses sampling noise in grade steps', () => {
    expect(winRateSE(0.717, 513)).toBeCloseTo(0.0199, 3);
    expect(seInSteps(0.717, 513, 0.04)).toBeCloseTo(1.49, 1);
    expect(seInSteps(0.56, 30000, 0.04)).toBeLessThan(0.25);
  });
});
