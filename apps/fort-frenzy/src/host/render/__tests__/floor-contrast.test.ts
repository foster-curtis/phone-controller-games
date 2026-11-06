// C3 floor contrast (BUILD_PLAN §8 FF3-fix-2): the lifted floor against what's drawn on it, measured
// from the art SVGs and the theme, as WCAG contrast ratios. Enemy body colors are weighted by the
// opaque pixels each one covers when every side part is rasterized (overlaps count twice, close
// enough to rank them). The floor must also stay out of the bloom's threshold.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { describe, expect, it } from 'vitest';
import { theme } from '../../../shared/theme';
import { neonKnightsHost } from '../../../themes/neon-knights/host';
import { bloomWeight } from '../bloomPick';
import { contrast, lift, luminance, over, rgb, toHex } from '../color';
import { DANGER_EDGE } from '../legibility';

const art = join(import.meta.dirname, '..', '..', '..', '..', 'art', 'neon-knights');
const read = (...p: string[]) => readFileSync(join(art, ...p), 'utf8');
const hexes = (svg: string) => [...svg.matchAll(/#[0-9a-f]{6}\b/gi)].map((m) => m[0].toLowerCase());

/**
 * Minimums (C3 note: enemies, the small ones above all, must read on the floor). On the art's
 * #262b33 stone the bodies measured 1.0–1.2:1 and the outline 1.35:1.
 */
const MIN = {
  /** The art's outline ink: every sprite's silhouette (WCAG non-text 3:1). */
  outline: 3,
  /** Each enemy's body as one color (area-weighted luminance, glows and ink left out). */
  body: 1.8,
  /** The same for the small ones the note names: Scrap-mites and Skitters. */
  small: 2.1,
  /** Any single body color covering ≥ 10% of an enemy. */
  part: 1.5,
} as const;
const SMALL = new Set(['mite', 'skitter']);

/** The art's outline ink (art README). Glows (anything the bloom picks) aren't body colors. */
const INK = '#0d0f12';
const isGlow = (hex: string) => bloomWeight(rgb(hex)) > 0;

const LIFT = neonKnightsHost.map.floorLift!;
const ART_FLOOR = rgb(
  /<path d="M-40-24h80v48h-80z" fill="(#[0-9a-f]{6})"/.exec(read('map', 'ground', '1.svg'))![1]!,
);
const FLOOR = lift(ART_FLOOR, LIFT);

/** Opaque-pixel share of each fill color across an enemy's side parts. */
function bodyShares(rig: string): Map<string, number> {
  const dir = join(art, 'enemies', rig, 'side');
  const counts = new Map<number, number>();
  let total = 0;
  for (const f of readdirSync(dir)) {
    const svg = readFileSync(join(dir, f), 'utf8');
    const fills = new Set(hexes(svg).map((h) => parseInt(h.slice(1), 16)));
    const px = new Resvg(svg, {
      fitTo: { mode: 'zoom', value: 1 },
      font: { loadSystemFonts: false },
    }).render().pixels;
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] !== 255) continue;
      total++;
      const c = (px[i]! << 16) | (px[i + 1]! << 8) | px[i + 2]!;
      if (fills.has(c)) counts.set(c, (counts.get(c) ?? 0) + 1);
    }
  }
  const shares = new Map<string, number>();
  for (const [c, n] of counts) shares.set(toHex(rgb(c)), n / total);
  return shares;
}

const ENEMY_RIGS = Object.values(neonKnightsHost.rigFor.enemy);

