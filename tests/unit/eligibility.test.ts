import { describe, expect, it } from 'vitest';
import { eligibility } from '../../pipeline/eligibility.ts';
import { crossCheckStandard, standardSetCodes } from '../../pipeline/inputs/standard.ts';
import { standardToLimited } from '../../pipeline/limitedSets.ts';
import { fixtures } from '../helpers/fixtures.ts';

const ON = { minDaysLive: 7, respect17LandsEmbargo: true, embargoDays: 13 };
const OFF = { ...ON, respect17LandsEmbargo: false };
const FRA = '2026-09-29';

describe('set eligibility', () => {
  it('holds FRA back on 2026-10-03 under the embargo', () => {
    expect(eligibility(FRA, '2026-10-03', ON)).toEqual({ eligible: false, eligibleFrom: '2026-10-12', reason: 'embargo' });
  });
  it('includes FRA from 2026-10-12 (Arena release + 13 days, the second Monday)', () => {
    expect(eligibility(FRA, '2026-10-11', ON).eligible).toBe(false);
    expect(eligibility(FRA, '2026-10-12', ON).eligible).toBe(true);
    expect(new Date('2026-10-12T00:00:00Z').getUTCDay()).toBe(1);
  });
  it('includes FRA from 2026-10-06 with the embargo off (7-day rule)', () => {
    expect(eligibility(FRA, '2026-10-05', OFF)).toEqual({ eligible: false, eligibleFrom: '2026-10-06', reason: 'min-days-live' });
    expect(eligibility(FRA, '2026-10-06', OFF).eligible).toBe(true);
  });
  it('holds back a set without a release date', () => {
    expect(eligibility(null, '2026-10-03', ON)).toEqual({ eligible: false, eligibleFrom: null, reason: 'missing-release-date' });
  });
});

describe('Standard rule', () => {
  const { wis, cards, scrySets, setsCfg } = fixtures();
  it('lists sets with enterDate ≤ today and no exitDate on or before today', () => {
    const on = standardSetCodes(wis, '2026-10-03');
    expect(on).toEqual(['WOE', 'LCI', 'MKM', 'OTJ', 'BIG', 'BLB', 'DSK', 'FDN', 'DFT', 'TDM', 'FIN', 'EOE', 'SPM', 'OM1', 'TLA', 'ECL', 'TMT', 'SOS', 'MSH', 'HOB', 'FRA']);
    expect(standardSetCodes(wis, '2026-09-24')).not.toContain('FRA');
    expect(standardSetCodes(wis, '2025-07-24')).toContain('MOM');
    expect(standardSetCodes(wis, '2025-07-25')).not.toContain('MOM');
  });
  it('ignores future sets with null codes and sets with past exit dates', () => {
    const fake = { sets: [{ name: 'Future', code: null, enterDate: { exact: '2026-01-01' }, exitDate: { exact: null } }, { name: 'Gone', code: 'OLD', enterDate: '2020-01-01', exitDate: '2026-10-03' }] };
    expect(standardSetCodes(fake as never, '2026-10-03')).toEqual([]);
  });
  it('cross-checks with Scryfall legality of the set’s own booster printings', () => {
    const checks = crossCheckStandard(['TLA', 'OM1', 'TMT', 'FRA'], cards);
    expect(checks.every((c) => c.agrees)).toBe(true);
    const tle = crossCheckStandard(['TLE'], cards)[0];
    expect(tle.agrees).toBe(false);
  });
  it('folds BIG into OTJ and SPM into OM1, giving 18 + FRA limited sets', () => {
    const map = standardToLimited(standardSetCodes(wis, '2026-10-03'), setsCfg, scrySets);
    expect([...map.keys()]).toHaveLength(19);
    expect(map.get('OTJ')).toEqual(['OTJ', 'BIG']);
    expect(map.get('OM1')?.sort()).toEqual(['OM1', 'SPM']);
    expect(map.has('SPM')).toBe(false);
    expect(map.has('BIG')).toBe(false);
  });
});
