// The bloom's hue-selective threshold (SPEC §15.2, BUILD_PLAN §8 FF3): the band edges the select
// shader in bloom.ts is built from, and the same pick in TS so tests can prove a color never blooms
// (the C3 floor, FF3-fix-2). Pure: no Phaser.
import type { Rgb } from './color';

/** smoothstep edges, all 0–1: hue rises over [h0, h1] and falls over [h2, h3]. */
export interface BloomBand {
  hue: readonly [h0: number, h1: number, h2: number, h3: number];
  sat: readonly [s0: number, s1: number];
  val: readonly [v0: number, v1: number];
}

export const BLOOM_BANDS = {
  /** Amber family: hue 25–54°, saturated, bright. */
  amber: { hue: [0.04, 0.07, 0.14, 0.17], sat: [0.3, 0.45], val: [0.72, 0.85] },
  /** Violet family: hue 238–280°, bright (the hostile core is pale violet). */
  violet: { hue: [0.64, 0.67, 0.77, 0.8], sat: [0.18, 0.28], val: [0.8, 0.92] },
} as const satisfies Record<string, BloomBand>;

/** GLSL smoothstep. */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/** Hue, saturation, value, all 0–1 (hue 0 for grays, as the shader's formula gives). */
export function hsv(c: Rgb): [h: number, s: number, v: number] {
  const [r, g, b] = c.map((x) => x / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  return [h / 6, max > 0 ? d / max : 0, max];
}

const bandWeight = (b: BloomBand, [h, s, v]: [number, number, number]) =>
  smoothstep(b.hue[0], b.hue[1], h) *
  (1 - smoothstep(b.hue[2], b.hue[3], h)) *
  smoothstep(b.sat[0], b.sat[1], s) *
  smoothstep(b.val[0], b.val[1], v);

/** How much of an opaque pixel the select pass keeps: 0 = never blooms, 1 = full bloom. */
export function bloomWeight(c: Rgb): number {
  const p = hsv(c);
  return Math.max(bandWeight(BLOOM_BANDS.amber, p), bandWeight(BLOOM_BANDS.violet, p));
}

/** The band as a GLSL expression over `h` (vec3 hsv), for the select shader. */
export function bandGlsl(b: BloomBand): string {
  const f = (n: number) => n.toFixed(4);
  return (
    `smoothstep(${f(b.hue[0])}, ${f(b.hue[1])}, h.x) * (1.0 - smoothstep(${f(b.hue[2])}, ${f(b.hue[3])}, h.x))` +
    ` * smoothstep(${f(b.sat[0])}, ${f(b.sat[1])}, h.y) * smoothstep(${f(b.val[0])}, ${f(b.val[1])}, h.z)`
  );
}
