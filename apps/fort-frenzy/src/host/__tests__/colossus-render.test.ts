// FF11: the Colossus's TV side stays in step with the sim (SPEC §9.2, §9.6): the clips' impact,
// release and kneel times equal the content's wind-ups, every clip names real rig parts, the walk
// swaps the legs' draw order, the look helpers (tiers, head, core by stagger), and the boss bar.
import { describe, expect, it } from 'vitest';
import rig from '../../../art/neon-knights/rigs/colossus.json';
import { colossus as def } from '../../content/balance';
import {
  clips,
  COLOSSUS_CALL_MS,
  COLOSSUS_ORDERS,
  COLOSSUS_SLAM_MS,
  COLOSSUS_STAGGER_MS,
  COLOSSUS_THROW_MS,
} from '../render/clips/colossus';
import {
  CLIP_OF_ACT,
  colossusGroupsFor,
  coreHz,
  coreLook,
  headTarget,
  spiresFor,
} from '../render/colossusLook';
import { tuning } from '../sim/boss/colossus';
import { bossBar } from '../tv';
import { harness } from '../sim/__tests__/harness';

const T = tuning(def);
const parts = new Set(Object.keys(rig.views.side.parts));

describe('Colossus clips', () => {
  it('land, release and kneel on the sim’s wind-ups', () => {
    expect(COLOSSUS_SLAM_MS).toBe(def.attack.windupMs);
    expect(COLOSSUS_THROW_MS).toBe(T.boulderWindupMs);
    expect(COLOSSUS_CALL_MS).toBe(T.callWindupMs);
    expect(COLOSSUS_STAGGER_MS).toBe(T.staggerMs);
    expect(clips.stagger!.durationMs).toBe(T.staggerMs);
  });

  it('cover every attack, name only rig parts, and play once', () => {
    for (const clip of Object.values(CLIP_OF_ACT)) expect(clips[clip]).toBeDefined();
    for (const name of ['slam', 'throw', 'call', 'stagger']) {
      const c = clips[name]!;
      expect(c.loop).toBe(false);
      for (const p of Object.keys(c.tracks)) expect(parts, `${name}: ${p}`).toContain(p);
    }
  });

  it('walk swaps the leg order at the crossings', () => {
    const orders = clips.walk!.tracks.torso!.filter((k) => k.order).map((k) => k.order);
    expect(orders).toEqual([
      COLOSSUS_ORDERS.FAR_FRONT,
      COLOSSUS_ORDERS.NEAR_FRONT,
      COLOSSUS_ORDERS.FAR_FRONT,
    ]);
  });
});

describe('Colossus looks', () => {
  it('tiers stack: Mk I bare, Mk II, Mk III, then the final phase', () => {
    expect(colossusGroupsFor(1, false)).toEqual([]);
    expect(colossusGroupsFor(2, false)).toEqual(['mk2']);
    expect(colossusGroupsFor(3, false)).toEqual(['mk2', 'mk3']);
    expect(colossusGroupsFor(3, true)).toEqual(['mk2', 'mk3', 'final']);
    expect(spiresFor(1)).toEqual([]);
    expect(spiresFor(2)).toHaveLength(3);
    expect(spiresFor(3)).toHaveLength(5);
    for (const s of spiresFor(3)) expect(Object.keys(rig.views.side.attach)).toContain(s);
  });

  it('the head turns toward its aim, both ways', () => {
    expect(headTarget(Math.PI / 2).rot).toBeGreaterThan(0);
    expect(headTarget(-Math.PI / 2).rot).toBeLessThan(0);
    expect(headTarget(0).rot).toBeCloseTo(0, 6);
  });

  it('the core brightens and beats faster as the meter fills, and flares while staggered', () => {
    expect(coreHz(1)).toBeGreaterThan(coreHz(0.5));
    expect(coreHz(0.5)).toBeGreaterThan(coreHz(0));
    expect(coreLook(0.9, false, false, 0.5).level).toBeGreaterThan(
      coreLook(0.1, false, false, 0.5).level,
    );
    expect(coreLook(0, true, false, 0).flare).toBe(true);
    expect(coreLook(0, false, true, 0).r).toBeGreaterThan(coreLook(0, false, false, 0).r);
  });
});

describe('boss bar', () => {
  it('shows the living Colossus’s HP, Mk and stagger, and nothing without one', () => {
    const h = harness(2, 1);
    h.toCombat();
    h.holdSpawns();
    expect(bossBar(h.sim.world)).toBeNull();
    const b = h.sim.spawnEnemy('colossus', 18, 12);
    b.hp = 1234.4;
    expect(bossBar(h.sim.world)).toEqual({
      enemy: 'colossus',
      hp: 1235,
      maxHp: def.hp,
      mk: 1,
      staggered: false,
    });
    b.boss!.staggeredUntil = h.sim.world.tick + 10;
    expect(bossBar(h.sim.world)?.staggered).toBe(true);
    b.hp = 0;
    expect(bossBar(h.sim.world)).toBeNull();
  });
});
