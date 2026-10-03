const DAY_MS = 86_400_000;

export function dayNumber(date: string): number {
  const t = Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t)) throw new Error(`Bad date "${date}"`);
  return Math.floor(t / DAY_MS);
}

export function addDays(date: string, days: number): string {
  return new Date((dayNumber(date) + days) * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return dayNumber(to) - dayNumber(from);
}

export function todayUtc(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export interface EligibilityRules {
  minDaysLive: number;
  respect17LandsEmbargo: boolean;
  embargoDays: number;
}

export type HoldReason = 'missing-release-date' | 'embargo' | 'min-days-live';

export interface Eligibility {
  eligible: boolean;
  /** First UTC date the set may appear. */
  eligibleFrom: string | null;
  reason: HoldReason | null;
}

/**
 * A set may appear from 00:00 UTC on max(release + minDaysLive, release + embargoDays when the embargo is respected).
 * The embargo follows 17Lands' "12th day it has been released on MTG Arena": Tuesday release + 13 days is the second Monday.
 */
export function eligibility(arenaRelease: string | null, today: string, rules: EligibilityRules): Eligibility {
  if (!arenaRelease) return { eligible: false, eligibleFrom: null, reason: 'missing-release-date' };
  const liveFrom = addDays(arenaRelease, rules.minDaysLive);
  const embargoFrom = rules.respect17LandsEmbargo ? addDays(arenaRelease, rules.embargoDays) : liveFrom;
  const from = dayNumber(embargoFrom) > dayNumber(liveFrom) ? embargoFrom : liveFrom;
  if (dayNumber(today) >= dayNumber(from)) return { eligible: true, eligibleFrom: from, reason: null };
  return { eligible: false, eligibleFrom: from, reason: rules.respect17LandsEmbargo && from === embargoFrom && embargoFrom !== liveFrom ? 'embargo' : 'min-days-live' };
}

/** Embargo alone, used to decide whether the daily fetch may request a set. */
export function embargoPassed(arenaRelease: string | null, today: string, rules: EligibilityRules): boolean {
  if (!arenaRelease) return false;
  if (!rules.respect17LandsEmbargo) return true;
  return dayNumber(today) >= dayNumber(addDays(arenaRelease, rules.embargoDays));
}
