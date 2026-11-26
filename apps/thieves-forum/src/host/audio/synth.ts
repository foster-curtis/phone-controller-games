// Synthesized placeholder sounds for the forum (SPEC §6.20, §12.8; BUILD_PLAN TF11): each recipe renders
// mono samples in code, so the game is audible before the licensed files arrive (TF19). Wordless and
// musical-free by construction (§6.20 period rule). Keys follow `SfxCue` and the §9 step 7 file list.
import type { SynthFn, SynthSet } from '../../shared/audio';
import type { SfxCue } from '../../shared/sfx';

const TAU = Math.PI * 2;

function alloc(rate: number, seconds: number): Float32Array {
  return new Float32Array(Math.floor(rate * seconds));
}

/** Add a decaying partial. `f1` glides from `f0` over the note; `vib` adds a slow wobble (Hz, depth). */
function tone(
  out: Float32Array,
  rate: number,
  at: number,
  dur: number,
  f0: number,
  amp: number,
  o: { f1?: number; vib?: [number, number]; decay?: number; wave?: 'sine' | 'saw' } = {},
): void {
  const start = Math.floor(at * rate);
  const n = Math.floor(dur * rate);
  const f1 = o.f1 ?? f0;
  const decay = o.decay ?? 4;
  let phase = 0;
  for (let i = 0; i < n && start + i < out.length; i++) {
    const t = i / n;
    let f = f0 + (f1 - f0) * t;
    if (o.vib) f *= 1 + o.vib[1] * Math.sin((TAU * o.vib[0] * i) / rate);
    phase += (TAU * f) / rate;
    const env = Math.min(1, i / (rate * 0.008)) * Math.exp(-decay * t);
    const s = o.wave === 'saw' ? 2 * ((phase / TAU) % 1) - 1 : Math.sin(phase);
    out[start + i]! += s * amp * env;
  }
}

/** Add low-passed noise (`cut` 0..1: one-pole coefficient, smaller is darker), shaped by `env(t)`. */
function noise(
  out: Float32Array,
  rate: number,
  rng: () => number,
  at: number,
  dur: number,
  amp: number,
  cut: number,
  env: (t: number) => number,
): void {
  const start = Math.floor(at * rate);
  const n = Math.floor(dur * rate);
  let y = 0;
  for (let i = 0; i < n && start + i < out.length; i++) {
    y += cut * ((rng() * 2 - 1) * 1 - y);
    out[start + i]! += y * amp * env(i / n);
  }
}

const decay = (k: number) => (t: number) => Math.exp(-k * t);

function clink(rate: number, at: number, out: Float32Array, f = 2400): void {
  tone(out, rate, at, 0.25, f, 0.22, { decay: 9 });
  tone(out, rate, at, 0.2, f * 1.51, 0.12, { decay: 11 });
}

// --- cues (§6.20 sound effects) ---------------------------------------------------------------

const coinClink: SynthFn = (rate) => {
  const out = alloc(rate, 0.4);
  clink(rate, 0, out);
  clink(rate, 0.07, out, 3100);
  return out;
};

const glanceSwoosh: SynthFn = (rate, rng) => {
  const out = alloc(rate, 0.45);
  noise(out, rate, rng, 0, 0.45, 1.4, 0.18, (t) => Math.sin(Math.PI * t) ** 2);
  return out;
};

const thiefShout: SynthFn = (rate) => {
  // A rough, wordless shout: falling saw with a wobble.
  const out = alloc(rate, 0.7);
  tone(out, rate, 0, 0.7, 330, 0.3, { f1: 220, vib: [7, 0.03], decay: 2.2, wave: 'saw' });
  tone(out, rate, 0, 0.7, 660, 0.12, { f1: 440, vib: [7, 0.03], decay: 2.5, wave: 'saw' });
  return out;
};

const guardWhistle: SynthFn = (rate) => {
  const out = alloc(rate, 0.6);
  tone(out, rate, 0, 0.55, 2700, 0.28, { vib: [32, 0.012], decay: 1.2 });
  return out;
};

const gateCreak: SynthFn = (rate, rng) => {
  const out = alloc(rate, 1.2);
  tone(out, rate, 0, 1.1, 90, 0.2, { f1: 150, vib: [11, 0.12], decay: 1.5, wave: 'saw' });
  noise(out, rate, rng, 0, 1.1, 0.5, 0.05, (t) => Math.sin(Math.PI * t));
  return out;
};

const stocksClank: SynthFn = (rate, rng) => {
  const out = alloc(rate, 0.7);
  for (const f of [310, 487, 733, 1190]) tone(out, rate, 0, 0.6, f, 0.16, { decay: 6 });
  noise(out, rate, rng, 0, 0.06, 0.8, 0.5, decay(8));
  return out;
};

const roundBell: SynthFn = (rate) => {
  const out = alloc(rate, 1.6);
  for (const [m, a] of [
    [1, 0.3],
    [2.76, 0.16],
    [5.4, 0.08],
  ] as const)
    tone(out, rate, 0, 1.5, 660 * m, a, { decay: 3.2 });
  return out;
};

