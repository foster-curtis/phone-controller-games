// Resume snapshot (SPEC §11.5, §15.8): versioned JSON in localStorage, written at the start of each
// build phase and on every run-state change during it. No RNG state: every stream derives from
// (seed, label), so a restored card offer is identical.
// Frozen at FF1 (BUILD_PLAN §3): the `RunSnapshot` shape takes additive changes only (new optional
// fields); a breaking change bumps `v`, and an old snapshot is then discarded.
// FF14 added `SnapshotStructure.owner` and `RunSnapshot.runMs`, and the take / parse / restore
// functions. Plain TS like the rest of the sim: the host passes the wall clock and does the storage.
import type { Content } from '../../content';
import {
  CARD_IDS,
  CLASS_IDS,
  DIFFICULTY_IDS,
  PLAYER_COLOR_IDS,
  SHOP_ITEM_IDS,
  STRUCTURE_IDS,
  THEME_IDS,
  isOneOf,
  type CardId,
  type ClassId,
  type DifficultyId,
  type PlayerColorId,
  type ShopItemId,
  type StructureId,
  type ThemeId,
} from '../../shared/ids';
import { RUN_STAT_KEYS, type RunStats } from '../../shared/messages';
import { fortifyTower } from './building';
import { attachAllCards } from './cards';
import { extraDischarges, refitBase } from './shop';
import { fillSquads } from './squad';
import { newAttack, zeroRunStats, type FullState } from './state';
import type { RunStart, World } from './types';

export const SNAPSHOT_VERSION = 1;
/** localStorage key (survives a browser crash, unlike sessionStorage). */
export const SNAPSHOT_KEY = 'fort-frenzy:run';
/** Older snapshots are discarded. */
export const SNAPSHOT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

export interface SnapshotStructure {
  id: StructureId;
  tile: [number, number];
  /** null for snares (no HP). */
  hp: number | null;
  dischargesUsed?: number;
  fortified?: boolean;
  /** FF14: the builder's slot (owner-scoped cards and kits read it). */
  owner?: number;
}

export interface SnapshotSlot {
  slot: number;
  playerKey: string;
  deviceId: string;
  name: string;
  color: PlayerColorId;
  classId: ClassId;
  hp: number;
  crates: number;
  /** Emergency kits held (Quartermaster, 0 or 1). */
  kits: number;
  lastBuilt: StructureId | null;
  cards: Partial<Record<CardId, number>>;
  offer: CardId[] | null;
  picked: CardId | null;
  stats: RunStats;
  /** Commander only. `veterans` per soldier index; the rally flag's tile position. */
  squad?: { size: number; veterans: number[]; flag: [number, number] | null };
}

