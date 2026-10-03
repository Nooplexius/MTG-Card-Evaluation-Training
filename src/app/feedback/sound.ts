import { getSettings } from '../settings.ts';

export type SoundId = 'tick' | 'tink' | 'cancel' | 'exact' | 'close' | 'miss' | 'flourish' | 'slide' | 'back' | 'on' | 'off' | 'error' | 'deal' | 'flip' | 'zoom' | 'stamp' | 'complete';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

/** Creates or resumes the AudioContext; call from a user gesture (iOS needs that). */
export function unlockAudio(): void {
  if (typeof window === 'undefined') return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  if (!ctx) {
    ctx = new AC({ latencyHint: 'interactive' });
    master = ctx.createGain();
    master.connect(ctx.destination);
    const len = Math.floor(ctx.sampleRate * 0.4);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = noise.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') void ctx.resume();
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
  o.connect(g).connect(master);
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
  src.connect(bq).connect(g).connect(master);
  src.start(t0, Math.random() * 0.2, dur + 0.02);
}

/** Bell-like note: a sine with a soft inharmonic partial. */
function bell(t0: number, freq: number, dur: number, gain: number) {
  tone(t0, freq, dur, gain, 'sine');
  tone(t0, freq * 2.76, dur * 0.45, gain * 0.18, 'sine');
  tone(t0, freq * 2, dur * 0.6, gain * 0.12, 'triangle');
}

const PENTATONIC = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

/** Plays a short synthesized sound; `level` raises result chimes by pentatonic steps for streaks. */
export function playSound(id: SoundId, level = 0): void {
  const s = getSettings();
  if (s.muted || s.volume <= 0) return;
  unlockAudio();
  if (!ctx || !master) return;
  master.gain.value = Math.pow(s.volume, 1.6) * 0.9;
  const t = ctx.currentTime + 0.005;
  const shift = Math.pow(2, PENTATONIC[Math.min(PENTATONIC.length - 1, Math.max(0, level))] / 12);
  const v = (x: number) => vary(x, 0.03);
  const gn = (x: number) => vary(x, 0.1);
  switch (id) {
    case 'tick':
      burst(t, 0.022, gn(0.16), 'bandpass', v(2300), 2.2);
      tone(t, v(1750), 0.018, gn(0.04));
      break;
    case 'tink':
      tone(t, v(1568), 0.14, gn(0.09));
      tone(t + 0.004, v(2349), 0.1, gn(0.05));
      break;
    case 'cancel':
      tone(t, v(520), 0.06, gn(0.05), 'triangle', 420);
      break;
    case 'stamp':
      burst(t, 0.05, gn(0.12), 'lowpass', 900, 0.7);
      tone(t, v(196), 0.09, gn(0.12), 'sine', 140);
      break;
    case 'exact':
      [784, 988, 1175].forEach((f, i) => bell(t + i * 0.055, v(f * shift), 0.42, gn(0.11)));
      break;
    case 'close':
      [659, 880].forEach((f, i) => bell(t + i * 0.07, v(f * shift), 0.34, gn(0.09)));
      break;
    case 'miss':
      tone(t, v(150), 0.16, gn(0.18), 'sine', 88);
      burst(t, 0.07, gn(0.05), 'lowpass', 400, 0.5);
      break;
    case 'flourish':
      [1047, 1319, 1568, 2093].forEach((f, i) => bell(t + i * 0.065, v(f), 0.5, gn(0.08)));
      break;
    case 'complete':
      [523, 659, 784, 1047, 1319].forEach((f, i) => bell(t + i * 0.08, v(f), 0.6, gn(0.07)));
      break;
    case 'slide':
      burst(t, 0.09, gn(0.05), 'bandpass', v(700), 1.4, v(1700));
      break;
    case 'back':
      burst(t, 0.08, gn(0.045), 'bandpass', v(1600), 1.4, v(700));
      break;
    case 'on':
      tone(t, v(1320), 0.03, gn(0.06), 'triangle');
      break;
    case 'off':
      tone(t, v(880), 0.03, gn(0.05), 'triangle');
      break;
    case 'error':
      tone(t, v(220), 0.04, gn(0.07), 'square');
      tone(t + 0.07, v(196), 0.05, gn(0.06), 'square');
      break;
    case 'deal':
      burst(t, 0.07, gn(0.05), 'highpass', v(2400), 0.7);
      break;
    case 'flip':
      burst(t, 0.03, gn(0.07), 'bandpass', v(1500), 1.5);
      burst(t + 0.06, 0.03, gn(0.06), 'bandpass', v(1900), 1.5);
      break;
    case 'zoom':
      burst(t, 0.12, gn(0.04), 'bandpass', v(500), 1.2, v(1400));
      break;
  }
}
