// Phone state sync (SPEC §15.6): the full `team` and per-phone `me` snapshots, built from the party
// (lobby, presence) and the sim's world (the run). Pure: no relay, no clock.
import type { Content } from '../../content';
import type { ActIconId, BuildId, CardId, ClassId, EnemyId, PlayerColorId } from '../../shared/ids';
import {
  GROWTH_STATS,
  RUN_STAT_KEYS,
  type MeBuild,
  type MeGrowth,
  type MeView,
  type RunStats,
  type RunSummary,
  type TeamPause,
  type TeamPhase,
  type TeamView,
} from '../../shared/messages';
import type { Member, Party } from '../party';
import { canPlace, itemState } from '../sim';
import { STEP_MS, type PlayerEnt, type RunSettings, type World } from '../sim/types';

export type FfParty = Party<PlayerColorId, ClassId>;
export type FfMember = Readonly<Member<PlayerColorId, ClassId>>;

export interface ViewCtx {
  party: FfParty;
  content: Content;
  settings: RunSettings;
  /** The run's world, null in the lobby. */
  world: World | null;
  summary: RunSummary | null;
  /** A saved run waits for Resume or New run (§11.5, FF14). */
  restoring?: { wave: number; savedAt: number } | null;
  /** A player paused the run (FF14-fix-1). */
  paused?: TeamPause | null;
}

const msLeft = (w: World) =>
  w.phaseEndsAt === null ? null : Math.max(0, Math.round((w.phaseEndsAt - w.tick) * STEP_MS));

export function teamPhase(world: World | null): TeamPhase {
  if (!world) return 'lobby';
  switch (world.phase) {
    case 'countdown':
      return 'countdown';
    case 'build':
      return 'build';
    case 'summary':
      return 'summary';
    default:
      return 'combat';
  }
}

/** The sim player of a party member (by run slot), or null. */
export function playerOf(world: World | null, m: FfMember | null): PlayerEnt | null {
  if (!world || !m || m.slot === null) return null;
  return world.players.find((p) => p.slot === m.slot) ?? null;
}

/** Enemy counts the next wave is expected to bring (estimate from its budget, §4 preview). */
function nextWave(ctx: ViewCtx, w: World): TeamView['nextWave'] {
  const def = ctx.content.waves.find((x) => x.n === w.wave);
  if (!def) return null;
  const diff = ctx.content.difficulties.find((d) => d.id === ctx.settings.difficulty);
  const n = Math.min(6, Math.max(1, w.players.filter((p) => p.connected).length));
  const row = ctx.content.scaling.find((r) => r.players === n);
  const mult = (row?.budget ?? 1) * (diff?.budget ?? 1);
  const types = def.allowed.length || 1;
  const enemies = def.allowed.map((id) => {
    const e = ctx.content.enemies.find((x) => x.id === id);
    const per = (def.budget * mult) / types / Math.max(0.01, e?.budget ?? 1);
    const g = def.guaranteed.filter((x) => x.enemy === id).reduce((s, x) => s + x.count, 0);
    return { id, count: Math.max(g, Math.round(per)) * (e?.groupSize ?? 1) };
  });
  return { enemies, boss: def.boss !== undefined };
}

export function teamView(ctx: ViewCtx): TeamView {
  const { party, content, world: w } = ctx;
  const phase: TeamPhase = ctx.restoring ? 'restoring' : teamPhase(w);
  const roster = party.members.map((m) => {
    const p = playerOf(w, m);
    return {
      playerId: m.playerId,
      name: m.name,
      color: m.color,
      classId: m.classId,
      ready: phase === 'build' && p ? p.ready : m.ready,
      connected: m.connected,
    };
  });
  const playerIdOfSlot = (slot: number) =>
    party.members.find((m) => m.slot === slot)?.playerId ?? String(slot);
  return {
    phase,
    wave: w?.wave ?? ctx.restoring?.wave ?? 0,
    buildEndsInMs: w && w.phase === 'build' ? msLeft(w) : null,
    coins: w?.team.coins ?? 0,
    baseHp: w ? Math.ceil(w.base.hp) : 0,
    baseMaxHp: w ? w.base.maxHp : 0,
    difficulty: ctx.settings.difficulty,
    leaderId: party.leaderId,
    roster,
    // The team shop (§6.2, FF12): the sim's own visibility and price rules.
    shop: content.shop.map((s) => {
      const st = w ? itemState(content, w, s) : null;
      const maxTier = s.repeatable ? 0 : s.tiers.length;
      return {
        id: s.id,
        tier: st?.tier ?? 0,
        maxTier,
        price: st ? st.price : (s.tiers[0]?.price ?? null),
        visible: st?.visible ?? false,
        holdToConfirm: st?.holdToConfirm ?? s.holdToConfirm ?? false,
      };
    }),
    wishlist: (w?.team.wishlist ?? []).map((x) => ({ item: x.item, by: playerIdOfSlot(x.slot) })),
    nextWave: w && (w.phase === 'build' || w.phase === 'countdown') ? nextWave(ctx, w) : null,
    summary: phase === 'summary' ? ctx.summary : null,
    // Only while paused, so a running team snapshot is unchanged (FF14-fix-1).
    ...(ctx.paused && w ? { paused: { ...ctx.paused } } : {}),
  };
}

