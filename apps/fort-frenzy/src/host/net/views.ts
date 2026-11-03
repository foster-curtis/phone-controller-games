// Phone state sync (SPEC §15.6): the full `team` and per-phone `me` snapshots, built from the party
// (lobby, presence) and the sim's world (the run). Pure: no relay, no clock.
import type { Content } from '../../content';
import type { ClassId, EnemyId, PlayerColorId, StructureId } from '../../shared/ids';
import {
  RUN_STAT_KEYS,
  type ArcSlot,
  type MeAction,
  type MeView,
  type RunStats,
  type RunSummary,
  type TeamPhase,
  type TeamView,
} from '../../shared/messages';
import type { Member, Party } from '../party';
import { placementValid, tileAt } from '../sim';
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
  const sc = ctx.content.scaling;
  const n = w.players.filter((p) => p.connected).length;
  const mult = (sc ? sc.base + sc.perPlayer * n : 1) * (diff?.budget ?? 1);
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
  const phase = teamPhase(w);
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
    wave: w?.wave ?? 0,
    buildEndsInMs: w && w.phase === 'build' ? msLeft(w) : null,
    coins: w?.team.coins ?? 0,
    baseHp: w ? Math.ceil(w.base.hp) : 0,
    baseMaxHp: w ? w.base.maxHp : 0,
    theme: ctx.settings.theme,
    difficulty: ctx.settings.difficulty,
    leaderId: party.leaderId,
    roster,
    // Shop purchases beyond crates arrive with FF12; only the content's rows are shown.
    shop: content.shop.map((s) => {
      const tier = w?.team.shop[s.id] ?? 0;
      const maxTier = s.repeatable ? 0 : s.tiers.length;
      const next = s.repeatable ? s.tiers[0] : s.tiers[tier];
      return {
        id: s.id,
        tier,
        maxTier,
        price: next ? next.price : null,
        visible: true,
        qmOnly: s.qmOnly ?? false,
        holdToConfirm: s.holdToConfirm ?? false,
      };
    }),
    wishlist: (w?.team.wishlist ?? []).map((x) => ({ item: x.item, by: playerIdOfSlot(x.slot) })),
    nextWave: w && (w.phase === 'build' || w.phase === 'countdown') ? nextWave(ctx, w) : null,
    summary: phase === 'summary' ? ctx.summary : null,
  };
}

const tileKind = (w: World, x: number, y: number) => {
  const c = Math.floor(x);
  const r = Math.floor(y);
  if (c < 0 || r < 0 || c >= w.grid.cols || r >= w.grid.rows) return null;
  return w.grid.kinds[r * w.grid.cols + c] ?? null;
};

const dist = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);

/** The action button's icon (§10.1): the first matching row wins; the build phase has rows 1–4. */
export function actionFor(content: Content, w: World, p: PlayerEnt): MeAction {
  const def = content.characters.find((c) => c.id === p.classId);
  const rules = content.rules;
  if (!def || !rules || p.respawnAt !== null || !p.connected) return 'none';
  if (w.phase !== 'build' && w.phase !== 'combat') return 'none';
  const cap = def.carryCap;
  if (p.crates < cap) {
    const pile = w.cratePiles.some(
      (c) =>
        c.n > 0 &&
        !(c.lockedSlot === p.slot && w.tick < c.lockedUntil) &&
        dist(p.x, p.y, c.x, c.y) <= rules.pickupRadius,
    );
    if (pile) return 'pickup';
  }
  const kind = tileKind(w, p.x, p.y);
  if (p.crates > 0 && kind === 'repair' && w.base.hp > 0 && w.base.hp < w.base.maxHp)
    return 'deliver';
  if (kind === 'armory' && p.crates < cap) return 'buy';
  if (w.phase === 'combat' && def.build.length > 0 && p.crates > 0) return 'place';
  return 'none';
}

/** What Give does now: hand to the nearest teammate in reach with room, else drop (§10.1). */
export function giveFor(content: Content, w: World, p: PlayerEnt): 'give' | 'drop' | null {
  if (p.crates <= 0 || p.respawnAt !== null) return null;
  const reach = content.rules?.giveRadius ?? 0;
  const capOf = (q: PlayerEnt) => content.characters.find((c) => c.id === q.classId)?.carryCap ?? 0;
  const someone = w.players.some(
    (q) =>
      q !== p &&
      q.connected &&
      q.respawnAt === null &&
      q.crates < capOf(q) &&
      dist(p.x, p.y, q.x, q.y) <= reach,
  );
  return someone ? 'give' : 'drop';
}

const NO_CARDS: MeView['cards'] = { offer: null, picked: null, owned: [] };

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
    crates: 0,
    carryCap: 0,
    superCharge: 0,
    superReady: false,
    action: 'none',
    kits: 0,
    give: null,
    arc: null,
    buildKit: [],
    respawnMs: null,
    cards: NO_CARDS,
    build: null,
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
  if (screen !== 'run') return { ...base, screen: screen ?? 'name' };
  const p = playerOf(w, m);
  if (!w || !p) return { ...base, screen: 'waiting' };
  const def = content.characters.find((c) => c.id === p.classId);
  const kit: StructureId[] = def ? [...def.build] : [];
  const costOf = (id: StructureId) => content.structures.find((s) => s.id === id)?.cost ?? Infinity;
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
  const slots: ArcSlot[] = [kit[0] ?? null, kit[1] ?? null, kit[2] ?? null, 'give'];
  return {
    ...base,
    screen: meScreen,
    slot: p.slot,
    ready: w.phase === 'build' ? p.ready : m.ready,
    hp: Math.ceil(p.hp),
    maxHp: p.maxHp,
    crates: p.crates,
    carryCap: def?.carryCap ?? 0,
    superCharge: Math.min(1, Math.round(p.superCharge * 100) / 100),
    superReady: p.superCharge >= 1,
    action: actionFor(content, w, p),
    kits: p.kits,
    give: giveFor(content, w, p),
    arc:
      kit.length > 0
        ? {
            slots,
            enabled: slots.map((s) =>
              s === null ? false : s === 'give' ? p.crates > 0 : costOf(s) <= p.crates,
            ),
          }
        : null,
    buildKit: kit,
    respawnMs: dead ? Math.max(0, Math.round((p.respawnAt! - w.tick) * STEP_MS)) : null,
    cards: NO_CARDS,
    build:
      w.phase === 'build'
        ? {
            selected: p.ghost,
            valid: p.ghost === null ? null : placementValid(w, p.ghost, tileAt(p.x, p.y), p.slot),
          }
        : null,
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