const revealPop: SynthFn = (rate) => {
  const out = alloc(rate, 0.18);
  tone(out, rate, 0, 0.16, 720, 0.4, { f1: 260, decay: 6 });
  return out;
};

const fanfare: SynthFn = (rate) => {
  // Three rising brassy notes then a held chord; no melody to speak of (§6.20: no music).
  const out = alloc(rate, 1.6);
  for (const [at, f] of [
    [0, 392],
    [0.18, 494],
    [0.36, 587],
  ] as const)
    tone(out, rate, at, 0.3, f, 0.16, { decay: 3, wave: 'saw' });
  for (const f of [392, 494, 587, 784])
    tone(out, rate, 0.55, 1, f, 0.1, { decay: 2.5, wave: 'saw' });
  return out;
};

const firework: SynthFn = (rate, rng) => {
  const out = alloc(rate, 1.3);
  tone(out, rate, 0, 0.35, 900, 0.1, { f1: 2200, decay: 1 });
  noise(out, rate, rng, 0.35, 0.9, 1.3, 0.6, decay(5));
  for (let k = 0; k < 8; k++) noise(out, rate, rng, 0.4 + rng() * 0.7, 0.02, 1.2, 0.7, decay(3));
  return out;
};

// --- ambience (§6.20 bed + one-shots) -------------------------------------------------------------

/** Dark crowd murmur: low-passed noise with slow swells. Seamless-ish; the engine crossfades the loop. */
const bed: SynthFn = (rate, rng) => {
  const out = alloc(rate, 8);
  noise(out, rate, rng, 0, 8, 2.2, 0.035, () => 1);
  for (let i = 0; i < out.length; i++)
    out[i]! *= 0.7 + 0.3 * Math.sin((TAU * 0.35 * i) / rate) * Math.sin((TAU * 0.11 * i) / rate);
  return out;
};

/** A wordless vendor call: a swooping vowel-like tone. */
const vendorCall =
  (base: number): SynthFn =>
  (rate) => {
    const out = alloc(rate, 0.9);
    tone(out, rate, 0, 0.85, base, 0.2, {
      f1: base * 0.8,
      vib: [5, 0.04],
      decay: 1.8,
      wave: 'saw',
    });
    tone(out, rate, 0.05, 0.8, base * 2, 0.06, { f1: base * 1.6, vib: [5, 0.04], decay: 2 });
    return out;
  };

const potteryClink =
  (f: number): SynthFn =>
  (rate) => {
    const out = alloc(rate, 0.5);
    clink(rate, 0, out, f);
    return out;
  };

const coinsCounted =
  (n: number): SynthFn =>
  (rate, rng) => {
    const out = alloc(rate, 0.3 + n * 0.14);
    for (let i = 0; i < n; i++) clink(rate, i * (0.12 + rng() * 0.04), out, 2000 + rng() * 900);
    return out;
  };

const cartWheel: SynthFn = (rate, rng) => {
  const out = alloc(rate, 2.2);
  noise(out, rate, rng, 0, 2.2, 0.7, 0.06, (t) => Math.sin(Math.PI * t));
  tone(out, rate, 0, 2.2, 140, 0.05, { f1: 180, vib: [9, 0.08], decay: 0.5, wave: 'saw' });
  return out;
};

const donkey: SynthFn = (rate) => {
  const out = alloc(rate, 1.6);
  tone(out, rate, 0, 0.7, 380, 0.2, { f1: 760, vib: [18, 0.04], decay: 1, wave: 'saw' });
  tone(out, rate, 0.7, 0.8, 700, 0.2, { f1: 320, vib: [18, 0.04], decay: 1.4, wave: 'saw' });
  return out;
};

const dogDistant: SynthFn = (rate) => {
  const out = alloc(rate, 1);
  for (const at of [0, 0.35])
    tone(out, rate, at, 0.18, 520, 0.14, { f1: 380, decay: 5, wave: 'saw' });
  return out;
};

const fountain: SynthFn = (rate, rng) => {
  const out = alloc(rate, 3);
  noise(out, rate, rng, 0, 3, 1.6, 0.4, (t) => 0.5 + 0.5 * Math.sin(TAU * 6 * t) ** 2);
  for (let i = 0; i < out.length; i++)
    out[i]! *= Math.min(1, i / (rate * 0.4), (out.length - i) / (rate * 0.4));
  return out;
};

/** Order matches `FORUM_ONE_SHOT_FILES` in `map.ts`. */
export const FORUM_SYNTH: SynthSet<SfxCue> = {
  bed,
  oneShots: [
    vendorCall(300),
    vendorCall(250),
    vendorCall(340),
    potteryClink(1800),
    potteryClink(2200),
    coinsCounted(4),
    coinsCounted(6),
    cartWheel,
    donkey,
    dogDistant,
    fountain,
  ],
  cues: {
    coinClink,
    glanceSwoosh,
    thiefShout,
    guardWhistle,
    gateCreak,
    stocksClank,
    roundBell,
    revealPop,
    fanfare,
    firework,
  },
};
