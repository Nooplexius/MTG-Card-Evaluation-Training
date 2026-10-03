export const GRADES = ['F', 'D-', 'D', 'D+', 'C-', 'C', 'C+', 'B-', 'B', 'B+', 'A-', 'A', 'A+'] as const;
export type Grade = (typeof GRADES)[number];
export type GradeIndex = number;

export const GRADE_COUNT = GRADES.length;
export const C_INDEX = 5;
export const MIN_GRADED_CARDS = 15;

/** 17Lands' constant: t = floor(3 * (z + HD)). */
const HD = 2 - 1 / 6;
/**
 * The site's literal float expression puts exact band edges such as z = -1.5 or z = 0.5 one band low.
 * The tolerance makes edges follow the documented half-open bands; it only matters within ~3e-10 of an edge.
 */
const EDGE_TOLERANCE = 1e-9;

export interface GradePopulation {
  n: number;
  mean: number;
  sd: number;
}

/** Unweighted mean and population SD (divide by n) over cards with a GIH WR. Null below the 15-card minimum. */
export function gradePopulation(winRates: ReadonlyArray<number | null | undefined>, minCards = MIN_GRADED_CARDS): GradePopulation | null {
  const xs = winRates.filter((x): x is number => typeof x === 'number' && Number.isFinite(x));
  const n = xs.length;
  if (n < minCards || n === 0) return null;
  let sum = 0;
  for (const x of xs) sum += x;
  const mean = sum / n;
  let ss = 0;
  for (const x of xs) ss += (x - mean) * (x - mean);
  const sd = Math.sqrt(ss / n);
  if (!(sd > 0)) return null;
  return { n, mean, sd };
}

export function zScore(winRate: number, pop: GradePopulation): number {
  return (winRate - pop.mean) / pop.sd;
}

export function gradeIndexFromZ(z: number): GradeIndex {
  const t = Math.floor(3 * (z + HD) + EDGE_TOLERANCE);
  if (t < 0) return 0;
  if (t >= GRADE_COUNT - 1) return GRADE_COUNT - 1;
  return t;
}

export function gradeIndexFor(winRate: number, pop: GradePopulation): GradeIndex {
  return gradeIndexFromZ(zScore(winRate, pop));
}

export function gradeName(index: GradeIndex): Grade {
  return GRADES[Math.max(0, Math.min(GRADE_COUNT - 1, Math.round(index)))];
}

export function gradeIndexOf(grade: string): GradeIndex {
  const i = (GRADES as readonly string[]).indexOf(grade.trim().toUpperCase());
  if (i < 0) throw new Error(`Unknown grade "${grade}"`);
  return i;
}

/** Lower z edge of a grade band; F has no lower edge. */
export function bandLowerZ(index: GradeIndex): number {
  return index === 0 ? -Infinity : (2 * index - 11) / 6;
}

/** Standard error of a win rate in win-rate units. */
export function winRateSE(p: number, gamesInHand: number): number {
  if (!(gamesInHand > 0)) return Infinity;
  return Math.sqrt((p * (1 - p)) / gamesInHand);
}

/** Standard error expressed in grade steps (one step = sd / 3). */
export function seInSteps(p: number, gamesInHand: number, sd: number): number {
  return (3 * winRateSE(p, gamesInHand)) / sd;
}

/** Uncertainty is shown on reveal at or above this many steps. */
export const UNCERTAINTY_SHOW_STEPS = 0.75;

/** |error| <= 1 step counts as correct for streaks and scheduling. */
export const CORRECT_WITHIN_STEPS = 1;

export function signedError(userIndex: GradeIndex, actualIndex: GradeIndex): number {
  return userIndex - actualIndex;
}

export function isCorrect(userIndex: GradeIndex, actualIndex: GradeIndex): boolean {
  return Math.abs(userIndex - actualIndex) <= CORRECT_WITHIN_STEPS;
}

/** Letter family for display grouping: A, B, C, D or F. */
export function gradeLetter(index: GradeIndex): 'A' | 'B' | 'C' | 'D' | 'F' {
  return gradeName(index)[0] as 'A' | 'B' | 'C' | 'D' | 'F';
}
