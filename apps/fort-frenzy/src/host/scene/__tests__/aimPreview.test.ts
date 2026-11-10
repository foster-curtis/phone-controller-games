// The TV's aim preview drawing (SPEC §10.1, §15.2; FF7-fix-2, C3): the drawn shape is the sim's hit
// shape under the §2.5 ground projection, amber, dim enough for the bloom, and draws nothing extra.
import type * as Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import { commander, engineer, rules, warden } from '../../../content/balance';
import { theme } from '../../../shared/theme';
import { FixedCamera } from '../../render/camera';
import { aimPreview, type HitShape } from '../../sim';
import { harness } from '../../sim/__tests__/harness';
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
    const shape: HitShape = { kind: 'cone', range: 3.7, half: (42.5 * Math.PI) / 180 };
    const aim = 0.7;
    drawAimPreview(ground.g, shape, frame, aim, amber, content.rules!.projectileRadius);
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
    drawAimPreview(
      ground.g,
      { kind: 'circle', radius: 3.5 },
      frame,
      0,
      amber,
      content.rules!.projectileRadius,
    );
    const { rx, ry } = cam.groundEllipse(3.5);
    expect(ground.r.ellipses.length).toBe(1);
    const want = [s0.sx, s0.sy, rx * 2, ry * 2];
    ground.r.ellipses[0]!.forEach((v, i) => expect(v).toBeCloseTo(want[i]!, 9));
  });

  it('a single bolt is a filled amber bar of the hit range, its width given', () => {
    const ground = fakeGfx();
    drawAimPreview(ground.g, { kind: 'line', range: 9 }, frame, Math.PI / 2, amber, 0.25);
    // Corners: feet ± half-width across the aim, then the far end ± the same (world tiles).
    const pts = ground.r.pts.map(toWorld);
    const want = [
      [-0.25, 0],
      [-0.25, 9],
      [0.25, 9],
      [0.25, 0],
    ];
    expect(pts.length).toBe(4);
    pts.forEach((pt, i) => pt.forEach((v, j) => expect(v).toBeCloseTo(want[i]![j]!, 9)));
    expect(ground.r.fills).toEqual([[amber, AIM_FILL_ALPHA]]);
    expect(ground.r.strokes).toEqual([[2, amber, AIM_EDGE_ALPHA]]);
    expect(ground.r.lines.length).toBe(0);
  });

  it('a shape that hits nothing draws nothing', () => {
    const ground = fakeGfx();
    drawAimPreview(ground.g, { kind: 'none' }, frame, 0, amber, content.rules!.projectileRadius);
    expect(ground.r.calls).toBe(0);
  });

  it('stays dim enough to sit under the bloom threshold (value < 0.72 over black)', () => {
    // The threshold keeps only bright amber (render/bloom.ts: value ≥ 0.72); the fill and edge
    // composite at alpha × amber's value over the dark floor.
    const v = Math.max(amber >> 16, (amber >> 8) & 0xff, amber & 0xff) / 255;
    expect(AIM_FILL_ALPHA * v).toBeLessThan(0.72);
    expect(AIM_EDGE_ALPHA * v).toBeLessThan(0.72);
  });
});

