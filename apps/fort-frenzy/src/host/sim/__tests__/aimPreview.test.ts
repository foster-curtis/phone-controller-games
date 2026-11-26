// Aim previews (SPEC §10.1, §15.2; FF7-fix-2, C3): for every class's main and super the preview's
// geometry is the content's numbers through the player's modifiers, and the sim hits exactly the
// previewed area (probes just inside and just past the reach and the edge, with and without a mod).
// The probe Grunt's body is flattened to its feet circle so the probes measure the shape alone;
// body.test.ts covers how a drawn body reaches into the same shapes (C4).
import { describe, expect, it } from 'vitest';
import { content as baseContent, type Content } from '../../../content';
import { artificer, commander, grunt, ranger, rangerCards, warden } from '../../../content/balance';
import type { KnightDef } from '../../../content/types';
import type { CardId, ClassId } from '../../../shared/ids';
import { windupSteps } from '../classes/warden';
import { aimPreview } from '../preview';
import type { HitShape } from '../classes/hitShape';
import type { Modifier } from '../types';
import { harness } from './harness';

const content: Content = {
  ...baseContent,
  enemies: baseContent.enemies.map((e) =>
    e.id === 'grunt' ? { ...e, body: { radius: e.radius, bottom: 0, top: 0 } } : e,
  ),
};
const DEG = Math.PI / 180;
const DEFS: Record<ClassId, KnightDef> = { ranger, artificer, commander, warden };
const AIM = { x: 1, y: 0 };
const PX = 10;
const PY = 13;
/** A card-like mod on every stat a shape reads, so the test proves both sides go through mods. */
const BOOST: Modifier = {
  id: 'test:reach',
  stats: [
    { stat: 'range', addPct: 0.3 },
    { stat: 'arcDeg', add: 12 },
    { stat: 'radius', addPct: 0.25 },
    { stat: 'width', addPct: 0.2 },
  ],
};

const steadyParams = rangerCards.find((c) => c.id === 'steady_aim')!.module!.params!;

/** `true` adds `BOOST`; a card id picks that real card (FF12) before combat. */
type Boost = boolean | CardId;

function setup(cls: ClassId, boosted: Boost) {
  const h = harness(1, 1, { classes: [cls], content });
  if (typeof boosted === 'string') {
    h.toBuild();
    h.give(0, boosted);
  }
  h.toCombat();
  h.holdSpawns();
  h.put(0, PX, PY);
  // Break Steady Aim (a moving stick) so the Ranger's numbers are his base ones.
  h.pads[0]!.set({ move: { x: 0.001, y: 0 } });
  h.run(1);
  h.put(0, PX, PY);
  if (boosted === true) h.p(0).mods.push(BOOST);
  // Park the Commander's squad far away so only his own attack lands.
  for (const u of h.sim.world.soldiers) {
    u.x = 30;
    u.y = 20;
    u.stats.moveSpeed = 0;
  }
  return h;
}

const shapeOf = (h: ReturnType<typeof setup>, slot: 'main' | 'super') =>
  aimPreview(h.p(0), DEFS[h.p(0).classId], slot, content.rules);

function fire(h: ReturnType<typeof setup>, slot: 'main' | 'super', aim = AIM) {
  const p = h.p(0);
  if (slot === 'super') {
    p.superCharge = 1;
    h.pads[0]!.tap('superFires', { superAim: aim });
  } else {
    h.pads[0]!.tap('mainFires', { mainAim: aim });
  }
  h.run(2 + windupSteps(DEFS[p.classId][slot]));
}

/**
 * Fires at a lone Grunt placed by `at` (from the preview shape, in the aim's frame: +x along the aim)
 * aimed at `aimAng` radians; true when it took damage.
 */
function hits(
  cls: ClassId,
  slot: 'main' | 'super',
  boosted: Boost,
  at: (s: HitShape) => [number, number],
  aimAng = 0,
): boolean {
  const h = setup(cls, boosted);
  const [ax, ay] = at(shapeOf(h, slot));
  const c = Math.cos(aimAng);
  const s = Math.sin(aimAng);
  const e = h.sim.spawnEnemy('grunt', PX + ax * c - ay * s, PY + ax * s + ay * c);
  e.stats.moveSpeed = 0;
  const hp0 = e.hp;
  fire(h, slot, aimAng === 0 ? AIM : { x: c, y: s });
  return e.hp < hp0;
}

