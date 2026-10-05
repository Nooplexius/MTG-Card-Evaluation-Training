import { getSettings } from '../settings.ts';
import { playSound, type SoundId } from './sound.ts';

/** Motion vocabulary; components apply the token named for their event (see DESIGN.md). */
export type MotionToken = 'press' | 'stamp' | 'deal' | 'slide' | 'fade' | 'flip' | 'zoom' | 'nudge' | 'pulse' | 'none' | 'subtle';

export interface FeedbackSpec {
  sound: SoundId | 'none';
  haptic: number[] | 'none';
  motion: MotionToken;
  /** Continuous input (typing, scrolling, dragging) may stay silent. */
  continuous?: boolean;
}

/** Every user action and its sound, haptic and motion. Audited by tests/unit/feedback.test.ts. */
export const FEEDBACK = {
  'grade.press': { sound: 'tick', haptic: [6], motion: 'press' },
  'grade.commit': { sound: 'tink', haptic: [12], motion: 'stamp' },
  'grade.cancel': { sound: 'cancel', haptic: 'none', motion: 'fade' },
  'reveal.exact': { sound: 'exact', haptic: [10, 40, 18], motion: 'stamp' },
  'reveal.close': { sound: 'close', haptic: [14], motion: 'stamp' },
  'reveal.miss': { sound: 'miss', haptic: [28], motion: 'nudge' },
  'reveal.skip': { sound: 'tick', haptic: 'none', motion: 'fade' },
  'streak.up': { sound: 'exact', haptic: [8, 30, 8], motion: 'pulse' },
  milestone: { sound: 'flourish', haptic: [10, 40, 10, 40, 20], motion: 'pulse' },
  'session.complete': { sound: 'complete', haptic: [12, 50, 24], motion: 'slide' },
  'card.next': { sound: 'deal', haptic: [5], motion: 'deal' },
  'card.skip': { sound: 'back', haptic: [5], motion: 'deal' },
  'card.zoom': { sound: 'zoom', haptic: [5], motion: 'zoom' },
  'card.flip': { sound: 'flip', haptic: [6], motion: 'flip' },
  'card.text': { sound: 'on', haptic: [5], motion: 'fade' },
  'nav.open': { sound: 'slide', haptic: [5], motion: 'slide' },
  'nav.back': { sound: 'back', haptic: [5], motion: 'slide' },
  'toggle.on': { sound: 'on', haptic: [6], motion: 'press' },
  'toggle.off': { sound: 'off', haptic: [6], motion: 'press' },
  'chip.on': { sound: 'on', haptic: [5], motion: 'press' },
  'chip.off': { sound: 'off', haptic: [5], motion: 'press' },
  'action.primary': { sound: 'tink', haptic: [10], motion: 'press' },
  'action.secondary': { sound: 'tick', haptic: [6], motion: 'press' },
  'action.destructive': { sound: 'stamp', haptic: [20], motion: 'press' },
  'filter.apply': { sound: 'tink', haptic: [8], motion: 'fade' },
  'filter.error': { sound: 'error', haptic: [20, 40, 20], motion: 'nudge' },
  'drill.start': { sound: 'flourish', haptic: [10, 30, 10], motion: 'slide' },
  'drill.complete': { sound: 'complete', haptic: [12, 50, 24], motion: 'pulse' },
  'compare.pick': { sound: 'tink', haptic: [10], motion: 'stamp' },
  'compare.right': { sound: 'exact', haptic: [10, 40, 18], motion: 'stamp' },
  'compare.wrong': { sound: 'miss', haptic: [28], motion: 'nudge' },
  'link.open': { sound: 'tick', haptic: [5], motion: 'press' },
  'sort.change': { sound: 'tick', haptic: [5], motion: 'fade' },
  'input.type': { sound: 'none', haptic: 'none', motion: 'none', continuous: true },
  scroll: { sound: 'none', haptic: 'none', motion: 'none', continuous: true },
  drag: { sound: 'none', haptic: 'none', motion: 'subtle', continuous: true },
} as const satisfies Record<string, FeedbackSpec>;

export type FeedbackEvent = keyof typeof FEEDBACK;

const log: Array<{ ev: FeedbackEvent; at: number }> = [];
let count = 0;

/** Fires the sound and haptic for an action and returns its motion token. */
export function feedback(ev: FeedbackEvent, opts: { level?: number } = {}): MotionToken {
  const spec: FeedbackSpec = FEEDBACK[ev];
  if (spec.sound !== 'none') playSound(spec.sound, opts.level ?? 0);
  if (spec.haptic !== 'none' && getSettings().haptics && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(spec.haptic as number[]);
    } catch {
      /* unsupported */
    }
  }
  log.push({ ev, at: performance.now() });
  count++;
  if (log.length > 200) log.shift();
  if (typeof window !== 'undefined') Object.assign(window, { __loupeFeedback: log, __loupeFeedbackCount: count });
  return spec.motion;
}
