// Resume snapshot (SPEC §11.5, §15.8): versioned JSON in localStorage, written at the start of each
// build phase and on every run-state change during it. No RNG state: every stream derives from
// (seed, label), so a restored card offer is identical.
// Frozen after RD2 (REDESIGN_BUILD_PLAN §3): the `RunSnapshot` shape takes additive changes only (new
// optional fields); a breaking change bumps `v`, and an old snapshot is then discarded. RD2's shape
// (v3): builds (the rally flag is one), meters, growth, soldiers' HP and Veterans gains. Plain TS like the rest of the sim: the host passes the wall clock and does the storage.
import type { Content } from '../../content';
import {
  BUILD_IDS,
  CARD_IDS,
  CLASS_IDS,
  DIFFICULTY_IDS,
  PLAYER_COLOR_IDS,
  SHOP_ITEM_IDS,
  isOneOf,
  type BuildId,
  type CardId,
  type ClassId,
  type DifficultyId,
  type PlayerColorId,
  type ShopItemId,
} from '../../shared/ids';
import { RUN_STAT_KEYS, type RunStats } from '../../shared/messages';
import { attachAllCards } from './cards';
import { refitBase } from './shop';
import { postOf, refitSoldier, seedSquads } from './squad';
import { newAttack, zeroRunStats, type FullState } from './state';
import type { BuildEnt, RunStart, World } from './types';

export const SNAPSHOT_VERSION = 3; // 3: RD2's shape (builds, meters, run stats); old saves are dropped
/** localStorage key (survives a browser crash, unlike sessionStorage). */
export const SNAPSHOT_KEY = 'fort-frenzy:run';
/** Older snapshots are discarded. */
export const SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/** A build on the map (§7): HP builds keep their HP, mines their charges; the rally flag is one. */
export interface SnapshotBuild {
  kind: BuildId;
  /** The knight's slot. */
  owner: number;
  /** Placement order (the oldest mine goes first). */
  seq: number;
  /** Tiles (builds don't snap, §7.1). */
  x: number;
  y: number;
  /** HP builds; null for mines and the flag. */
  hp: number | null;
  /** Mines; null otherwise. */
  charges: number | null;
}

export interface SnapshotSlot {
  slot: number;
  playerKey: string;
  deviceId: string;
  name: string;
  color: PlayerColorId;
  classId: ClassId;
  hp: number;
  /** Build meter 0..1. */
  meter: number;
  growth: { regular: number; boss: number };
  cards: Partial<Record<CardId, number>>;
  offer: CardId[] | null;
  picked: CardId | null;
  stats: RunStats;
  /**
   * Commander only: each surviving soldier's HP and Veterans gains, by index. The flag is a
   * SnapshotBuild (`rally_flag`).
   */
  squad?: { soldiers: { hp: number; veterans: number }[] };
}

export interface RunSnapshot {
  v: typeof SNAPSHOT_VERSION;
  /** Wall-clock ms (host only; the sim never reads it). */
  savedAt: number;
  /** Commit hash: replays and snapshots are tied to the build. */
  build: string;
  settings: { difficulty: DifficultyId; seed: number };
  wave: number;
  base: { hp: number; repairs: number };
  coins: number;
  /** Tier owned (sentry upgrades: 0 or 1 each). Max HP follows the base_hp tiers. */
  shop: Record<ShopItemId, number>;
  builds: SnapshotBuild[];
  slots: SnapshotSlot[];
  leaderKey: string | null;
  wishlist: { item: ShopItemId; slot: number }[];
  /** FF14: run time (wall ms) before this save, so the summary's duration spans a resume. */
  runMs?: number;
}

// ---- take ---------------------------------------------------------------------------------------

/** What the host knows and the world doesn't: identities, the leader, the clock and the build. */
export interface SnapshotMeta {
  savedAt: number;
  build: string;
  runMs: number;
  leaderKey: string | null;
  /** Reconnect identity of the slot's phone (§15.8). */
  ids(slot: number): { playerKey: string; deviceId: string };
}

