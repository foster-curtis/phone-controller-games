// RD5 scene pieces: the throw preview, the Warden's cracks and dust, the portal flare.
import { describe, expect, it } from 'vitest';
import { shieldGen } from '../../../content/balance';
import { theme } from '../../../shared/theme';
import { presentationHost } from '../../../presentation/host';
import { MapView, PORTALS } from '../../render/map';
import type { MarkKind } from '../../render/types';
import { drawThrowPreview, throwPreview, THROW_RANGE_ALPHA } from '../aimPreview';
import { CRACKS_MS, wardenAttack } from '../wardenFx';
import { fakeRender } from './fakeRender';

const bounds = { cols: 36, rows: 24 };

describe('throwPreview (SPEC §7.3, §10.1)', () => {
  it('lands along the aim at the pull times the range, at the build radius', () => {
    const pv = throwPreview({ x: 10, y: 10 }, { x: 1, y: 0 }, shieldGen, bounds)!;
    expect(pv.x).toBeCloseTo(10 + shieldGen.throw.range);
    expect(pv.radius).toBe(shieldGen.radius);
    expect(pv.range).toBe(shieldGen.throw.range);
    const half = throwPreview({ x: 10, y: 10 }, { x: 0, y: 0.5 }, shieldGen, bounds)!;
    expect(half.dy).toBeCloseTo(shieldGen.throw.range / 2);
  });

  it('is null in the dead zone and for an at-feet build', () => {
    expect(throwPreview({ x: 5, y: 5 }, { x: 0, y: 0 }, shieldGen, bounds)).toBeNull();
    expect(
      throwPreview({ x: 5, y: 5 }, { x: 1, y: 0 }, { input: 'tap', radius: 2 }, bounds),
    ).toBeNull();
  });

  it('clamps the landing inside the playfield', () => {
    const pv = throwPreview({ x: 34, y: 1 }, { x: 1, y: -1 }, shieldGen, bounds)!;
    expect(pv.x).toBeLessThanOrEqual(35.5);
    expect(pv.y).toBeGreaterThanOrEqual(0.5);
  });

  it('draws a filled ellipse at the radius plus a fainter range ring', () => {
    const calls: [string, ...number[]][] = [];
    const g: Record<string, (...a: number[]) => unknown> = {};
    for (const k of ['fillStyle', 'lineStyle', 'fillEllipse', 'strokeEllipse'])
      g[k] = (...a: number[]) => (calls.push([k, ...a]), g);
    const f = { sx: 500, sy: 400, kx: 48, ky: 28.8 };
    const pv = throwPreview({ x: 10, y: 10 }, { x: 1, y: 0 }, shieldGen, bounds)!;
    drawThrowPreview(g as never, pv, f, theme.color.amber.num);
    const fills = calls.filter((c) => c[0] === 'fillEllipse');
    expect(fills).toHaveLength(1);
    expect(fills[0]![3]).toBeCloseTo(shieldGen.radius * 48 * 2); // width at the real radius
    expect(fills[0]![1]).toBeCloseTo(500 + shieldGen.throw.range * 48);
    const alphas = calls.filter((c) => c[0] === 'lineStyle').map((c) => c[3]);
    expect(alphas).toContain(THROW_RANGE_ALPHA);
  });
});

describe('Warden cracks and dust (SPEC §2.4)', () => {
  const run = (slot: 'main' | 'super') => {
    const marks: { kind: MarkKind; sx: number; sy: number; ms: number }[] = [];
    const fake = fakeRender();
    const w = {
      camera: fake.ctx.camera,
      fx: {
        mark: (kind: MarkKind, sx: number, sy: number, ms: number) =>
          marks.push({ kind, sx, sy, ms }),
        burst() {},
        arcWave() {},
      },
    };
    const rig = {
      attach: (n: string) => (n === 'hammer-ground' ? { sx: 111, sy: 222 } : { sx: 1, sy: 2 }),
      play: () => true,
    };
    const timers: { ms: number; fn: () => void }[] = [];
    const def = { main: { range: 1.75, arcDeg: 102 }, super: { range: 4.7, arcDeg: 85 } };
    wardenAttack(
      w as never,
      rig as never,
      { e: 'attack', source: 1, slot, x: 12, y: 10, angle: 0 } as never,
      def as never,
      (ms, fn) => timers.push({ ms, fn }),
    );
    for (const t of timers) t.fn();
    return { marks, timers };
  };

  it('the slam leaves slam-cracks at the hammer-ground point for about a second', () => {
    const { marks, timers } = run('main');
    expect(timers[0]!.ms).toBe(200);
    expect(marks).toEqual([{ kind: 'slam-cracks', sx: 111, sy: 222, ms: CRACKS_MS }]);
    expect(CRACKS_MS).toBeGreaterThanOrEqual(900);
  });

  it('the jump slam lands with landing-dust at his feet and slam-cracks-wide at the hammer', () => {
    const { marks } = run('super');
    expect(marks.map((m) => m.kind).sort()).toEqual(['landing-dust', 'slam-cracks-wide']);
    expect(marks.find((m) => m.kind === 'slam-cracks-wide')).toMatchObject({ sx: 111, sy: 222 });
  });
});

describe('portal flare (SPEC §3.1, §9.4)', () => {
  it('swaps to the flare frame with sparks at the center point, then back to idle', () => {
    const fake = fakeRender();
    const marks: { kind: string; sx: number; sy: number; ms: number }[] = [];
    const ctx = fake.ctx as never as Record<string, unknown>;
    (ctx.lib as Record<string, unknown>).frames = {
      'portal/left-flare': { attach: { center: [-14, 0] } },
    };
    ctx.fx = {
      mark: (kind: string, sx: number, sy: number, ms: number) => marks.push({ kind, sx, sy, ms }),
    };
    const map = new MapView(ctx as never, presentationHost.map);
    const id = PORTALS.find((p) => p.side === 'left')!.id;
    const frames = fake.made.frames;
    map.flare(id, 1000);
    expect(fake.made.frames).toBe(frames + 1);
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ kind: 'portal-flare', ms: 1000 });
    map.idle(id);
    expect(fake.made.frames).toBe(frames + 2);
    map.idle(id); // already idle: no swap
    expect(fake.made.frames).toBe(frames + 2);
  });

  it('knows all six portals by id', () => {
    expect(PORTALS.map((p) => p.id)).toHaveLength(6);
  });
});
