// The TV's aim preview drawing (SPEC §10.1, §15.2; FF7-fix-2, C3): the drawn shape is the sim's hit
// shape under the §2.5 ground projection, amber, dim enough for the bloom, and draws nothing extra.
import type * as Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { theme } from '../../../shared/theme';
import { FixedCamera } from '../../render/camera';
import type { HitShape } from '../../sim';
import { AIM_EDGE_ALPHA, AIM_FILL_ALPHA, drawAimPreview, type GroundFrame } from '../aimPreview';

interface Rec {
  pts: [number, number][];
  lines: [number, number, number, number][];
  ellipses: [number, number, number, number][];
  fills: [number, number][];
  strokes: [number, number, number][];
  calls: number;
}

function fakeGfx() {
  const r: Rec = { pts: [], lines: [], ellipses: [], fills: [], strokes: [], calls: 0 };
  const g: Record<string, (...a: number[]) => unknown> = {};
  const chain =
    (f?: (...a: number[]) => void) =>
    (...a: number[]) => {
      r.calls++;
      f?.(...a);
      return g;
    };
  Object.assign(g, {
    beginPath: chain(),
    closePath: chain(),
    fillPath: chain(),
    strokePath: chain(),
    moveTo: chain((x, y) => r.pts.push([x!, y!])),
    lineTo: chain((x, y) => r.pts.push([x!, y!])),
    lineBetween: chain((a, b, c, d) => r.lines.push([a!, b!, c!, d!])),
    fillEllipse: chain((x, y, w, h) => r.ellipses.push([x!, y!, w!, h!])),
    strokeEllipse: chain(),
    fillStyle: chain((c, a) => r.fills.push([c!, a!])),
    lineStyle: chain((w, c, a) => r.strokes.push([w!, c!, a!])),
  });
  return { g: g as unknown as Phaser.GameObjects.Graphics, r };
}

const cam = new FixedCamera();
const at = { x: 12, y: 10 };
const s0 = cam.worldToScreen(at.x, at.y);
const e1 = cam.groundEllipse(1);
const frame: GroundFrame = { sx: s0.sx, sy: s0.sy, kx: e1.rx, ky: e1.ry };
const amber = theme.color.amber.num;

/** Screen point → world ground offset from the attacker (inverse of the camera's projection). */
const toWorld = ([sx, sy]: [number, number]) => [(sx - s0.sx) / e1.rx, (sy - s0.sy) / e1.ry];

describe('drawAimPreview', () => {
  it('a cone is a filled amber sector of the hit range and opening on the ground', () => {
    const ground = fakeGfx();
    const ui = fakeGfx();
    const shape: HitShape = { kind: 'cone', range: 3.7, half: (42.5 * Math.PI) / 180 };
    const aim = 0.7;
    drawAimPreview(ground.g, ui.g, shape, frame, aim, amber);
    expect(ui.r.calls).toBe(0);
    const [apex, ...rim] = ground.r.pts;
    expect(apex).toEqual([s0.sx, s0.sy]);
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of rim) {
      const [x, y] = toWorld(p);
      expect(Math.hypot(x!, y!)).toBeCloseTo(shape.range, 9);
      const off = Math.atan2(y!, x!) - aim;
      lo = Math.min(lo, off);
      hi = Math.max(hi, off);
    }
    expect(lo).toBeCloseTo(-shape.half, 9);
    expect(hi).toBeCloseTo(shape.half, 9);
    // Matches the camera at the rim (the projection is linear on the ground).
    const tip = cam.worldToScreen(
      at.x + Math.cos(aim + shape.half) * 3.7,
      at.y + Math.sin(aim + shape.half) * 3.7,
    );
    expect(rim.at(-1)![0]).toBeCloseTo(tip.sx, 6);
    expect(rim.at(-1)![1]).toBeCloseTo(tip.sy, 6);
    expect(ground.r.fills).toEqual([[amber, AIM_FILL_ALPHA]]);
    expect(ground.r.strokes).toEqual([[2, amber, AIM_EDGE_ALPHA]]);
  });

  it('a circle is a filled 0.6 ground ellipse of the hit radius', () => {
    const ground = fakeGfx();
    const ui = fakeGfx();
    drawAimPreview(ground.g, ui.g, { kind: 'circle', radius: 3.5 }, frame, 0, amber);
    const { rx, ry } = cam.groundEllipse(3.5);
    expect(ground.r.ellipses.length).toBe(1);
    const want = [s0.sx, s0.sy, rx * 2, ry * 2];
    ground.r.ellipses[0]!.forEach((v, i) => expect(v).toBeCloseTo(want[i]!, 9));
    expect(ui.r.calls).toBe(0);
  });

  it('a single bolt is a dashed amber line in world UI to the hit range', () => {
    const ground = fakeGfx();
    const ui = fakeGfx();
    drawAimPreview(ground.g, ui.g, { kind: 'line', range: 9 }, frame, Math.PI / 2, amber);
    expect(ground.r.calls).toBe(0);
    expect(ui.r.strokes[0]?.[1]).toBe(amber);
    const end = cam.worldToScreen(at.x, at.y + 9);
    const far = Math.max(...ui.r.lines.map((l) => l[3]));
    expect(far).toBeLessThanOrEqual(end.sy + 1e-6);
    expect(far).toBeGreaterThan(end.sy - 2 * 14);
    for (const l of ui.r.lines) expect(l[0]).toBeCloseTo(s0.sx, 9);
  });

  it('a shape that hits nothing draws nothing', () => {
    const ground = fakeGfx();
    const ui = fakeGfx();
    drawAimPreview(ground.g, ui.g, { kind: 'none' }, frame, 0, amber);
    expect(ground.r.calls + ui.r.calls).toBe(0);
  });

  it('stays dim enough to sit under the bloom threshold (value < 0.72 over black)', () => {
    // The threshold keeps only bright amber (render/bloom.ts: value ≥ 0.72); the fill and edge
    // composite at alpha × amber's value over the dark floor.
    const v = Math.max(amber >> 16, (amber >> 8) & 0xff, amber & 0xff) / 255;
    expect(AIM_FILL_ALPHA * v).toBeLessThan(0.72);
    expect(AIM_EDGE_ALPHA * v).toBeLessThan(0.72);
  });
});