/** The run state a resume needs, from a world in its build phase (§11.5). */
export function takeSnapshot(world: World, content: Content, meta: SnapshotMeta): RunSnapshot {
  const slots: SnapshotSlot[] = [...world.players]
    .sort((a, b) => a.slot - b.slot)
    .map((p) => {
      const ids = meta.ids(p.slot);
      const out: SnapshotSlot = {
        slot: p.slot,
        playerKey: ids.playerKey,
        deviceId: ids.deviceId,
        name: p.name,
        color: p.color,
        classId: p.classId,
        hp: p.hp,
        meter: p.meter,
        growth: { ...p.growth },
        cards: { ...p.cards },
        offer: p.offer ? [...p.offer] : null,
        picked: p.picked,
        stats: { ...p.run },
      };
      if (content.knights.find((c) => c.id === p.classId)?.squad) {
        // By index; a fallen soldier's slot stays at 0 HP (no respawn, §8.4).
        const soldiers: { hp: number; veterans: number }[] = [];
        for (const u of world.soldiers) {
          if (u.owner !== p.slot) continue;
          while (soldiers.length <= u.index) soldiers.push({ hp: 0, veterans: 0 });
          soldiers[u.index] = { hp: u.hp, veterans: u.veterans };
        }
        out.squad = { soldiers };
      }
      return out;
    });
  return {
    v: SNAPSHOT_VERSION,
    savedAt: meta.savedAt,
    build: meta.build,
    settings: {
      difficulty: world.settings.difficulty,
      seed: world.seed,
    },
    wave: world.wave,
    base: { hp: world.base.hp, repairs: world.base.repairs },
    coins: world.team.coins,
    shop: { ...world.team.shop },
    builds: [
      // A build in flight is saved where it was headed (§15.8).
      ...world.builds.map((b) => ({
        kind: b.kind,
        owner: b.owner,
        seq: b.seq,
        x: b.flight ? b.flight.to.x : b.x,
        y: b.flight ? b.flight.to.y : b.y,
        hp: b.targetable ? b.hp : null,
        charges: b.charges,
      })),
    ],
    slots,
    leaderKey: meta.leaderKey,
    wishlist: world.team.wishlist.map((x) => ({ item: x.item, slot: x.slot })),
    runMs: meta.runMs,
  };
}

// ---- parse --------------------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNat = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;
const isStr = (v: unknown): v is string => typeof v === 'string';

function isSlot(v: unknown): v is SnapshotSlot {
  if (!isObj(v)) return false;
  const st = v.stats;
  return (
    isNat(v.slot) &&
    isStr(v.playerKey) &&
    isStr(v.deviceId) &&
    isStr(v.name) &&
    isOneOf(PLAYER_COLOR_IDS, v.color) &&
    isOneOf(CLASS_IDS, v.classId) &&
    isNum(v.hp) &&
    isNum(v.meter) &&
    isObj(v.growth) &&
    isNat(v.growth.regular) &&
    isNat(v.growth.boss) &&
    isObj(v.cards) &&
    Object.entries(v.cards).every(([k, n]) => isOneOf(CARD_IDS, k) && isNat(n)) &&
    (v.offer === null || (Array.isArray(v.offer) && v.offer.every((c) => isOneOf(CARD_IDS, c)))) &&
    (v.picked === null || isOneOf(CARD_IDS, v.picked)) &&
    isObj(st) &&
    RUN_STAT_KEYS.every((k) => isNum(st[k])) &&
    (v.squad === undefined ||
      (isObj(v.squad) &&
        Array.isArray(v.squad.soldiers) &&
        v.squad.soldiers.every((x) => isObj(x) && isNum(x.hp) && isNat(x.veterans))))
  );
}

/**
 * A stored snapshot, or null when it's missing, unreadable, another version or older than 12 h
 * (§15.8: those are discarded).
 */
export function parseSnapshot(raw: string | null, now: number): RunSnapshot | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isObj(v) || v.v !== SNAPSHOT_VERSION) return null;
  if (!isNum(v.savedAt) || now - v.savedAt > SNAPSHOT_MAX_AGE_MS) return null;
  const set = v.settings;
  const base = v.base;
  const ok =
    isStr(v.build) &&
    isObj(set) &&
    isOneOf(DIFFICULTY_IDS, set.difficulty) &&
    isNum(set.seed) &&
    Number.isInteger(v.wave) &&
    (v.wave as number) >= 1 &&
    isObj(base) &&
    isNum(base.hp) &&
    isNat(base.repairs) &&
    isNum(v.coins) &&
    isObj(v.shop) &&
    Object.entries(v.shop).every(([k, n]) => isOneOf(SHOP_ITEM_IDS, k) && isNat(n)) &&
    Array.isArray(v.builds) &&
    v.builds.every(
      (b) =>
        isObj(b) &&
        isOneOf(BUILD_IDS, b.kind) &&
        isNat(b.owner) &&
        isNat(b.seq) &&
        isNum(b.x) &&
        isNum(b.y) &&
        (b.hp === null || isNum(b.hp)) &&
        (b.charges === null || isNat(b.charges)),
    ) &&
    Array.isArray(v.slots) &&
    v.slots.length > 0 &&
    v.slots.every(isSlot) &&
    (v.leaderKey === null || isStr(v.leaderKey)) &&
    Array.isArray(v.wishlist) &&
    v.wishlist.every((w) => isObj(w) && isOneOf(SHOP_ITEM_IDS, w.item) && isNat(w.slot));
  return ok ? (v as unknown as RunSnapshot) : null;
}

// ---- restore ------------------------------------------------------------------------------------

