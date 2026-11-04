// Aim previews (SPEC §10.1, §15.2; FF7-fix-2, C3): for every class's main and super the preview's
// geometry is the content's numbers through the player's modifiers, and the sim hits exactly the
// previewed area (probes just inside and just past the reach and the edge, with and without a mod).
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import { commander, engineer, quartermaster, warden } from '../../../content/characters';
import { grunt } from '../../../content/enemies';
import type { CharacterDef } from '../../../content/types';
import type { ClassId } from '../../../shared/ids';
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

function setup(cls: ClassId, boosted: boolean) {
  const h = harness(1, 1, { classes: [cls] });
  h.toCombat();
  h.holdSpawns();
  h.put(0, PX, PY);
  // Break Steady Aim (a moving stick) so the Ranger's numbers are his base ones.
  h.pads[0]!.set({ move: { x: 0.001, y: 0 } });
  h.run(1);
  h.put(0, PX, PY);
  if (boosted) h.p(0).mods.push(BOOST);
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

function fire(h: ReturnType<typeof setup>, slot: 'main' | 'super') {
  const p = h.p(0);
  if (slot === 'super') {
    p.superCharge = 1;
    h.pads[0]!.tap('superFires', { superAim: AIM });
  } else {
    h.pads[0]!.tap('mainFires', { mainAim: AIM });
  }
  h.run(2 + windupSteps(DEFS[p.classId][slot]));
}

/** Fires at a lone Grunt placed by `at` (from the preview shape); true when it took damage. */
function hits(
  cls: ClassId,
  slot: 'main' | 'super',
  boosted: boolean,
  at: (s: HitShape) => [number, number],
): boolean {
  const h = setup(cls, boosted);
  const [dx, dy] = at(shapeOf(h, slot));
  const e = h.sim.spawnEnemy('grunt', PX + dx, PY + dy);
  e.stats.moveSpeed = 0;
  const hp0 = e.hp;
  fire(h, slot);
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
