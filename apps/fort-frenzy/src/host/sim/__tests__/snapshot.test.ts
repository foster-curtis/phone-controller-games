// Resume snapshot (SPEC §11.5, §15.8, §15.9): a build phase saved and restored is the same run state
// (same state hash for every restore of it, and the same snapshot back), a restored card offer is
// identical, and stale or other-version snapshots are discarded.
import { describe, expect, it } from 'vitest';
import { content } from '../../../content';
import { memorySnapshotStore } from '../../net/resume';
import { createCatalog } from '../catalog';
import { offerFor } from '../cards';
import { createSim, stateHash, ScriptedInputSource, type Sim } from '../index';
import {
  parseSnapshot,
  resumeStart,
  SNAPSHOT_MAX_AGE_MS,
  SNAPSHOT_VERSION,
  takeSnapshot,
  type RunSnapshot,
  type SnapshotMeta,
} from '../snapshot';
import type { ClassId } from '../../../shared/ids';
import { harness } from './harness';

const CLASSES: ClassId[] = ['engineer', 'warden', 'quartermaster', 'commander'];

const meta: SnapshotMeta = {
  savedAt: 1_000_000,
  build: 'test',
  runMs: 90_000,
  leaderKey: 'key-0',
  ids: (slot) => ({ playerKey: `key-${slot}`, deviceId: `dev-${slot}` }),
};

/** Open tiles away from the edges, in scan order. */
function openTiles(sim: Sim, n: number): [number, number][] {
  const { cols, rows, kinds } = sim.world.grid;
  const out: [number, number][] = [];
  for (let r = 2; r < rows - 2 && out.length < n; r++)
    for (let c = 2; c < cols - 2 && out.length < n; c += 2)
      if (kinds[r * cols + c] === 'open') out.push([c, r]);
  return out;
}

/** A run in the build phase of wave 6 with a bit of everything a snapshot keeps. */
function busyBuild() {
  const h = harness(4, 11, { classes: CLASSES });
  const { sim } = h;
  h.toBuild();
  sim.command({ c: 'debug', slot: -1, action: 'jumpWave', wave: 6 });
  h.run(1);
  const w = sim.world;
  expect(w.phase).toBe('build');
  expect(w.wave).toBe(6);
  sim.command({ c: 'debug', slot: -1, action: 'coins', amount: 5000 });
  h.run(1);
  // Shop: whatever the team can buy now (tiers, archers, building upgrades).
  for (const item of [
    'archer_third',
    'archer_damage',
    'tower_hp',
    'wall_hp',
    'snare_charges',
  ] as const)
    sim.command({ c: 'buy', slot: 0, item });
  h.run(1);
  // Structures, one fortified, a used net, a damaged wall.
  const [a, b, c, d] = openTiles(sim, 4);
  const tower = sim.place('arrow_tower', a![0], a![1], 0);
  sim.place('wall', b![0], b![1], 1).hp -= 7;
  const net = sim.place('snare', c![0], c![1], 1);
  net.discharges! -= 1;
  sim.place('bomb_tower', d![0], d![1], 0);
  h.run(1);
  // Cards: slot 0 picks from its offer; the rest keep theirs open.
  const p0 = h.p(0);
  sim.command({ c: 'card', slot: 0, card: p0.offer![0]! });
  sim.command({ c: 'request', slot: 2, item: 'repair', on: true });
  h.run(1);
  // The Warden fortifies the arrow tower from the tile beside it.
  h.put(1, tower.tile[0] + 1.5, tower.tile[1] + 0.5);
  h.p(1).crates = 9;
  sim.command({ c: 'build', slot: 1, action: 'select', structure: 'fortify' });
  sim.command({ c: 'build', slot: 1, action: 'place' });
  h.run(1);
  expect(tower.fortified).toBe(true);
  // Things the commands can't easily reach in a test.
  w.base.hp -= 120;
  h.p(1).hp -= 30;
  h.p(2).crates = 2;
  h.p(2).kits = 1;
  h.p(3).flag = { x: 20.5, y: 14.5 };
  for (const u of w.soldiers) u.veterans = u.index;
  w.cratePiles.push({ id: w.nextId++, x: 12.25, y: 9.5, n: 3, lockedSlot: null, lockedUntil: 0 });
  h.p(1).run.kills = 9;
  // The scenario really holds each kind of state.
  expect(Object.values(w.team.shop).filter((n) => n > 0).length).toBeGreaterThanOrEqual(3);
  expect(p0.picked).not.toBeNull();
  expect(w.players.every((p) => p.offer?.length)).toBe(true);
  expect(w.soldiers.some((u) => u.veterans > 0)).toBe(true);
  expect(w.team.wishlist.length).toBe(1);
  return h;
}

const restore = (snap: RunSnapshot) =>
  createSim(
    resumeStart(snap, () => true),
    { content },
  );