// FF7-fix-3 (C3 follow-up): the Warden's slam and the Commander's slash are aimed; while aiming the TV
// draws the sim's own sector for them (`aimPreview`), turned to the phone's aim.
describe('aimed melee previews', () => {
  const DEG = Math.PI / 180;
  for (const [cls, def] of [
    ['warden', warden],
    ['commander', commander],
  ] as const) {
    it(`${cls} main: a filled amber sector of the attack's real range and arc at the aim`, () => {
      const h = harness(1, 1, { classes: [cls] });
      h.toCombat();
      h.holdSpawns();
      h.pads[0]!.set({ mainAim: { x: -0.6, y: 0.8 }, mainAiming: true });
      h.run(1);
      const p = h.p(0);
      expect(p.mainAim).not.toBeNull();
      const shape = aimPreview(p, def, 'main', content.rules);
      const angle = Math.atan2(p.mainAim!.y, p.mainAim!.x);
      const ground = fakeGfx();
      drawAimPreview(ground.g, shape, frame, angle, amber, content.rules!.projectileRadius);
      const [, ...rim] = ground.r.pts;
      const offs = rim.map((pt) => {
        const [x, y] = toWorld(pt);
        expect(Math.hypot(x!, y!)).toBeCloseTo(def.main.range, 9);
        const off = Math.atan2(y!, x!) - angle;
        return Math.atan2(Math.sin(off), Math.cos(off));
      });
      expect(Math.min(...offs)).toBeCloseTo((-def.main.arcDeg / 2) * DEG, 9);
      expect(Math.max(...offs)).toBeCloseTo((def.main.arcDeg / 2) * DEG, 9);
      expect(ground.r.fills).toEqual([[amber, AIM_FILL_ALPHA]]);
    });
  }
});

// FF7-fix-6 (C4): "The Ranger's aim line should match the style of the other players: it should be a
// transparent amber bar that is the width of the bolt's hitbox." The bar is the sim's own bolt hit
// radius (balance `rules.projectileRadius`, the fired projectile's `r`) across, drawn like the cones.
describe('Ranger main preview (C4)', () => {
  it("is a transparent amber bar as wide as the bolt's hitbox and as long as its range", () => {
    const h = harness(1, 1, { classes: ['engineer'] });
    h.toCombat();
    h.holdSpawns();
    h.pads[0]!.set({ mainAim: { x: 0.6, y: 0.8 }, mainAiming: true });
    h.run(1);
    const p = h.p(0);
    expect(p.mainAim).not.toBeNull();
    const shape = aimPreview(p, engineer, 'main', content.rules);
    expect(shape.kind).toBe('line');
    const angle = Math.atan2(p.mainAim!.y, p.mainAim!.x);
    const ground = fakeGfx();
    // What the TV passes (worldView `drawAim`): the content's bolt radius.
    expect(content.rules!.projectileRadius).toBe(rules.projectileRadius);
    drawAimPreview(ground.g, shape, frame, angle, amber, content.rules!.projectileRadius);
    // Back into the aim's frame: u along the aim, v across it.
    const uv = ground.r.pts.map(toWorld).map(([x, y]) => {
      const c = Math.cos(angle);
      const sn = Math.sin(angle);
      return [x! * c + y! * sn, -x! * sn + y! * c] as const;
    });
    const us = uv.map(([u]) => u);
    const vs = uv.map(([, v]) => v);
    expect(Math.min(...us)).toBeCloseTo(0, 9);
    // The sim's effective range (standing still, Steady Aim's +20% is on: sim aimPreview tests).
    expect(Math.max(...us)).toBeCloseTo((shape as { range: number }).range, 9);
    expect(Math.max(...vs) - Math.min(...vs)).toBeCloseTo(2 * rules.projectileRadius, 9);

    // The bolt the Ranger actually fires carries the same hit radius.
    h.pads[0]!.tap('mainFires', { mainAim: { x: 0.6, y: 0.8 } });
    h.run(2);
    const bolt = h.sim.world.projectiles.find((b) => b.source === p.id);
    expect(bolt?.r).toBe(rules.projectileRadius);

    // The shared preview style: the cones' fill and edge, on the ground overlay.
    const cone = fakeGfx();
    drawAimPreview(cone.g, { kind: 'cone', range: 3, half: 0.5 }, frame, 0, amber, 0);
    expect(ground.r.fills).toEqual(cone.r.fills);
    expect(ground.r.strokes).toEqual(cone.r.strokes);
    expect(ground.r.fills).toEqual([[amber, AIM_FILL_ALPHA]]);
    expect(ground.r.lines.length).toBe(0);
  });

  it("the Ranger's super is a circle, not a line (left as is)", () => {
    expect(engineer.super.shape).toBe('circle');
  });
});