/** The build button's icon per build (§10.1, mirrors presentation `iconFor.build`). */
const BUILD_ICON: Record<BuildId, ActIconId> = {
  shield_gen: 'act-shield',
  mine: 'act-mine',
  beacon: 'act-beacon',
  rally_flag: 'act-flag',
};

/**
 * The build button (§10.1): the meter ring, and what a release does now. Full meter → place; else a
 * Commander with his flag out → recall (a tap, `act-recall`); else dimmed. Builds only in combat.
 */
export function buildFor(content: Content, w: World, p: PlayerEnt): MeBuild {
  const knight = content.knights.find((k) => k.id === p.classId);
  const id: BuildId = knight?.build ?? 'shield_gen';
  const b = { id, input: knight?.input.build ?? 'tap', icon: BUILD_ICON[id] };
  const full = p.meter >= 1;
  // A build without a behavior yet can't be placed (sim/builds; its kit milestone adds it).
  const able = w.phase === 'combat' && p.respawnAt === null && p.connected;
  const placeable = full && canPlace(id);
  const recall = !full && p.classId === 'commander' && p.flag !== null;
  return {
    id: b.id,
    input: recall ? 'tap' : b.input,
    icon: recall ? 'act-recall' : b.icon,
    meter: Math.min(1, Math.max(0, Math.round(p.meter * 100) / 100)),
    full,
    mode: !able ? 'none' : placeable ? 'place' : recall ? 'recall' : 'none',
    active: w.builds.filter((x) => x.owner === p.slot).length,
  };
}

/**
 * The card pop-up's class growth header (§6.1, §10.2): "Wave 4 cleared: +HP +DMG", the stats the
 * knight's class grew for the wave just cleared (a boss wave's `boss` list, else `regular`). Null
 * before wave 1, for a knight with no bump yet (a late joiner, §15.11 #99), or when the class grows
 * none of the header's stats. The sim's bumps (`PlayerEnt.growth`) and the content lists are RD11's.
 */
export function growthFor(content: Content, w: World, p: PlayerEnt): MeGrowth | null {
  if (w.wave <= 1 || p.growth.regular + p.growth.boss === 0) return null;
  const role = content.knights.find((k) => k.id === p.classId)?.role;
  const cls = content.classes.find((c) => c.id === role);
  if (!cls) return null;
  const boss =
    content.waves.find((x) => x.n === w.wave - 1)?.boss !== undefined && p.growth.boss > 0;
  const mods = boss ? cls.growth.boss : cls.growth.regular;
  const stats = GROWTH_STATS.filter((st) =>
    mods.some((m) => m.stat === st && ((m.addPct ?? 0) > 0 || (m.add ?? 0) > 0)),
  );
  return stats.length > 0 ? { wave: w.wave - 1, boss, stats: [...stats] } : null;
}

const NO_CARDS: MeView['cards'] = { offer: null, picked: null, owned: [], growth: null };

export function blankMe(screen: MeView['screen']): MeView {
  return {
    screen,
    slot: null,
    name: '',
    color: null,
    classId: null,
    isLeader: false,
    ready: false,
    hp: 0,
    maxHp: 0,
    superCharge: 0,
    superReady: false,
    superBlocked: false,
    build: null,
    respawnMs: null,
    cards: NO_CARDS,
    claim: null,
  };
}