export interface RunSnapshot {
  v: typeof SNAPSHOT_VERSION;
  /** Wall-clock ms (host only; the sim never reads it). */
  savedAt: number;
  /** Commit hash: replays and snapshots are tied to the build. */
  build: string;
  settings: { theme: ThemeId; difficulty: DifficultyId; seed: number };
  wave: number;
  base: { hp: number; repairs: number };
  coins: number;
  /** Tier owned (archer upgrades: 0 or 1 each). */
  shop: Record<ShopItemId, number>;
  structures: SnapshotStructure[];
  cratePiles: { x: number; y: number; n: number }[];
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
  const extra = extraDischarges(content, world.team);
  const structures: SnapshotStructure[] = world.structures.map((st) => {
    const def = content.structures.find((d) => d.id === st.kind);
    const out: SnapshotStructure = {
      id: st.kind,
      tile: [st.tile[0], st.tile[1]],
      hp: st.damageable ? st.hp : null,
      owner: st.owner,
    };
    if (st.discharges !== null)
      out.dischargesUsed = Math.max(0, (def?.discharges ?? 0) + extra - st.discharges);
    if (st.fortified) out.fortified = true;
    return out;
  });
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
        crates: p.crates,
        kits: p.kits,
        lastBuilt: p.lastBuilt,
        cards: { ...p.cards },
        offer: p.offer ? [...p.offer] : null,
        picked: p.picked,
        stats: { ...p.run },
      };
      if (content.characters.find((c) => c.id === p.classId)?.squad) {
        const mine = world.soldiers.filter((u) => u.owner === p.slot);
        const veterans: number[] = [];
        for (const u of mine) {
          while (veterans.length <= u.index) veterans.push(0);
          veterans[u.index] = u.veterans;
        }
        out.squad = { size: mine.length, veterans, flag: p.flag ? [p.flag.x, p.flag.y] : null };
      }
      return out;
    });
  return {
    v: SNAPSHOT_VERSION,
    savedAt: meta.savedAt,
    build: meta.build,
    settings: {
      theme: world.settings.theme,
      difficulty: world.settings.difficulty,
      seed: world.seed,
    },
    wave: world.wave,
    base: { hp: world.base.hp, repairs: world.base.repairs },
    coins: world.team.coins,
    shop: { ...world.team.shop },
    structures,
    cratePiles: world.cratePiles.filter((c) => c.n > 0).map((c) => ({ x: c.x, y: c.y, n: c.n })),
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
const isTile = (v: unknown) => Array.isArray(v) && v.length === 2 && v.every(isNat);

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
    isNat(v.crates) &&
    isNat(v.kits) &&
    (v.lastBuilt === null || isOneOf(STRUCTURE_IDS, v.lastBuilt)) &&
    isObj(v.cards) &&
    Object.entries(v.cards).every(([k, n]) => isOneOf(CARD_IDS, k) && isNat(n)) &&
    (v.offer === null || (Array.isArray(v.offer) && v.offer.every((c) => isOneOf(CARD_IDS, c)))) &&
    (v.picked === null || isOneOf(CARD_IDS, v.picked)) &&
    isObj(st) &&
    RUN_STAT_KEYS.every((k) => isNum(st[k]))
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
    isOneOf(THEME_IDS, set.theme) &&
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
    Array.isArray(v.structures) &&
    v.structures.every(
      (s) =>
        isObj(s) &&
        isOneOf(STRUCTURE_IDS, s.id) &&
        isTile(s.tile) &&
        (s.hp === null || isNum(s.hp)),
    ) &&
    Array.isArray(v.cratePiles) &&
    v.cratePiles.every((c) => isObj(c) && isNum(c.x) && isNum(c.y) && isNat(c.n)) &&
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
    settings: { theme: snap.settings.theme, difficulty: snap.settings.difficulty },
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
 * as it was saved (§11.5): team, base, shop, structures, crates, every slot's cards, offer and stats,
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

  // Structures, in their saved (build) order; `placeStructure` fits the team's upgrades.
  for (const x of snap.structures) {
    if (x.id === 'fortify') continue;
    const st = s.placeStructure(x.id, x.tile[0], x.tile[1], x.owner ?? -1);
    if (x.fortified) fortifyTower(s, st);
    if (st.damageable && x.hp !== null) st.hp = Math.min(st.maxHp, Math.max(1, x.hp));
    if (st.discharges !== null && x.dischargesUsed)
      st.discharges = Math.max(0, st.discharges - x.dischargesUsed);
  }
  if (w.fields.dirty) s.rebuildFields();

  for (const c of snap.cratePiles) {
    if (c.n > 0)
      w.cratePiles.push({
        id: w.nextId++,
        x: c.x,
        y: c.y,
        n: c.n,
        lockedSlot: null,
        lockedUntil: 0,
      });
  }

  // Players: cards first (a Vitality stack raises max HP), then the saved HP.
  for (const sl of snap.slots) {
    const p = s.player(sl.slot);
    if (!p) continue;
    p.cards = { ...sl.cards };
    attachAllCards(s, p);
    p.hp = sl.hp > 0 ? Math.min(p.maxHp, sl.hp) : p.maxHp;
    p.crates = sl.crates;
    p.kits = sl.kits;
    p.lastBuilt = sl.lastBuilt;
    p.offer = sl.offer ? [...sl.offer] : null;
    p.picked = sl.picked;
    p.run = { ...zeroRunStats(), ...sl.stats };
    p.flag = sl.squad?.flag ? { x: sl.squad.flag[0], y: sl.squad.flag[1] } : null;
  }
  w.team.wishlist = snap.wishlist
    .filter((x) => s.player(x.slot))
    .map((x) => ({ item: x.item, slot: x.slot }));

  // The build phase of the saved wave, its timer from the start.
  w.phase = 'build';
  w.phaseEndsAt = w.tick + cat.steps(cat.rules.buildCapMs);
  fillSquads(s);
  for (const u of w.soldiers) {
    const sl = snap.slots.find((x) => x.slot === u.owner);
    u.veterans = sl?.squad?.veterans[u.index] ?? 0;
  }
}
