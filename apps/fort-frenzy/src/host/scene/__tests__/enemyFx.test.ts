// FF10 enemy looks (SPEC §9.6, C2 note 2): every enemy rig has its walk, attack (tell), hit and
// death clips; each tell's strike lands on the content wind-up; tell glows, the Skitter throb by
// distance and enemy shots leaving from the weapon.
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import { sampleClip } from '../../render/clip';
import { BOMBARD_FIRE_MS, clips as bombard } from '../../render/clips/bombard';
import { BRUTE_STRIKE_MS, clips as brute } from '../../render/clips/brute';
import { DRONE_STRIKE_MS, clips as drone } from '../../render/clips/drone';
import { clips as mite, MITE_BITE_MS } from '../../render/clips/mite';
import { clips as skitter } from '../../render/clips/skitter';
import { clips as stalker, STALKER_LUNGE_MS } from '../../render/clips/stalker';
import { clips as wasp, WASP_FIRE_MS } from '../../render/clips/wasp';
import { PROJECTILE_SPEEDS } from '../../render/effectsMath';
import { chargeLevel, enemyShotPos, pulseHz, pulseLevel, TELL_GLOW } from '../enemyFx';

const enemy = (id: string) => content.enemies.find((e) => e.id === id)!;

describe('enemy clips', () => {
  const all = { drone, skitter, brute, bombard, wasp, mite, stalker };

  it('every enemy rig walks, attacks, flinches and dies', () => {
    for (const [rig, c] of Object.entries(all)) {
      for (const name of ['idle', 'walk', 'attack', 'hit', 'death']) {
        expect(c[name], `${rig}/${name}`).toBeDefined();
      }
      expect(c.attack!.loop).toBe(false);
    }
  });

  it('each tell lands its strike on the content wind-up', () => {
    expect(DRONE_STRIKE_MS).toBe(enemy('grunt').attack.windupMs);
    expect(BRUTE_STRIKE_MS).toBe(enemy('brute').attack.windupMs);
    expect(BOMBARD_FIRE_MS).toBe(enemy('siege').attack.windupMs);
    expect(WASP_FIRE_MS).toBe(enemy('flyer').attack.windupMs);
    expect(MITE_BITE_MS).toBe(enemy('swarm').attack.windupMs);
    expect(STALKER_LUNGE_MS).toBe(enemy('hunter').attack.windupMs);
  });

  it('the Brute rears its fist back before the ram; the Stalker crouches before the lunge', () => {
    const arm = (t: number) => sampleClip(brute.attack!, t).parts.get('arm-near')!.rot ?? 0;
    expect(arm(BRUTE_STRIKE_MS - 100)).toBeGreaterThan(20);
    expect(arm(BRUTE_STRIKE_MS + 20)).toBeLessThan(-20);
    const body = (t: number) => sampleClip(stalker.attack!, t).parts.get('body')!;
    expect(body(STALKER_LUNGE_MS - 40).dy).toBeGreaterThan(4);
    expect(body(STALKER_LUNGE_MS + 60).dx).toBeGreaterThan(8);
  });

  it('the Bombard plants and lifts its barrel through the charge', () => {
    const at = (t: number) => sampleClip(bombard.attack!, t).parts;
    expect(at(BOMBARD_FIRE_MS - 50).get('barrel')!.rot).toBeLessThan(-8);
    expect(at(BOMBARD_FIRE_MS - 50).get('body')!.dy).toBeGreaterThan(2);
  });
});

describe('tells and throbs', () => {
  it('a charge ramps up through the wind-up and is gone just after it', () => {
    expect(chargeLevel(0, 700)).toBe(0);
    expect(chargeLevel(350, 700)).toBeCloseTo(0.5, 5);
    expect(chargeLevel(700, 700)).toBe(1);
    expect(chargeLevel(900, 700)).toBe(0);
    expect(chargeLevel(100, 0)).toBe(0);
  });

  it('glows the rigs that wind up with a weapon or furnace', () => {
    // Brute (furnace), Siege (muzzle), Flyer (stinger), Hunter (eyes).
    expect(Object.keys(TELL_GLOW).sort()).toEqual(['bombard', 'brute', 'stalker', 'wasp']);
  });

  it('the Skitter core throbs faster as it nears the Citadel, never fully dark', () => {
    expect(pulseHz(30)).toBeLessThan(pulseHz(8));
    expect(pulseHz(8)).toBeLessThan(pulseHz(1));
    expect(pulseHz(0)).toBe(pulseHz(1));
    for (let p = 0; p < 2; p += 0.05) expect(pulseLevel(p)).toBeGreaterThanOrEqual(0.25);
    expect(pulseLevel(0)).toBe(1);
  });
});

describe('enemy shots leave from the weapon', () => {
  it('start at the muzzle and ease onto the sim path over the flight', () => {
    const s = {
      origin: { x: 10.4, y: 8, z: 2 },
      from: { x: 10, y: 8 },
      bornMs: 100,
      flightMs: 400,
      endZ: 0.5,
    };
    expect(enemyShotPos(s, 100, { x: 10, y: 8, z: 0 })).toEqual({ x: 10.4, y: 8, z: 2 });
    const end = enemyShotPos(s, 500, { x: 12, y: 9, z: 0 });
    expect(end.x).toBeCloseTo(12, 9);
    expect(end.y).toBeCloseTo(9, 9);
    expect(end.z).toBeCloseTo(0.5, 9);
  });

  it('the Wasp shot flies at the render speed', () => {
    expect(enemy('flyer').attack.speed).toBe(PROJECTILE_SPEEDS['wasp-shot']);
  });
});