/** One phone's view; `m` null = not in the party (full, or before hello). */
export function meView(ctx: ViewCtx, m: FfMember | null, full = false): MeView {
  if (!m) return blankMe(full ? 'full' : 'name');
  const { party, content, world: w } = ctx;
  const base: MeView = {
    ...blankMe('name'),
    name: m.name,
    color: m.color,
    classId: m.classId,
    isLeader: party.isLeader(m.playerId),
    ready: m.ready,
  };
  const screen = party.screen(m.playerId);
  // Resume into a new room (§15.8, FF14): an unknown phone picks one of the free slots.
  if (screen === 'claim') {
    return {
      ...base,
      screen: 'claim',
      claim: party
        .claimable()
        .flatMap((c) =>
          c.slot !== null && c.classId !== null
            ? [{ slot: c.slot, name: c.name, classId: c.classId }]
            : [],
        ),
    };
  }
  // A saved run waits for Resume or New run: every phone shows "TV is restoring…" (§15.8).
  if (ctx.restoring) return { ...base, screen: 'restoring', slot: m.slot };
  if (screen !== 'run') return { ...base, screen: screen ?? 'name' };
  const p = playerOf(w, m);
  if (!w || !p) return { ...base, screen: 'waiting' };
  const dead = p.respawnAt !== null;
  const meScreen: MeView['screen'] =
    w.phase === 'countdown'
      ? 'lobby'
      : w.phase === 'build'
        ? 'build'
        : w.phase === 'summary'
          ? 'summary'
          : dead
            ? 'dead'
            : 'combat';
  return {
    ...base,
    screen: meScreen,
    slot: p.slot,
    ready: w.phase === 'build' ? p.ready : m.ready,
    hp: Math.ceil(p.hp),
    maxHp: p.maxHp,
    superCharge: Math.min(1, Math.round(p.superCharge * 100) / 100),
    superReady: p.superCharge >= 1,
    // The Commander at his squad cap (RD9).
    superBlocked: false,
    build: buildFor(content, w, p),
    respawnMs: dead ? Math.max(0, Math.round((p.respawnAt! - w.tick) * STEP_MS)) : null,
    // Private card offer and owned stacks (§6.1, FF12).
    cards: {
      offer: w.phase === 'build' && p.offer ? [...p.offer] : null,
      picked: w.phase === 'build' ? p.picked : null,
      owned: (Object.keys(p.cards) as CardId[])
        .filter((id) => (p.cards[id] ?? 0) > 0)
        .map((id) => ({ id, n: p.cards[id]! })),
      // Class growth header (§6.1, §10.2): the build phase only.
      growth: w.phase === 'build' ? growthFor(content, w, p) : null,
    },
  };
}

/** The stat a player's award card celebrates: the first they lead the team in (§4). */
export function awardFor(me: RunStats, all: readonly RunStats[]): keyof RunStats | null {
  for (const k of RUN_STAT_KEYS) {
    if (k === 'damageTaken' || k === 'deaths') continue;
    if (me[k] > 0 && all.every((o) => o[k] <= me[k])) return k;
  }
  return null;
}

/** The end-of-run summary (§4) from the world and the party. */
export function buildSummary(
  w: World,
  party: FfParty,
  result: 'victory' | 'defeat',
  durationMs: number,
): RunSummary {
  const stats = w.players.map((p) => p.run);
  return {
    result,
    wavesSurvived: result === 'victory' ? w.wave : Math.max(0, w.wave - 1),
    durationMs,
    players: w.players.map((p) => ({
      playerId: party.members.find((m) => m.slot === p.slot)?.playerId ?? String(p.slot),
      name: p.name,
      color: p.color,
      classId: p.classId,
      stats: { ...p.run },
      award: awardFor(p.run, stats),
    })),
  };
}

/** Enemy types that first appear in wave `n` (the build preview frames them in violet, §2.6). */
export function newEnemies(content: Content, n: number): EnemyId[] {
  const def = content.waves.find((x) => x.n === n);
  if (!def) return [];
  const before = new Set(content.waves.filter((x) => x.n < n).flatMap((x) => x.allowed));
  return def.allowed.filter((id) => !before.has(id));
}
