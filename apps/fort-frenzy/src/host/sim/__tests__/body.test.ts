// Body hitboxes (C4 note 2, FF10-fix-2; SPEC §9, §15.3): our attacks hit the drawn body, not just the
// feet. In the §2.5 view a part drawn h tiles above the feet sits over the ground h / 0.6 tiles up the
// screen, so a Ranger bolt aimed at an enemy's head crosses its body; arms, tails and the space past
// the head don't count, the Wasp is hit at its flight height, and the Colossus stays low.
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import { brute, colossus, engineer, grunt, rules } from '../../../content/balance';
import type { EnemyId } from '../../../shared/ids';
import { GROUND_SQUASH } from '../../../shared/projection';
import { circleHitsBody, groundBody, sectorHitsBody, segmentHitsBody } from '../body';
import { inSector } from '../classes/sector';
import type { EnemyEnt } from '../types';
import { harness, type Harness } from './harness';

const PX = 6;
const PY = 12;
const ROSTER: EnemyId[] = ['grunt', 'runner', 'swarm', 'brute', 'flyer', 'siege', 'hunter'];
const def = (id: EnemyId) => content.enemies.find((e) => e.id === id)!;

function combat(): Harness {
  const h = harness(1, 1);
  h.toCombat();
  h.holdSpawns();
  h.put(0, PX, PY);
  return h;
}

function still(h: Harness, kind: EnemyId, x: number, y: number): EnemyEnt {
  const e = h.sim.spawnEnemy(kind, x, y);
  e.stats.moveSpeed = 0;
  e.hp = e.maxHp = 1e6;
  return e;
}

/** A Ranger bolt fired along `aim` from (PX, PY); true when `e` took it. */
function shot(h: Harness, e: EnemyEnt, aim: { x: number; y: number }): boolean {
  h.pads[0]!.tap('mainFires', { mainAim: aim });
  h.run(60);
  return e.hp < e.maxHp;
}

/**
 * A bolt flying east along y = PY at the part drawn `height` tiles above the feet of a `kind`
 * standing 3 tiles away: its feet go `height` / 0.6 tiles below the line.
 */
function eastAt(kind: EnemyId, height: number): boolean {
  const h = combat();
  const e = still(h, kind, PX + 3, PY + height / GROUND_SQUASH);
  return shot(h, e, { x: 1, y: 0 });
}

describe('a Ranger shot at an enemy’s drawn body', () => {
  for (const kind of ROSTER) {
    const b = def(kind).body!;
    // Head height: near the top of the body (the Wasp: the middle of its hull, in flight).
    const head = b.bottom > 0 ? (b.bottom + b.top) / 2 : b.top * 0.9;
    it(`${kind}: aimed at head height (${head.toFixed(2)} tiles up) hits`, () => {
      // Above the feet: the old feet circle alone would have let it pass.
      expect(head / GROUND_SQUASH).toBeGreaterThan(def(kind).radius + rules.projectileRadius);
      expect(eastAt(kind, head)).toBe(true);
    });
    it(`${kind}: aimed clearly past the top of the body misses`, () => {
      expect(eastAt(kind, b.top + 0.35)).toBe(false);
    });
  }

  it('the Wasp is hit at its flight height, not at its shadow', () => {
    expect(eastAt('flyer', 0)).toBe(false);
    expect(eastAt('flyer', def('flyer').body!.bottom + 0.05)).toBe(true);
  });

  it('a shot down the screen at a head lands there, before the feet', () => {
    const h = combat();
    const e = still(h, 'grunt', PX, PY + 5);
    h.pads[0]!.tap('mainFires', { mainAim: { x: 0, y: 1 } });
    const top = PY + 5 - grunt.body.top / GROUND_SQUASH;
    // It hits on the step it reaches the top of the body (the bolt is 0.12 thick).
    const steps = h.until(() => e.hp < e.maxHp, 60);
    const travelled = (steps * engineer.main.speed) / 60;
    expect(PY + travelled).toBeGreaterThan(top - rules.projectileRadius - 0.3);
    expect(PY + travelled).toBeLessThan(top + 0.3);
  });
});

describe('arms and tails are left out', () => {
  // Bodies are symmetric about the feet, so whichever way it faces its weapon side is this one.
  it('a bolt up the screen past the Drone’s head, through its blade arm only, misses', () => {
    // The blade arm reaches 0.6 tiles in front of its feet (rigs/drone.json, arm-near), the head 0.45.
    const h = combat();
    const e = still(h, 'grunt', PX + 0.62, PY - 3);
    expect(shot(h, e, { x: 0, y: -1 })).toBe(false);
    const h2 = combat();
    const e2 = still(h2, 'grunt', PX + 0.3, PY - 3);
    expect(shot(h2, e2, { x: 0, y: -1 })).toBe(true);
  });

  it('a bolt through the Brute’s ram fist only (0.9 tiles out) misses', () => {
    expect(groundBody(brute.body).r + rules.projectileRadius).toBeLessThan(0.75);
    const h = combat();
    const e = still(h, 'brute', PX - 0.8, PY - 3);
    expect(shot(h, e, { x: 0, y: -1 })).toBe(false);
  });
});