/** The `RunStart` of a resumed run: the snapshot's settings and slots, and the snapshot itself. */
export function resumeStart(snap: RunSnapshot, connected: (slot: number) => boolean): RunStart {
  return {
    seed: snap.settings.seed,
    settings: { difficulty: snap.settings.difficulty },
    slots: snap.slots.map((s) => ({
      slot: s.slot,
      name: s.name,
      color: s.color,
      classId: s.classId,
      connected: connected(s.slot),
    })),
    snapshot: snap,
  };
}

/**
 * Puts a fresh world (`createState` from `resumeStart`) into the build phase of the snapshot's wave
 * as it was saved (§11.5): team, base, shop, structures, every slot's cards, offer and stats,
 * squads. Positions, cooldowns and the build timer start over: knights stand at the base, and the
 * build phase gets its full time (BUILD_PLAN §8).
 */
export function restoreSnapshot(s: FullState, snap: RunSnapshot): void {
  const w = s.world;
  const cat = s.cat;
  w.wave = snap.wave;
  w.team.coins = snap.coins;
  for (const id of SHOP_ITEM_IDS) w.team.shop[id] = snap.shop[id] ?? 0;

  // Base: the team's archers and upgrades, then the saved HP.
  const archers = cat.base.archers;
  let count = archers.count;
  for (const def of cat.content.shop) {
    if (def.repeatable) continue;
    const owned = Math.min(w.team.shop[def.id], def.tiers.length);
    for (const t of def.tiers.slice(0, owned))
      if (t.effect.kind === 'archers') count += t.effect.add;
  }
  count = Math.min(count, archers.at.length);
  while (w.base.archers.count < count) {
    w.base.archers.count++;
    w.base.archers.attack.push(newAttack());
    w.base.archers.aim.push(Math.PI / 2);
  }
  w.base.repairs = snap.base.repairs;
  refitBase(s);
  w.base.hp = Math.min(w.base.maxHp, Math.max(0, snap.base.hp));

  // Builds, in their saved order (the flag back on its Commander). Their HP waits for the cards below.
  const savedHp: [BuildEnt, number][] = [];
  for (const x of snap.builds) {
    const owner = s.player(x.owner);
    if (!owner) continue;
    const b = s.addBuild(x.kind, x.x, x.y, x.owner);
    b.seq = x.seq;
    if (x.kind === 'rally_flag') owner.flag = { x: x.x, y: x.y };
    if (b.charges !== null && x.charges !== null) b.charges = x.charges;
    if (b.targetable && x.hp !== null) savedHp.push([b, x.hp]);
  }

  // Players: cards first (a Vitality stack raises max HP), then the saved HP.
  for (const sl of snap.slots) {
    const p = s.player(sl.slot);
    if (!p) continue;
    p.cards = { ...sl.cards };
    attachAllCards(s, p);
    p.hp = sl.hp > 0 ? Math.min(p.maxHp, sl.hp) : p.maxHp;
    p.meter = Math.min(1, Math.max(0, sl.meter));
    p.growth = { ...sl.growth };
    p.offer = sl.offer ? [...sl.offer] : null;
    p.picked = sl.picked;
    p.run = { ...zeroRunStats(), ...sl.stats };
  }
  // A build's max HP follows its owner's cards (Booster Beacon), as it did when placed.
  for (const [b, hp] of savedHp) {
    const base = cat.build(b.kind).hp ?? b.maxHp;
    const max = s.attackStat(s.player(b.owner)!, base, 'buildHp', 'build');
    b.maxHp = b.stats.maxHp = max;
    s.baseStats.get(b.id)!.maxHp = max;
    b.hp = Math.min(max, Math.max(1, hp));
  }
  w.team.wishlist = snap.wishlist
    .filter((x) => s.player(x.slot))
    .map((x) => ({ item: x.item, slot: x.slot }));

  // The build phase of the saved wave, its timer from the start.
  w.phase = 'build';
  w.phaseEndsAt = w.tick + cat.steps(cat.rules.buildCapMs);
  // Exactly the soldiers who were alive (no respawn, §8.4), with their HP (#103) and Veterans gains.
  for (const sl of snap.slots) {
    const p = s.player(sl.slot);
    if (!p || !sl.squad) continue;
    p.squadSeeded = true;
    const def = cat.knight(p.classId).squad;
    if (!def) continue;
    const mode = p.flag ? 'rally' : 'follow';
    const n = sl.squad.soldiers.filter((x) => x.hp > 0).length;
    let k = 0;
    sl.squad.soldiers.forEach((saved, i) => {
      if (saved.hp <= 0) return;
      // Back around him, or at his flag (§15.8).
      const at = postOf(p, def, mode, k++, n) ?? p;
      const u = s.addSoldier(p.slot, at.x, at.y, i);
      u.mode = mode;
      u.veterans = saved.veterans;
      refitSoldier(s, p, u);
      // Unclipped: a Veterans gain lands on the first step's stat refresh, which clamps to it.
      u.hp = saved.hp;
    });
  }
  // A Commander saved before he got his start (a late join in the same step) gets it now.
  seedSquads(s);
}