const R = grunt.radius;
const polar = (d: number, a: number): [number, number] => [Math.cos(a) * d, Math.sin(a) * d];
const cone = (s: HitShape) => {
  if (s.kind !== 'cone') throw new Error(`expected a cone, got ${s.kind}`);
  return s;
};
const rect = (s: HitShape) => {
  if (s.kind !== 'rect') throw new Error(`expected a rect, got ${s.kind}`);
  return s;
};

describe('preview geometry is the content through modifiers', () => {
  it('matches each class kit with no mods', () => {
    const expected: Record<ClassId, Record<'main' | 'super', HitShape>> = {
      ranger: {
        main: { kind: 'line', range: ranger.main.range },
        super: { kind: 'circle', radius: ranger.super.radius },
      },
      artificer: {
        main: {
          kind: 'cone',
          range: artificer.main.range,
          half: (artificer.main.spreadDeg / 2) * DEG,
        },
        super: {
          kind: 'cone',
          range: artificer.super.range,
          half: (artificer.super.arcDeg / 2) * DEG,
        },
      },
      commander: {
        main: { kind: 'rect', range: commander.main.range, width: commander.main.width },
        super: { kind: 'none' },
      },
      warden: {
        main: { kind: 'cone', range: warden.main.range, half: (warden.main.arcDeg / 2) * DEG },
        super: { kind: 'cone', range: warden.super.range, half: (warden.super.arcDeg / 2) * DEG },
      },
    };
    for (const cls of Object.keys(DEFS) as ClassId[]) {
      const h = setup(cls, false);
      for (const slot of ['main', 'super'] as const) {
        const got = shapeOf(h, slot);
        const want = expected[cls][slot];
        expect(got.kind, `${cls} ${slot}`).toBe(want.kind);
        for (const [k, v] of Object.entries(want)) {
          if (typeof v === 'number')
            expect(
              (got as unknown as Record<string, number>)[k],
              `${cls} ${slot} ${k}`,
            ).toBeCloseTo(v, 9);
        }
      }
    }
  });

  it('every aimed button has a shape to preview (FF7-fix-3: Warden and Commander mains too)', () => {
    expect(warden.input.main).toBe('aimed');
    expect(commander.input.main).toBe('aimed');
    for (const cls of Object.keys(DEFS) as ClassId[]) {
      const h = setup(cls, false);
      for (const slot of ['main', 'super'] as const) {
        if (DEFS[cls].input[slot] !== 'aimed') continue;
        // Reinforcements hits nothing: its aim shows the landing spot (`soldierPreview`, RD9).
        if (DEFS[cls][slot].shape === 'spawn') continue;
        expect(shapeOf(h, slot).kind, `${cls} ${slot}`).not.toBe('none');
      }
    }
  });

  it('moves with a mod (and with Steady Aim, the Ranger passive card)', () => {
    const h = setup('warden', true);
    const s = cone(shapeOf(h, 'super'));
    expect(s.range).toBeCloseTo(warden.super.range * 1.3, 9);
    expect(s.half).toBeCloseTo(((warden.super.arcDeg + 12) / 2) * DEG, 9);
    const r = setup('ranger', 'steady_aim');
    expect(shapeOf(r, 'main')).toEqual({ kind: 'line', range: ranger.main.range });
    r.pads[0]!.set({ move: { x: 0, y: 0 } });
    r.run(40); // past Steady Aim's 600 ms
    const steady = shapeOf(r, 'main');
    expect(steady.kind === 'line' && steady.range).toBeCloseTo(
      ranger.main.range * (1 + (steadyParams.rangePct as number)),
      9,
    );
  });
});