describe('resume snapshot: round trip', () => {
  it('restores the build phase: the same snapshot back, the same hash every time', () => {
    const h = busyBuild();
    const snap = takeSnapshot(h.sim.world, content, meta);
    expect(snap.v).toBe(SNAPSHOT_VERSION);
    expect(snap.wave).toBe(6);
    expect(snap.structures.length).toBe(4);
    expect(snap.slots.find((s) => s.classId === 'commander')?.squad?.size).toBeGreaterThan(0);

    // Through JSON, as in localStorage.
    const stored = JSON.parse(JSON.stringify(snap)) as RunSnapshot;
    const a = restore(stored);
    expect(a.world.phase).toBe('build');
    expect(a.world.wave).toBe(6);
    expect(takeSnapshot(a.world, content, meta)).toEqual(snap);

    const b = restore(takeSnapshot(a.world, content, meta));
    expect(stateHash(b.world)).toBe(stateHash(a.world));
    expect(stateHash(restore(stored).world)).toBe(stateHash(a.world));
  });

  it('keeps the run state the snapshot holds', () => {
    const h = busyBuild();
    const w = h.sim.world;
    const r = restore(takeSnapshot(w, content, meta)).world;
    expect(r.team.coins).toBe(w.team.coins);
    expect(r.team.shop).toEqual(w.team.shop);
    expect(r.team.wishlist).toEqual(w.team.wishlist);
    expect(r.base.hp).toBe(w.base.hp);
    expect(r.base.maxHp).toBe(w.base.maxHp);
    expect(r.base.archers.count).toBe(w.base.archers.count);
    const shape = (x: typeof w) =>
      x.structures.map((s) => [s.kind, s.tile, s.hp, s.maxHp, s.discharges, s.fortified, s.owner]);
    expect(shape(r)).toEqual(shape(w));
    for (const p of w.players) {
      const q = r.players.find((x) => x.slot === p.slot)!;
      expect([q.hp, q.maxHp, q.crates, q.kits, q.cards, q.picked, q.run]).toEqual([
        p.hp,
        p.maxHp,
        p.crates,
        p.kits,
        p.cards,
        p.picked,
        p.run,
      ]);
    }
    expect(r.soldiers.map((u) => [u.owner, u.index, u.veterans])).toEqual(
      w.soldiers.map((u) => [u.owner, u.index, u.veterans]),
    );
    expect(r.cratePiles.map((c) => [c.x, c.y, c.n])).toEqual(
      w.cratePiles.map((c) => [c.x, c.y, c.n]),
    );
  });

  it('two restores of one snapshot play on identically', () => {
    const snap = takeSnapshot(busyBuild().sim.world, content, meta);
    const runs = [0, 1].map(() => {
      const pads = new Map(snap.slots.map((s) => [s.slot, new ScriptedInputSource()] as const));
      const sim = createSim(
        resumeStart(snap, () => true),
        { content, sources: pads },
      );
      for (const [slot, pad] of pads) pad.set({ move: { x: slot % 2 ? 1 : -1, y: 0.5 } });
      for (const p of sim.world.players) sim.command({ c: 'ready', slot: p.slot, ready: true });
      const hashes: number[] = [];
      for (let i = 0; i < 600; i++) {
        sim.step();
        if (i % 60 === 0) hashes.push(stateHash(sim.world));
      }
      return { hashes, phase: sim.world.phase };
    });
    expect(runs[0]!.phase).toBe('combat');
    expect(runs[1]!.hashes).toEqual(runs[0]!.hashes);
  });
});

describe('resume snapshot: card offers', () => {
  it('a restored offer is the saved one, and the seeded stream would deal it again', () => {
    const h = busyBuild();
    const w = h.sim.world;
    const r = restore(takeSnapshot(w, content, meta)).world;
    const cat = createCatalog(content, 'normal');
    for (const p of w.players) {
      const q = r.players.find((x) => x.slot === p.slot)!;
      expect(q.offer).toEqual(p.offer);
      // No reroll on a refresh: the (seed, wave, slot) stream deals the same cards (§15.8).
      if (p.picked === null) expect(offerFor(cat, r, q)).toEqual(p.offer);
    }
  });
});

describe('resume snapshot: discarding', () => {
  const good = () => JSON.stringify(takeSnapshot(busyBuild().sim.world, content, meta));

  it('parses a fresh snapshot', () => {
    expect(parseSnapshot(good(), meta.savedAt + 60_000)?.wave).toBe(6);
  });

  it('drops a snapshot older than 12 hours', () => {
    expect(parseSnapshot(good(), meta.savedAt + SNAPSHOT_MAX_AGE_MS)).not.toBeNull();
    expect(parseSnapshot(good(), meta.savedAt + SNAPSHOT_MAX_AGE_MS + 1)).toBeNull();
  });

  it('drops another version, garbage and bad shapes', () => {
    const other = { ...(JSON.parse(good()) as RunSnapshot), v: SNAPSHOT_VERSION + 1 };
    expect(parseSnapshot(JSON.stringify(other), meta.savedAt)).toBeNull();
    expect(parseSnapshot('{not json', meta.savedAt)).toBeNull();
    expect(parseSnapshot(null, meta.savedAt)).toBeNull();
    const bad = JSON.parse(good()) as { slots: { classId: string }[] };
    bad.slots[0]!.classId = 'wizard';
    expect(parseSnapshot(JSON.stringify(bad), meta.savedAt)).toBeNull();
  });

  it('the store removes what it discards', () => {
    const store = memorySnapshotStore(good());
    expect(store.load(meta.savedAt + SNAPSHOT_MAX_AGE_MS + 1)).toBeNull();
    expect(store.raw()).toBeNull();
  });
});
