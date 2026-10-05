import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FEEDBACK, type FeedbackSpec } from '../../src/app/feedback/feedback.ts';
import { ROOT } from '../helpers/fixtures.ts';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.tsx') ? [p] : [];
  });
}

describe('feedback coverage', () => {
  it('maps every discrete action to a sound, a haptic and a motion token; continuous input is explicitly quiet', () => {
    for (const [name, spec] of Object.entries(FEEDBACK) as Array<[string, FeedbackSpec]>) {
      expect(spec.motion, name).toBeTruthy();
      if (spec.continuous) {
        expect(spec.sound, name).toBe('none');
        continue;
      }
      expect(spec.sound, `${name} needs a sound`).not.toBe('none');
      expect(spec.motion, `${name} needs motion`).not.toBe('none');
      expect(spec.haptic === 'none' || Array.isArray(spec.haptic), name).toBe(true);
    }
  });

  it('routes every button and link through the feedback layer', () => {
    const app = join(ROOT, 'src/app');
    const offenders: string[] = [];
    for (const f of files(app)) {
      const rel = f.slice(app.length + 1);
      const src = readFileSync(f, 'utf8');
      if (rel === 'ui/Tap.tsx') continue;
      if (/<a[\s>]/.test(src)) offenders.push(`${rel}: raw <a>, use TapLink`);
      if (/<button[\s>]/.test(src)) {
        if (rel === 'practice/GradePad.tsx') {
          expect(src).toContain("feedback('grade.press')");
          expect(src).toContain("feedback('grade.commit')");
          expect(src).toContain("feedback('grade.cancel')");
        } else if (rel === 'practice/CardFace.tsx') {
          expect(src).toContain('onClick={onTap}');
        } else offenders.push(`${rel}: raw <button>, use Tap`);
      }
    }
    expect(offenders).toEqual([]);
    const practice = readFileSync(join(app, 'practice/PracticeScreen.tsx'), 'utf8');
    expect(practice).toMatch(/feedback\('card\.zoom'\);\s*setZoom/);
  });
});
