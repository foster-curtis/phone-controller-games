// FF8 structure looks (SPEC §7.1, §7.2): nets dim with their discharges and flash on each, the build
// sketches then fills from the plate up, the collapse sinks and fades, Fortify's ripple settles; the
// Warden's per-view clips; the mortar's clamped muzzle flash angle.
import { describe, expect, it } from 'vitest';
import { neonKnightsHost } from '../../../themes/neon-knights/host';
import { SLAM_IMPACT_MS, STOMP_IMPACT_MS } from '../clips/warden';
import {
  BUILD_FILL_MS,
  buildPhase,
  chargedFlicker,
  collapseAt,
  COLLAPSE_MS,
  damageFlicker,
  NET_FLASH_MS,
  netAlpha,
  rippleScale,
  RIPPLE_MS,
} from '../structureFx';

describe('shock net glow', () => {
  it('dims as discharges run out, dips while rearming, flashes on a discharge', () => {
    const at = (left: number, armed = true) => netAlpha(left, 5, armed, 0, null);
    for (let l = 1; l <= 5; l++) expect(at(l)).toBeGreaterThan(at(l - 1));
    expect(at(1)).toBeGreaterThan(0.3);
    expect(at(5, false)).toBeLessThan(at(5));
    expect(netAlpha(1, 5, false, 0, 0)).toBe(1);
    expect(netAlpha(1, 5, true, 0, NET_FLASH_MS)).toBeCloseTo(at(1), 6);
  });
});

describe('flicker', () => {
  it('damaged glow dips now and then; charged crackle is irregular', () => {
    const d = Array.from({ length: 200 }, (_, i) => damageFlicker(i * 30, 7));
    expect(d.some((x) => x < 1)).toBe(true);
    expect(d.filter((x) => x === 1).length).toBeGreaterThan(100);
    const c = Array.from({ length: 200 }, (_, i) => chargedFlicker(i * 20, 7));
    expect(new Set(c.map((x) => x.toFixed(2))).size).toBeGreaterThan(10);
  });
});

describe('build, collapse, ripple', () => {
  it('build: sketch first, then fill from nothing to whole', () => {
    expect(buildPhase(0)).toMatchObject({ fill: 0, done: false });
    expect(buildPhase(0).sketch).toBeGreaterThan(0);
    let last = 0;
    for (let t = 0; t < BUILD_FILL_MS; t += 20) {
      const p = buildPhase(t);
      expect(p.fill).toBeGreaterThanOrEqual(last);
      last = p.fill;
    }
    expect(buildPhase(BUILD_FILL_MS)).toEqual({ sketch: 0, fill: 1, done: true });
  });

  it('collapse sinks and fades; the ripple settles back to 1', () => {
    expect(collapseAt(0)).toEqual({ sy: 1, alpha: 1, done: false });
    expect(collapseAt(COLLAPSE_MS)).toMatchObject({ alpha: 0, done: true });
    expect(rippleScale(RIPPLE_MS / 6)).toBeGreaterThan(1);
    expect(rippleScale(RIPPLE_MS)).toBe(1);
  });
});

describe('Warden and mortar clips', () => {
  const clips = neonKnightsHost.clips;
  it('solves the slam, stomp and build per view, longer than their impacts', () => {
    for (const name of ['attack', 'super', 'build'])
      for (const v of ['side', 'front', 'back']) {
        const c = clips[`warden/${name}@${v}`];
        expect(c, `${name}@${v}`).toBeDefined();
        expect(c!.loop).toBe(false);
      }
    expect(clips['warden/attack']!.durationMs).toBeGreaterThan(SLAM_IMPACT_MS);
    expect(clips['warden/super']!.durationMs).toBeGreaterThan(STOMP_IMPACT_MS);
    // The gravity coil brightens through the wind-up and peaks on the impact.
    const coil = clips['warden/attack@side']!.tracks['hammer-glow']!;
    const peak = coil.reduce((a, k) => ((k.glow ?? 0) > (a.glow ?? 0) ? k : a));
    expect(peak.t).toBe(SLAM_IMPACT_MS);
  });

  it('gives the mortar a fire recoil', () => {
    expect(clips['mortar/attack']).toMatchObject({ loop: false });
    expect(clips['mortar/attack']!.tracks.tube).toBeDefined();
  });
});
