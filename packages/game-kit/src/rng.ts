// Seeded RNG (Fort Frenzy SPEC §15.3): named streams derived from (seed, label), so one stream's use
// never shifts another's. FNV-1a hashes (seed, label) into sfc32's 128-bit state. Pure: no clock,
// no Math.random, identical sequences on every JS engine (integer math only).

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number;
  /** Uniform integer in [lo, hi], both inclusive (bounds are floored; swapped if hi < lo). */
  int(lo: number, hi: number): number;
  /** A uniform element of `xs`. Throws on an empty array. */
  pick<T>(xs: readonly T[]): T;
}

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

/** 32-bit FNV-1a over the UTF-16 code units of `text`. */
export function fnv1a(text: string, hash: number = FNV_OFFSET): number {
  let h = hash >>> 0;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, FNV_PRIME) >>> 0;
  }
  return h;
}

/** sfc32 over four 32-bit words; returns uint32s. */
function sfc32(a: number, b: number, c: number, d: number): () => number {
  return () => {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return t >>> 0;
  };
}

/** An independent stream for (seed, label). The same pair always yields the same sequence. */
export function rngStream(seed: number, label: string): Rng {
  const key = `${seed}\u0000${label}`;
  const words = [0, 1, 2, 3].map((i) => fnv1a(key, fnv1a(String(i))));
  const u32 = sfc32(words[0]!, words[1]!, words[2]!, words[3]!);
  for (let i = 0; i < 12; i++) u32(); // warm up: mixes the hashed state
  const next = () => u32() / 4294967296;
  const int = (lo: number, hi: number): number => {
    let a = Math.floor(lo);
    let b = Math.floor(hi);
    if (b < a) [a, b] = [b, a];
    return a + Math.floor(next() * (b - a + 1));
  };
  return {
    next,
    int,
    pick<T>(xs: readonly T[]): T {
      if (xs.length === 0) throw new RangeError('pick: empty array');
      return xs[int(0, xs.length - 1)]!;
    },
  };
}
