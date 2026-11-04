// FF7-fix-3 (C3 follow-up, SPEC §8, §10.1): the Warden's slam and the Commander's slash are aimed. An
// aimed release lands the arc in the phone's aim direction (an enemy there is hit, one behind is not);
// a quick tap (aim 0,0) auto-aims at the nearest enemy in range, else swings straight ahead; holding
// the aim only sets the TV's preview vector and fires nothing.
import { describe, expect, it } from 'vitest';
import { commander, warden } from '../../../content/balance';
import type { EnemyEnt } from '../types';
import { windupSteps } from '../classes/warden';
import { harness } from './harness';

const PX = 10;
const PY = 13;
const CLASSES = { warden, commander } as const;

function setup(cls: keyof typeof CLASSES) {
  const h = harness(1, 1, { classes: [cls] });
  h.toCombat();
  h.holdSpawns();
  h.put(0, PX, PY);
  h.p(0).facing = 0;
  // Park the Commander's squad far away so only his own attack lands.
  for (const u of h.sim.world.soldiers) {
    u.x = 30;
    u.y = 20;
    u.stats.moveSpeed = 0;
  }
  return h;
}

function grunt(h: ReturnType<typeof setup>, dx: number, dy: number): EnemyEnt {
  const e = h.sim.spawnEnemy('grunt', PX + dx, PY + dy);
  e.stats.moveSpeed = 0;
  return e;
}

const fireMain = (
  h: ReturnType<typeof setup>,
  cls: keyof typeof CLASSES,
  aim: { x: number; y: number },
) => {
  h.pads[0]!.tap('mainFires', { mainAim: aim, mainAiming: false });
  h.run(2 + windupSteps(CLASSES[cls].main));
};

describe('aimed melee mains (FF7-fix-3)', () => {
  for (const cls of ['warden', 'commander'] as const) {
    const reach = CLASSES[cls].main.range * 0.6;

    for (const [label, ax, ay] of [
      ['down-field', 0, 1],
      ['up-left', -0.6, -0.8],
      ['behind his facing', -1, 0],
    ] as const) {
      it(`${cls}: an aimed release (${label}) hits the enemy in the aim and misses one behind`, () => {
        const h = setup(cls);
        const ahead = grunt(h, ax * reach, ay * reach);
        const behind = grunt(h, -ax * reach, -ay * reach);
        const hp0 = ahead.hp;
        fireMain(h, cls, { x: ax, y: ay });
        expect(ahead.hp).toBeLessThan(hp0);
        expect(behind.hp).toBe(behind.maxHp);
        expect(h.p(0).facing).toBeCloseTo(Math.atan2(ay, ax), 6);
      });
    }

    it(`${cls}: a quick tap (aim 0,0) auto-aims at the nearest enemy in range`, () => {
      const h = setup(cls);
      // Behind his facing (+x): only auto-aim finds it.
      const e = grunt(h, -reach, 0);
      fireMain(h, cls, { x: 0, y: 0 });
      expect(e.hp).toBeLessThan(e.maxHp);
    });

    it(`${cls}: a quick tap with nothing in range swings straight ahead`, () => {
      const h = setup(cls);
      h.p(0).facing = Math.PI / 2;
      fireMain(h, cls, { x: 0, y: 0 });
      expect(h.p(0).facing).toBeCloseTo(Math.PI / 2, 9);
    });

    it(`${cls}: holding the aim sets the TV's preview vector and fires nothing`, () => {
      const h = setup(cls);
      const e = grunt(h, 0, reach);
      h.pads[0]!.set({ mainAim: { x: 0, y: 1 }, mainAiming: true });
      h.run(20);
      expect(h.p(0).mainAim).toEqual({ x: 0, y: 1 });
      expect(e.hp).toBe(e.maxHp);
      // Cancel: the phone drops the flag with no fire.
      h.pads[0]!.set({ mainAim: { x: 0, y: 0 }, mainAiming: false });
      h.run(20);
      expect(h.p(0).mainAim).toBeNull();
      expect(e.hp).toBe(e.maxHp);
    });
  }
});
