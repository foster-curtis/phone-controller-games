// RD5-fix-2: the portal flare flickers (SPEC §9.6): irregular, readable, deterministic, and only
// alpha and scale change per frame (SPEC §15.2 frame cost).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { FLARE_FLICKER, flareFlicker } from '../effectsMath';

const samples = (seed: string, n = 200) =>
  Array.from({ length: n + 1 }, (_, i) => flareFlicker(i / n, seed));

describe('flareFlicker', () => {
  it('varies through the life with several local minima and maxima', () => {
    const a = samples('a').map((s) => s.alpha);
    let extrema = 0;
    for (let i = 1; i < a.length - 1; i++)
      if ((a[i]! - a[i - 1]!) * (a[i + 1]! - a[i]!) < 0) extrema++;
    expect(extrema).toBeGreaterThanOrEqual(6);
  });

  it('stays within [min, 1] with min > 0, and scale stays near 1', () => {
    for (const seed of ['a', 'b:1', '640:300:7'])
      for (const s of samples(seed)) {
        expect(s.alpha).toBeGreaterThanOrEqual(FLARE_FLICKER.minAlpha - 1e-9);
        expect(s.alpha).toBeLessThanOrEqual(1);
        expect(Math.abs(s.scale - 1)).toBeLessThanOrEqual(FLARE_FLICKER.scaleSwing + 1e-9);
      }
    expect(FLARE_FLICKER.minAlpha).toBeGreaterThan(0);
  });

  it('is identical for the same inputs and differs by seed', () => {
    expect(samples('x')).toEqual(samples('x'));
    expect(samples('x')).not.toEqual(samples('y'));
  });

  it('is stronger at the start than the end', () => {
    const swing = (lo: number, hi: number) => {
      const a = samples('a', 400)
        .slice(lo * 4, hi * 4)
        .map((s) => s.alpha);
      return Math.max(...a) - Math.min(...a);
    };
    expect(swing(0, 100)).toBeGreaterThan(swing(100, 200) * 0.8);
  });
});

describe('flare frame cost', () => {
  it('the per-frame flicker path only sets alpha and scale', () => {
    const src = readFileSync(join(import.meta.dirname, '..', 'effects.ts'), 'utf8');
    const math = readFileSync(join(import.meta.dirname, '..', 'effectsMath.ts'), 'utf8');
    const tick = src.slice(src.indexOf('mark(kind: MarkKind'), src.indexOf('tracer('));
    const body = tick.slice(tick.indexOf('(u) => {'));
    expect(body).toContain('flareFlicker(');
    expect(body).not.toMatch(
      /generateTexture|\.add\.|new Phaser|setTexture|setFrame|clear\(|lineStyle|fill/,
    );
    expect(math).not.toMatch(/phaser/i);
  });
});
