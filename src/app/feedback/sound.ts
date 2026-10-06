import { getSettings } from '../settings.ts';

export type SoundId = 'tick' | 'tink' | 'cancel' | 'exact' | 'close' | 'miss' | 'flourish' | 'slide' | 'back' | 'on' | 'off' | 'error' | 'deal' | 'flip' | 'zoom' | 'stamp' | 'complete';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

function create(): AudioContext | null {
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  const c = new AC({ latencyHint: 'interactive' });
  /** Overlapping sounds (a commit, then the reveal chime) never clip. */
  const limiter = c.createDynamicsCompressor();
  limiter.threshold.value = -6;
  limiter.knee.value = 4;
  limiter.ratio.value = 12;
  limiter.attack.value = 0.002;
  limiter.release.value = 0.12;
  limiter.connect(c.destination);
  master = c.createGain();
  master.connect(limiter);
  const len = Math.floor(c.sampleRate * 0.4);
  noise = c.createBuffer(1, len, c.sampleRate);
  const ch = noise.getChannelData(0);
  for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
  return c;
}

/**
 * Creates or resumes the AudioContext. Browsers allow that only inside a user gesture (a tap's release, a click, a
 * key), and iOS also suspends or interrupts it later, so this runs on every such event until audio is running.
 */
export function unlockAudio(): void {
  if (typeof window === 'undefined') return;
  try {
    ctx ??= create();
    if (!ctx || ctx.state === 'running') return;
    // iOS starts output only once a buffer has played inside the gesture.
    const src = ctx.createBufferSource();
    src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    src.connect(ctx.destination);
    src.start(0);
    void ctx.resume().catch(() => undefined);
  } catch {
    /* no usable audio */
  }
}

export function watchAudioUnlock(): void {
  for (const type of ['pointerup', 'touchend', 'click', 'keydown']) window.addEventListener(type, unlockAudio, { capture: true, passive: true });
}

const vary = (x: number, amt: number) => x * (1 + (Math.random() - 0.5) * 2 * amt);

function tone(t0: number, freq: number, dur: number, gain: number, type: OscillatorType = 'sine', endFreq?: number) {
  if (!ctx || !master) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(endFreq, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function burst(t0: number, dur: number, gain: number, filter: BiquadFilterType, f0: number, q = 1, f1?: number) {
  if (!ctx || !master || !noise) return;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const bq = ctx.createBiquadFilter();
  bq.type = filter;
  bq.frequency.setValueAtTime(f0, t0);
  if (f1) bq.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
  bq.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bq);
  bq.connect(g);
  g.connect(master);
  src.start(t0, Math.random() * 0.2, dur + 0.02);
}

/** Bell-like note: a sine with a soft inharmonic partial. */
function bell(t0: number, freq: number, dur: number, gain: number) {
  tone(t0, freq, dur, gain, 'sine');
  tone(t0, freq * 2.76, dur * 0.45, gain * 0.18, 'sine');
  tone(t0, freq * 2, dur * 0.6, gain * 0.12, 'triangle');
}

const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

/**
 * Plays a short synthesized sound; `level` raises result chimes by pentatonic steps for streaks. Levels are set for
 * phone speakers, which reproduce little below 300 Hz, so low sounds carry their weight in the midrange.
 */
export function playSound(id: SoundId, level = 0): void {
  const s = getSettings();
  if (s.muted || s.volume <= 0) return;
  unlockAudio();
  if (!ctx || !master) return;
  master.gain.value = Math.pow(s.volume, 1.6) * 2;
  const t = ctx.currentTime + 0.005;
  const shift = Math.pow(2, PENTATONIC[Math.min(PENTATONIC.length - 1, Math.max(0, level))] / 12);
  const v = (x: number) => vary(x, 0.03);
  const gn = (x: number) => vary(x, 0.1);
  switch (id) {
    case 'tick':
      burst(t, 0.028, gn(0.3), 'bandpass', v(2300), 2.2);
      tone(t, v(1750), 0.022, gn(0.12));
      break;
    case 'tink':
      tone(t, v(1568), 0.14, gn(0.18));
      tone(t + 0.004, v(2349), 0.1, gn(0.1));
      break;
    case 'cancel':
      tone(t, v(520), 0.07, gn(0.12), 'triangle', 420);
      break;
    case 'stamp':
      burst(t, 0.05, gn(0.22), 'lowpass', 1200, 0.7);
      tone(t, v(392), 0.09, gn(0.2), 'triangle', 262);
      break;
    case 'exact':
      [784, 988, 1175].forEach((f, i) => bell(t + i * 0.055, v(f * shift), 0.42, gn(0.2)));
      break;
    case 'close':
      [659, 880].forEach((f, i) => bell(t + i * 0.07, v(f * shift), 0.34, gn(0.17)));
      break;
    case 'miss':
      tone(t, v(330), 0.18, gn(0.22), 'triangle', 196);
      tone(t, v(165), 0.18, gn(0.12), 'sine', 98);
      burst(t, 0.07, gn(0.1), 'lowpass', 700, 0.5);
      break;
    case 'flourish':
      [1047, 1319, 1568, 2093].forEach((f, i) => bell(t + i * 0.065, v(f), 0.5, gn(0.15)));
      break;
    case 'complete':
      [523, 659, 784, 1047, 1319].forEach((f, i) => bell(t + i * 0.08, v(f), 0.6, gn(0.13)));
      break;
    case 'slide':
      burst(t, 0.09, gn(0.14), 'bandpass', v(700), 1.4, v(1700));
      break;
    case 'back':
      burst(t, 0.08, gn(0.13), 'bandpass', v(1600), 1.4, v(700));
      break;
    case 'on':
      tone(t, v(1320), 0.035, gn(0.14), 'triangle');
      break;
    case 'off':
      tone(t, v(880), 0.035, gn(0.12), 'triangle');
      break;
    case 'error':
      tone(t, v(330), 0.045, gn(0.1), 'square');
      tone(t + 0.07, v(294), 0.055, gn(0.09), 'square');
      break;
    case 'deal':
      burst(t, 0.07, gn(0.16), 'highpass', v(2400), 0.7);
      break;
    case 'flip':
      burst(t, 0.03, gn(0.16), 'bandpass', v(1500), 1.5);
      burst(t + 0.06, 0.03, gn(0.14), 'bandpass', v(1900), 1.5);
      break;
    case 'zoom':
      burst(t, 0.12, gn(0.12), 'bandpass', v(500), 1.2, v(1400));
      break;
  }
}