describe('the Colossus keeps its hitbox low (C4)', () => {
  const OLD_R = colossus.radius;

  function lone(): Harness {
    const h = harness(1, 5);
    h.sim.command({ c: 'debug', slot: -1, action: 'jumpWave', wave: 5 });
    h.run(1);
    h.toCombat();
    h.holdSpawns();
    for (const e of h.sim.world.enemies) e.hp = 0;
    h.put(0, PX, PY);
    return h;
  }
  function colossusAt(height: number): boolean {
    const h = lone();
    const e = still(h, 'colossus', PX + 5, PY + height / GROUND_SQUASH);
    return shot(h, e, { x: 1, y: 0 });
  }

  it('is bigger than its old feet circle in both width and height', () => {
    const b = groundBody(colossus.body);
    expect(b.r).toBeGreaterThan(OLD_R);
    expect(b.hi + b.r).toBeGreaterThan(OLD_R * 1.3);
    // Its shins (above where the old circle ended) take a hit.
    const shin = (OLD_R + rules.projectileRadius + 0.15) * GROUND_SQUASH;
    expect(colossusAt(shin)).toBe(true);
  });

  it('stops well below its drawn head: a shot at its head or chest misses', () => {
    expect(colossusAt(1.2)).toBe(false);
    expect(colossusAt(1.8)).toBe(false);
  });
});

describe('body geometry (body.ts)', () => {
  const b = groundBody({ radius: 0.4, bottom: 0, top: 1.2 });
  const flat = groundBody({ radius: 0.3, bottom: 0, top: 0 });

  it('sweeps the circle up the screen to the drawn top', () => {
    expect(b.lo).toBe(0);
    expect(b.hi + b.r).toBeCloseTo(1.2 / GROUND_SQUASH, 9);
    const fly = groundBody({ radius: 0.4, bottom: 1.2, top: 1.5 });
    expect(fly.lo).toBeCloseTo(2, 9);
    expect(fly.hi).toBeCloseTo(2.1, 9);
  });

  it('a body flat at its feet is the old feet circle', () => {
    expect(flat).toEqual({ r: 0.3, lo: 0, hi: 0 });
    // Shot segments: closest approach at the same t as the circle test.
    expect(segmentHitsBody(0, 0, 2, 0, 1, 0.35, flat, 0.1)).toBeCloseTo(0.5, 9);
    expect(segmentHitsBody(0, 0, 2, 0, 1, 0.45, flat, 0.1)).toBe(-1);
    expect(circleHitsBody(0, 0, 1, 1.29, 0, flat)).toBe(true);
    expect(circleHitsBody(0, 0, 1, 1.31, 0, flat)).toBe(false);
    const sec = { x: 0, y: 0, angle: 0, half: 0.5, range: 1 };
    for (const [x, y] of [
      [1.25, 0],
      [1.35, 0],
      [0.6, 0.6],
      [0.6, 0.75],
    ] as const)
      expect(sectorHitsBody(sec, x, y, flat)).toBe(inSector(sec, x, y, 0.3));
  });

  it('a shot crossing the body above the feet hits; past its top it misses', () => {
    const top = b.hi + b.r;
    expect(segmentHitsBody(0, -top + 0.05, 2, 0, 1, 0, b, 0)).toBeGreaterThan(0);
    expect(segmentHitsBody(0, -top - 0.05, 2, 0, 1, 0, b, 0)).toBe(-1);
    // Sideways: within the radius only.
    expect(segmentHitsBody(1.39, 1, 0, -3, 1, 0, b, 0)).toBeGreaterThan(0);
    expect(segmentHitsBody(1.41, 1, 0, -3, 1, 0, b, 0)).toBe(-1);
  });

  it('a cone or circle reaching only the head still hits', () => {
    // The body's feet are out of reach; its head (up the screen) is inside.
    const sec = { x: 0, y: 0, angle: Math.PI / 2, half: 0.4, range: 1.2 };
    expect(inSector(sec, 0, 2, b.r)).toBe(false);
    expect(sectorHitsBody(sec, 0, 2, b)).toBe(true);
    expect(sectorHitsBody(sec, 0, 4, b)).toBe(false);
    expect(circleHitsBody(0, 0, 1, 0, 2, b)).toBe(true);
    expect(circleHitsBody(0, 0, 1, 0, 4, b)).toBe(false);
  });
});