describe('the sim hits exactly the previewed area', () => {
  const arcs: [ClassId, 'main' | 'super'][] = [
    ['warden', 'main'],
    ['warden', 'super'],
  ];
  for (const [cls, slot] of arcs) {
    for (const boosted of [false, true]) {
      it(`${cls} ${slot}${boosted ? ' (with a mod)' : ''}: the reach and the edge`, () => {
        const reach = (s: HitShape) => cone(s).range + R;
        const edge = (s: HitShape, d: number) => cone(s).half + Math.asin(R / d);
        expect(hits(cls, slot, boosted, (s) => [reach(s) - 0.02, 0])).toBe(true);
        expect(hits(cls, slot, boosted, (s) => [reach(s) + 0.02, 0])).toBe(false);
        const d = (s: HitShape) => cone(s).range * 0.6;
        expect(hits(cls, slot, boosted, (s) => polar(d(s), edge(s, d(s)) - 0.02))).toBe(true);
        expect(hits(cls, slot, boosted, (s) => polar(d(s), edge(s, d(s)) + 0.02))).toBe(false);
      });
    }
  }

  // FF7-fix-3: the Warden's slam is aimed, so the previewed sector turns with the phone's aim and
  // the hit turns with it (the Commander's bash: the rectangle below).
  for (const cls of ['warden'] as const) {
    for (const ang of [2.2, -1.1]) {
      it(`${cls} main aimed at ${ang} rad: the reach and both edges follow the aim`, () => {
        const reach = (s: HitShape) => cone(s).range + R;
        const d = (s: HitShape) => cone(s).range * 0.6;
        const edge = (s: HitShape) => cone(s).half + Math.asin(R / d(s));
        expect(hits(cls, 'main', false, (s) => [reach(s) - 0.02, 0], ang)).toBe(true);
        expect(hits(cls, 'main', false, (s) => [reach(s) + 0.02, 0], ang)).toBe(false);
        for (const side of [1, -1]) {
          expect(hits(cls, 'main', true, (s) => polar(d(s), side * (edge(s) - 0.02)), ang)).toBe(
            true,
          );
          expect(hits(cls, 'main', true, (s) => polar(d(s), side * (edge(s) + 0.02)), ang)).toBe(
            false,
          );
        }
      });
    }
  }

  // FF12's slam card (Heavy Slam: +20% arc, main only) and Reach move the
  // aimed preview with the hit.
  for (const [cls, card] of [
    ['warden', 'heavy_slam'],
    ['warden', 'reach'],
  ] as const) {
    it(`${cls} main with ${card}: the preview and the aimed hit agree`, () => {
      const base = cone(shapeOf(setup(cls, false), 'main'));
      const got = cone(shapeOf(setup(cls, card), 'main'));
      if (card === 'reach') expect(got.range).toBeGreaterThan(base.range);
      else expect(got.half).toBeCloseTo(base.half * 1.2, 9);
      const ang = 2.2;
      const reach = (s: HitShape) => cone(s).range + R;
      const d = (s: HitShape) => cone(s).range * 0.6;
      const edge = (s: HitShape) => cone(s).half + Math.asin(R / d(s));
      expect(hits(cls, 'main', card, (s) => [reach(s) - 0.02, 0], ang)).toBe(true);
      expect(hits(cls, 'main', card, (s) => [reach(s) + 0.02, 0], ang)).toBe(false);
      expect(hits(cls, 'main', card, (s) => polar(d(s), edge(s) - 0.02), ang)).toBe(true);
      expect(hits(cls, 'main', card, (s) => polar(d(s), edge(s) + 0.02), ang)).toBe(false);
    });
  }

  // RD9-fix-1 (RC2): the Commander's bash is a solid rectangle from him along the aim. A body
  // overlapping it anywhere is hit (its far corners too), one just past its end or a side isn't;
  // it turns with the aim and moves with mods and cards (Reach: longer; Heavy Bash: wider).
  for (const boosted of [false, true, 'reach', 'heavy_bash'] as const) {
    for (const ang of [0, 2.2, -1.1]) {
      it(`commander main${boosted ? ` (${boosted === true ? 'a mod' : boosted})` : ''} at ${ang} rad: the rectangle`, () => {
        const end = (s: HitShape) => rect(s).range + R;
        const side = (s: HitShape) => rect(s).width / 2 + R;
        const mid = (s: HitShape) => rect(s).range / 2;
        expect(hits('commander', 'main', boosted, (s) => [end(s) - 0.02, 0], ang)).toBe(true);
        expect(hits('commander', 'main', boosted, (s) => [end(s) + 0.02, 0], ang)).toBe(false);
        for (const sd of [1, -1]) {
          expect(
            hits('commander', 'main', boosted, (s) => [mid(s), sd * (side(s) - 0.02)], ang),
          ).toBe(true);
          expect(
            hits('commander', 'main', boosted, (s) => [mid(s), sd * (side(s) + 0.02)], ang),
          ).toBe(false);
          // The far corner, just inside.
          const corner = (s: HitShape): [number, number] => [
            rect(s).range - 0.02,
            sd * (rect(s).width / 2 - 0.02),
          ];
          expect(hits('commander', 'main', boosted, corner, ang)).toBe(true);
        }
      });
    }
  }

  it('Reach lengthens the bash and Heavy Bash widens it, in the preview', () => {
    const base = rect(shapeOf(setup('commander', false), 'main'));
    expect(rect(shapeOf(setup('commander', 'reach'), 'main')).range).toBeGreaterThan(base.range);
    const wide = rect(shapeOf(setup('commander', 'heavy_bash'), 'main'));
    expect(wide.width).toBeCloseTo(base.width * 1.2, 9);
    expect(wide.range).toBeCloseTo(base.range, 9);
  });

  for (const boosted of [false, true]) {
    it(`ranger super${boosted ? ' (with a mod)' : ''}: the circle's edge`, () => {
      const rad = (s: HitShape) => (s.kind === 'circle' ? s.radius : NaN) + R;
      const a = 30 * DEG;
      expect(hits('ranger', 'super', boosted, (s) => polar(rad(s) - 0.02, a))).toBe(true);
      expect(hits('ranger', 'super', boosted, (s) => polar(rad(s) + 0.02, a))).toBe(false);
    });
  }

  for (const [cls, boosted] of [
    ['ranger', false],
    ['ranger', true],
  ] as const) {
    it(`${cls} main${boosted ? ' (with a mod)' : ''}: bolts fly the preview's reach and fan`, () => {
      const h = setup(cls, boosted);
      const s = shapeOf(h, 'main');
      const t0 = h.sim.world.tick;
      h.pads[0]!.tap('mainFires', { mainAim: AIM });
      h.run(1);
      const bolts = h.sim.world.projectiles.filter((b) => b.source === h.p(0).id);
      expect(bolts.length).toBe(DEFS[cls].main.count ?? 1);
      const fan = Math.max(...bolts.map((b) => Math.abs(Math.atan2(b.vy, b.vx))));
      expect(fan).toBeCloseTo(s.kind === 'cone' ? s.half : 0, 9);
      const reach = s.kind === 'line' || s.kind === 'cone' ? s.range : NaN;
      for (const b of bolts) {
        const perStep = Math.hypot(b.vx, b.vy) / 60;
        // Bolts expire on the first step at or past the reach (state.ts `fire`).
        expect((b.expiresAt - t0) * perStep).toBeGreaterThanOrEqual(reach - 1e-9);
        expect((b.expiresAt - t0 - 2) * perStep).toBeLessThan(reach);
      }
    });
  }

  for (const boosted of [false, true]) {
    it(`artificer main${boosted ? ' (with a mod)' : ''}: every nanite stays inside the preview`, () => {
      const h = setup('artificer', boosted);
      const s = shapeOf(h, 'main');
      if (s.kind !== 'cone') throw new Error('the nanite blast previews as a cone');
      const seen = new Map<number, { angle: number; flight: number }>();
      h.pads[0]!.tap('mainFires', { mainAim: AIM });
      for (let i = 0; i < 60; i++) {
        h.run(1);
        for (const b of h.sim.world.projectiles) {
          if (b.source !== h.p(0).id || seen.has(b.id)) continue;
          const flight = ((b.expiresAt - h.sim.world.tick) * Math.hypot(b.vx, b.vy)) / 60;
          seen.set(b.id, { angle: Math.abs(Math.atan2(b.vy, b.vx)), flight });
        }
      }
      expect(seen.size).toBe(artificer.main.count);
      for (const b of seen.values()) {
        expect(b.angle).toBeLessThanOrEqual(s.half + 1e-9);
        // Its random spot: within the preview's reach, never short of the minimum (a step's slack).
        const step = artificer.main.speed / 60;
        expect(b.flight).toBeLessThanOrEqual(s.range + step);
        expect(b.flight).toBeGreaterThanOrEqual(s.range * artificer.main.burstMinReach - 2 * step);
      }
    });
  }
});
