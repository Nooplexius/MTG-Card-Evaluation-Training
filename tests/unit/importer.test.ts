import { describe, expect, it } from 'vitest';
import { parseCsv, toCsv } from '../../pipeline/exports/csv.ts';
import { rowsToExportTable } from '../../pipeline/exports/format.ts';
import { normalizeApiRows } from '../../pipeline/exports/normalizeApi.ts';
import { dateFromFilename, ExportParseError, formatOverrideFromFilename, parseExportCsv } from '../../pipeline/exports/parseExport.ts';
import { ALL_GROUPS } from '../../pipeline/types.ts';
import { fixtures } from '../helpers/fixtures.ts';

const HEADER = '"Name","Color","Rarity","# Seen","ALSA","# Picked","ATA","# GP","% GP","GP WR","# OH","OH WR","# GD","GD WR","# GIH","GIH WR","# GNS","GNS WR","IIH"';
const AANG = '"Aang\'s Journey","","C","309385","5.66","52231","7.80","209231","61.4%","54.3%","38914","54.5%","55182","56.2%","94096","55.5%","113355","53.1%","2.4pp"';

describe('CSV export parser', () => {
  it('parses the site format: BOM, every field quoted, % and pp values', () => {
    const p = parseExportCsv(`\ufeff${HEADER}\n${AANG}\n`);
    expect(p.groups).toEqual(ALL_GROUPS);
    expect(p.rows).toHaveLength(1);
    const r = p.rows[0];
    expect(r).toMatchObject({ name: "Aang's Journey", color: '', rarity: 'C', seen: 309385, alsa: 5.66, picked: 52231, ata: 7.8, gp: 209231, gih: 94096 });
    expect(r.gpPct).toBeCloseTo(0.614, 10);
    expect(r.gihWr).toBeCloseTo(0.555, 10);
    expect(r.iih).toBeCloseTo(0.024, 10);
    expect(r.gnsWr).toBeCloseTo(0.531, 10);
  });

  it('treats blank win rates as hidden (fewer than 500 games in hand) and handles quotes and commas in names', () => {
    const row = '"Borrowed ""Time"", Again","WU","M","100","1.50","40","2.00","300","50.0%","","50","","60","","110","","190","45.0%",""';
    const p = parseExportCsv(`${HEADER}\r\n${row}\r\n`);
    expect(p.rows[0].name).toBe('Borrowed "Time", Again');
    expect(p.rows[0].gihWr).toBeNull();
    expect(p.rows[0].gih).toBe(110);
    expect(p.rows[0].iih).toBeNull();
    expect(p.rows[0].gpWr).toBeNull();
  });

  it('degrades gracefully when optional column groups are missing (the phone default view)', () => {
    const text = '"Name","Color","Rarity","# GIH","GIH WR","IIH"\n"Card A","R","U","5000","57.1%","1.2pp"';
    const p = parseExportCsv(text);
    expect(p.groups).toEqual(['everInHand', 'improvement']);
    expect(p.rows[0]).toMatchObject({ name: 'Card A', gih: 5000 });
    expect(p.rows[0].alsa).toBeUndefined();
  });

  it('refuses exports without the required Name, # GIH and GIH WR columns, with a clear message', () => {
    const phone = '"Name","Color","Rarity","# Seen","ALSA","# Picked","ATA","IIH"\n"Card A","R","U","10","3.00","5","4.00","1.0pp"';
    expect(() => parseExportCsv(phone)).toThrow(ExportParseError);
    expect(() => parseExportCsv(phone)).toThrow(/# GIH.*GIH WR.*Ever in Hand/);
  });

  it('reads the export date from card-ratings-YYYY-MM-DD names, including " (1)" duplicates', () => {
    expect(dateFromFilename('card-ratings-2026-10-03.csv')).toBe('2026-10-03');
    expect(dateFromFilename('card-ratings-2026-10-03 (1).csv')).toBe('2026-10-03');
    expect(dateFromFilename('card-ratings-2026-02-30.csv')).toBeNull();
    expect(dateFromFilename('tla.csv')).toBeNull();
  });

  it('accepts a format override only as an exact 17Lands event name', () => {
    const events = fixtures().setsCfg.eventTypes;
    expect(formatOverrideFromFilename('card-ratings-2026-10-03 QuickDraft.csv', events)).toBe('QuickDraft');
    expect(formatOverrideFromFilename('card-ratings-2026-10-03_PickTwoDraft (2).csv', events)).toBe('PickTwoDraft');
    expect(formatOverrideFromFilename('card-ratings-2026-10-03 quickdraft.csv', events)).toBeNull();
    expect(formatOverrideFromFilename('card-ratings-2026-10-03 Quick.csv', events)).toBeNull();
    expect(formatOverrideFromFilename('card-ratings-2026-10-03 ArenaDirect_Sealed.csv', events)).toBe('ArenaDirect_Sealed');
    expect(formatOverrideFromFilename('card-ratings-2026-10-03 PremierDraftX.csv', events)).toBeNull();
  });

  it('round-trips API rows through the export format to the same schema', () => {
    const { tla } = fixtures();
    const api = normalizeApiRows(tla).rows;
    const csv = toCsv(rowsToExportTable(api, ALL_GROUPS));
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(parseCsv(csv)[0].join(',')).toBe(HEADER.replace(/"/g, ''));
    const back = parseExportCsv(csv).rows;
    expect(back).toHaveLength(api.length);
    const keys = Object.keys(back[0]).sort();
    expect(Object.keys(api[0]).filter((k) => k !== 'mtgaId').sort()).toEqual(keys);
    back.forEach((b, i) => {
      expect(b.name).toBe(api[i].name);
      expect(b.rarity).toBe(api[i].rarity);
      if (api[i].gihWr !== null) expect(Math.abs((b.gihWr as number) - (api[i].gihWr as number))).toBeLessThanOrEqual(0.0005 + 1e-12);
    });
  });
});

describe('API normalizer', () => {
  it('maps API fields to the export schema and keeps mtga_id for the join', () => {
    const { tla, om1 } = fixtures();
    const { rows, missingFields } = normalizeApiRows(tla);
    expect(missingFields).toEqual([]);
    expect(rows).toHaveLength(342);
    const aang = rows.find((r) => r.name === "Aang's Journey");
    expect(aang).toMatchObject({ mtgaId: 97274, rarity: 'C', color: '', gih: 94096, seen: 309385 });
    expect(aang?.gihWr).toBeCloseTo(0.55519895, 8);
    expect(aang?.iih).toBeCloseTo(0.02407108, 8);
    expect(normalizeApiRows(om1).rows.find((r) => r.name === 'Peter Parker')).toBeTruthy();
  });

  it('reports missing required fields', () => {
    const { missingFields } = normalizeApiRows({ data: [{ name: 'X', ever_drawn_game_count: 3 }] });
    expect(missingFields).toEqual(['ever_drawn_win_rate']);
  });
});
