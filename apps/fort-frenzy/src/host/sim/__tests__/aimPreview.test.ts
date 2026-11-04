// Aim previews (SPEC §10.1, §15.2; FF7-fix-2, C3): for every class's main and super the preview's
// geometry is the content's numbers through the player's modifiers, and the sim hits exactly the
// previewed area (probes just inside and just past the reach and the edge, with and without a mod).
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import { commander, engineer, quartermaster, warden } from '../../../content/characters';
import { grunt } from '../../../content/enemies';
import type { CharacterDef } from '../../../content/types';
import type { CardId, ClassId } from '../../../shared/ids';
import { windupSteps } from '../classes/warden';
import { aimPreview } from '../preview';
import type { HitShape } from '../classes/hitShape';
import type { Modifier } from '../types';
import { harness } from './harness';

const DEG = Math.PI / 180;
const DEFS: Record<ClassId, CharacterDef> = { engineer, quartermaster, commander, warden };
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
  ],
};

/** `true` adds `BOOST`; a card id picks that real card (FF12) before combat. */
type Boost = boolean | CardId;

function setup(cls: ClassId, boosted: Boost) {
  const h = harness(1, 1, { classes: [cls] });
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

describe('preview geometry is the content through modifiers', () => {
  it('matches each class kit with no mods', () => {
    const expected: Record<ClassId, Record<'main' | 'super', HitShape>> = {
      engineer: {
        main: { kind: 'line', range: engineer.main.range },
        super: { kind: 'circle', radius: engineer.super.radius },
      },
      quartermaster: {
        main: {
          kind: 'cone',
          range: quartermaster.main.range,
          half: (quartermaster.main.spreadDeg / 2) * DEG,
        },
        super: {
          kind: 'cone',
          range: quartermaster.super.range,
          half: (quartermaster.super.arcDeg / 2) * DEG,
        },
      },
      commander: {
        main: {
          kind: 'cone',
          range: commander.main.range,
          half: (commander.main.arcDeg / 2) * DEG,
        },
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
        expect(shapeOf(h, slot).kind, `${cls} ${slot}`).not.toBe('none');
      }
    }
  });

  it('moves with a mod (and with Steady Aim, the Ranger passive)', () => {
    const h = setup('warden', true);
    const s = cone(shapeOf(h, 'super'));
    expect(s.range).toBeCloseTo(warden.super.range * 1.3, 9);
    expect(s.half).toBeCloseTo(((warden.super.arcDeg + 12) / 2) * DEG, 9);
    const r = setup('engineer', false);
    expect(shapeOf(r, 'main')).toEqual({ kind: 'line', range: engineer.main.range });
    r.pads[0]!.set({ move: { x: 0, y: 0 } });
    r.run(40); // past Steady Aim's 600 ms
    const steady = shapeOf(r, 'main');
    expect(steady.kind === 'line' && steady.range).toBeCloseTo(
      engineer.main.range * (1 + (engineer.passive.params.rangePct as number)),
      9,
    );
  });
});

describe('the sim hits exactly the previewed area', () => {
  const arcs: [ClassId, 'main' | 'super'][] = [
    ['warden', 'main'],
    ['warden', 'super'],
    ['commander', 'main'],
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

  // FF7-fix-3: the Warden's slam and the Commander's slash are aimed, so the previewed sector turns
  // with the phone's aim and the hit turns with it.
  for (const cls of ['warden', 'commander'] as const) {
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

  // FF12's slam and slash cards (Heavy Slam, Bladework: +20% arc, main only) and Reach move the
  // aimed preview with the hit.
  for (const [cls, card] of [
    ['warden', 'heavy_slam'],
    ['commander', 'bladework'],
    ['warden', 'reach'],
    ['commander', 'reach'],
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

  for (const boosted of [false, true]) {
    it(`engineer super${boosted ? ' (with a mod)' : ''}: the circle's edge`, () => {
      const rad = (s: HitShape) => (s.kind === 'circle' ? s.radius : NaN) + R;
      const a = 30 * DEG;
      expect(hits('engineer', 'super', boosted, (s) => polar(rad(s) - 0.02, a))).toBe(true);
      expect(hits('engineer', 'super', boosted, (s) => polar(rad(s) + 0.02, a))).toBe(false);
    });
  }

  for (const boosted of [false, true]) {
    it(`artificer super${boosted ? ' (with a mod)' : ''}: towers inside the cone get the bonus`, () => {
      const probe = (at: (s: HitShape, r: number) => [number, number]) => {
        const h = setup('quartermaster', boosted);
        const st = h.sim.place('arrow_tower', 10, 14, 0);
        const [dx, dy] = at(shapeOf(h, 'super'), st.r);
        h.put(0, st.x - dx, st.y - dy);
        fire(h, 'super');
        return st.effects.some((e) => e.def === 'tower_defense');
      };
      expect(probe((s, r) => [cone(s).range + r - 0.02, 0])).toBe(true);
      expect(probe((s, r) => [cone(s).range + r + 0.02, 0])).toBe(false);
      const d = (s: HitShape) => cone(s).range * 0.6;
      const edge = (s: HitShape, r: number) => cone(s).half + Math.asin(r / d(s));
      expect(probe((s, r) => polar(d(s), edge(s, r) - 0.02))).toBe(true);
      expect(probe((s, r) => polar(d(s), edge(s, r) + 0.02))).toBe(false);
    });
  }

  for (const [cls, boosted] of [
    ['engineer', false],
    ['engineer', true],
    ['quartermaster', false],
    ['quartermaster', true],
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
});