describe('C3 floor (FF3-fix-2)', () => {
  it('checks against the bloom shader’s own threshold: amber and violet only', () => {
    expect(bloomWeight(rgb(theme.color.amber.hex))).toBe(1);
    expect(bloomWeight(rgb(theme.color.hostile.hex))).toBe(1);
    expect(bloomWeight(rgb(theme.color.hostileCore.hex))).toBe(1);
    for (const hex of ['#7d8798', '#4a5362', '#6a5f8f', '#3a3150', theme.color.danger.hex])
      expect(bloomWeight(rgb(hex)), hex).toBe(0);
    for (const p of Object.values(theme.players)) expect(bloomWeight(rgb(p.fill.hex))).toBe(0);
  });

  it('is lighter than the art’s stone and below the bloom threshold', () => {
    expect(toHex(FLOOR)).toBe('#62676f');
    expect(luminance(FLOOR)).toBeGreaterThan(luminance(ART_FLOOR) * 4);
    // Every lifted ground, edge and decor color (seams, hash marks, rim, ink) stays out of the bloom.
    const files = [
      ...[1, 2, 3, 4].map((n) => ['ground', `${n}.svg`]),
      ...readdirSync(join(art, 'map', 'edge')).map((f) => ['edge', f]),
      ...readdirSync(join(art, 'map', 'decor')).map((f) => ['decor', f]),
    ];
    for (const [d, f] of files) {
      for (const hex of hexes(read('map', d!, f!)))
        expect(bloomWeight(lift(rgb(hex), LIFT)), `${d}/${f} ${hex}`).toBe(0);
    }
  });

  it('keeps the art’s seam and hash steps (the lift adds, it does not flatten)', () => {
    for (const hex of hexes(read('map', 'ground', '3.svg'))) {
      const before = contrast(ART_FLOOR, rgb(hex));
      expect(Math.abs(contrast(FLOOR, lift(rgb(hex), LIFT)) - before), hex).toBeLessThan(0.1);
    }
  });

  it.each(ENEMY_RIGS)('reads every enemy body against the floor: %s', (rig) => {
    const shares = bodyShares(rig);
    expect(contrast(FLOOR, rgb(INK)), 'outline').toBeGreaterThanOrEqual(MIN.outline);
    const body = [...shares].filter(([hex]) => hex !== INK && !isGlow(hex));
    expect(body.length).toBeGreaterThan(0);
    // The body as one color: its area-weighted luminance (all darker than the floor).
    const area = body.reduce((s, [, n]) => s + n, 0);
    const lum = body.reduce((s, [hex, n]) => s + luminance(rgb(hex)) * n, 0) / area;
    expect(lum).toBeLessThan(luminance(FLOOR));
    const ratio = (luminance(FLOOR) + 0.05) / (lum + 0.05);
    expect(ratio, `${rig} body`).toBeGreaterThanOrEqual(SMALL.has(rig) ? MIN.small : MIN.body);
    for (const [hex, share] of body) {
      if (share >= 0.1)
        expect(contrast(FLOOR, rgb(hex)), `${rig} ${hex}`).toBeGreaterThanOrEqual(MIN.part);
    }
  });

  it('stays darker than every glow: amber ours, violet theirs', () => {
    for (const c of [
      theme.color.amber,
      theme.color.hostile,
      theme.color.hostileCore,
      theme.color.ember,
    ]) {
      expect(luminance(rgb(c.hex)), c.hex).toBeGreaterThan(luminance(FLOOR));
      expect(contrast(FLOOR, rgb(c.hex)), c.hex).toBeGreaterThanOrEqual(1.5);
    }
  });

  it('frames every player ring in ink, which reads on the floor', () => {
    const ink = rgb(theme.color.brandInk.hex);
    expect(contrast(FLOOR, ink)).toBeGreaterThanOrEqual(3);
    for (const [id, p] of Object.entries(theme.players))
      expect(contrast(rgb(p.fill.hex), ink), id).toBeGreaterThanOrEqual(3);
  });

  it('keeps danger markers and shadows visible', () => {
    const ink = rgb(theme.color.brandInk.hex);
    const edge = over(ink, DANGER_EDGE.alpha, FLOOR);
    expect(contrast(FLOOR, edge), 'danger edge').toBeGreaterThanOrEqual(2.5);
    expect(contrast(over(rgb(theme.color.danger.hex), 0.9, edge), edge)).toBeGreaterThanOrEqual(3);
    // groundMarks.shadow's default alpha; on the old floor this was 1.1:1, barely there.
    expect(contrast(FLOOR, over(ink, 0.4, FLOOR)), 'shadow').toBeGreaterThanOrEqual(1.5);
  });
});
