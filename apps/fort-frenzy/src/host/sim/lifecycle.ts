// Steps 8–11 (SPEC §15.3): status effects and `onTick` hooks, deaths (coins, destroyed builds), the
// wave spawner with portal flares `rules.flareMs` ahead (the next pulse pulled forward when no enemy
// is left alive, RC3), and the phase checks: wave cleared, base destroyed, build timer and ready-up. Also the phase transitions the commands reuse.
import { tickEffects } from '../systems/effects';
import { PORTAL_IDS, SIDE_IDS, type PortalId, type SideId } from '../../shared/ids';
import { generateWave, waveRng } from '../systems/waves';
import { bossSpawn, collapseAfterBoss } from './boss';
import { autoPickCards, closeOffers, dealOffers } from './cards';
import { growKnights } from './growth';
import { clearWishlist } from './shop';
import { releaseAll, respawn } from './players';
import { effects as effectDefs } from './registry';
import { seedSquads } from './squad';
import type { FullState } from './state';
import { refreshStats } from './stats';
import type { EnemyEnt, Phase, PlayerEnt, Unit } from './types';

// ---- step 7: effects and hooks --------------------------------------------------------------------

function tickUnit(s: FullState, u: Unit) {
  if (u.effects.length > 0) {
    const before = u.effects.length;
    tickEffects(
      u.effects,
      (def) => {
        const dot = s.cat.rules.dots[def];
        return {
          stacking: effectDefs[def]?.stacking ?? 'refresh',
          tickEvery: dot ? s.cat.steps(dot.tickEveryMs) : undefined,
        };
      },
      (e) => {
        s.damage({
          source: e.source,
          target: u.id,
          amount: e.strength * e.stacks,
          kind: 'dot',
          tags: [e.def],
        });
      },
    );
    if (u.effects.length > 0 || before > 0)
      refreshStats(u, s.baseStats.get(u.id)!, effectDefs, s.caps);
  }
  for (const f of s.hooks(u, 'onTick')) f(s, u);
}

export function stepEffects(s: FullState): void {
  const w = s.world;
  for (const p of w.players) {
    if (p.respawnAt !== null) continue;
    tickUnit(s, p);
    // Players' stats follow their mods every step (passives such as Steady Aim toggle bonuses).
    refreshStats(p, s.baseStats.get(p.id)!, effectDefs, s.caps);
  }
  for (const u of w.soldiers) {
    if (u.hp <= 0) continue;
    tickUnit(s, u);
    // Squad modifiers (shop squad stats, Veterans, FF12) follow their state every step.
    if (u.mods.length > 0) refreshStats(u, s.baseStats.get(u.id)!, effectDefs, s.caps);
  }
  for (const e of w.enemies) if (e.hp > 0) tickUnit(s, e);
  for (const b of w.builds) if (b.effects.length > 0 || b.mods.length > 0) tickUnit(s, b);
}

// ---- step 8: deaths -------------------------------------------------------------------------------

function coinsFor(s: FullState, e: EnemyEnt, paid: Set<number>): number {
  // A Runner's burst is not a kill (FF10): it is its own killer and pays nothing.
  if (s.killers.get(e.id) === e.id) return 0;
  const groupLeft = s.world.enemies.some((o) => o !== e && o.group === e.group && o.hp > 0);
  // A group pays once, when its last unit dies (§9.1), even if several die in the same step.
  if (groupLeft || paid.has(e.group)) return 0;
  paid.add(e.group);
  // Kept fractional (RD11): a coin rate under 1 would round a Grunt's pay to 0. The views show whole
  // coins (net/views.ts), and a purchase needs the whole price. The player-count table's coin factor
  // (RD11-fix-1) comes from the row this wave started with, like its budget (§9.4, §11.3).
  const row = s.cat.playerCount(Math.max(1, s.world.team.scaling.players));
  return (
    s.cat.enemy(e.kind).budget * s.cat.rules.coinRate * s.cat.difficulty.coinIncome * row.coins
  );
}

export function stepDeaths(s: FullState): void {
  const w = s.world;
  const t = w.tick;
  // The boss's death ends the wave: the rest collapse (§9.2, FF11).
  collapseAfterBoss(s);
  // Enemies.
  let write = 0;
  const paid = new Set<number>();
  for (const e of w.enemies) {
    if (e.hp > 0) {
      w.enemies[write++] = e;
      continue;
    }
    w.team.coins += coinsFor(s, e, paid);
    let killerId = s.killers.get(e.id) ?? null;
    if (killerId === e.id) killerId = null; // a Runner's burst
    const killer = killerId === null ? null : (s.units.get(killerId) ?? null);
    if (killer && s.kinds.get(killer.id) === 'player') (killer as PlayerEnt).run.kills++;
    s.emit({ e: 'death', id: e.id, what: 'enemy', killer: killerId, x: e.x, y: e.y });
    for (const f of s.hooks(e, 'onDeath')) f(s, e, killer);
    if (killer) for (const f of s.hooks(killer, 'onKill')) f(s, killer, e);
    s.removeUnit(e.id);
  }
  w.enemies.length = write;

  // Players: respawn at the base after the respawn time (§5).
  for (const p of w.players) {
    if (p.respawnAt !== null || p.hp > 0) continue;
    const killerId = s.killers.get(p.id) ?? null;
    s.killers.delete(p.id);
    p.hp = 0;
    p.respawnAt = t + s.cat.steps(respawnMs(s, p));
    p.run.deaths++;
    releaseAll(s, p);
    p.push = null;
    s.emit({ e: 'death', id: p.id, what: 'player', killer: killerId, x: p.x, y: p.y });
    const killer = killerId === null ? null : (s.units.get(killerId) ?? null);
    for (const f of s.hooks(p, 'onDeath')) f(s, p, killer);
  }

  // HP builds at 0 are destroyed (§7.1): removed, `buildGone`.
  write = 0;
  for (const b of w.builds) {
    if (!b.targetable || b.hp > 0) {
      w.builds[write++] = b;
      continue;
    }
    s.dropBruteField(b);
    s.emit({ e: 'buildGone', build: b.id, kind: b.kind, destroyed: true });
    s.removeUnit(b.id);
  }
  w.builds.length = write;

  // Soldiers: the fallen collapse and don't come back; only Reinforcements adds more (§8.4).
  write = 0;
  for (const u of w.soldiers) {
    if (u.hp > 0) {
      w.soldiers[write++] = u;
      continue;
    }
    const killerId = s.killers.get(u.id) ?? null;
    s.emit({ e: 'death', id: u.id, what: 'soldier', killer: killerId, x: u.x, y: u.y });
    const killer = killerId === null ? null : (s.units.get(killerId) ?? null);
    for (const f of s.hooks(u, 'onDeath')) f(s, u, killer);
    s.removeUnit(u.id);
  }
  w.soldiers.length = write;
}

/**
 * A knight's respawn time (§5): the player-count table × difficulty (its base stat, set at each wave
 * start), less Quick Recovery's −2 s a stack, but never under 4 s solo / 5 s otherwise
 * (`rules.respawnFloorMs`); the floor never raises a respawn that is already shorter.
 */
export function respawnMs(s: FullState, p: PlayerEnt): number {
  const base = s.baseStats.get(p.id)?.respawnMs ?? p.stats.respawnMs;
  const floors = s.cat.rules.respawnFloorMs;
  const floor = s.world.team.scaling.players <= 1 ? floors.solo : floors.team;
  return Math.max(p.stats.respawnMs, Math.min(base, floor));
}

// ---- step 9: spawner ------------------------------------------------------------------------------

export function stepSpawner(s: FullState): void {
  const w = s.world;
  if (w.phase !== 'combat' || w.spawns.length === 0) return;
  const t = w.tick;
  const flare = s.cat.steps(s.cat.rules.flareMs);
  pullForward(s, t, flare);
  let write = 0;
  const flared: PortalId[] = [];
  for (const g of w.spawns) {
    // The portal flares about 1 s before it spawns a group (§3.1, §9.4); once per portal a step.
    if (!g.flared && t >= g.atTick - flare) {
      g.flared = true;
      if (!flared.includes(g.portal)) {
        flared.push(g.portal);
        s.emit({ e: 'portalFlare', portal: g.portal });
      }
    }
    if (t < g.atTick) {
      w.spawns[write++] = g;
      continue;
    }
    spawnGroup(s, g.enemy, g.portal, g.count);
  }
  w.spawns.length = write;
}

/**
 * No waiting on an empty map (RC3, §9.4): with no enemy alive and groups still to come, the next
 * pulse comes in now: it flares this step and spawns `flare` steps later, and every later pulse moves
 * by the same amount, keeping its spacing (portals, groups and hot sides stay as planned). Nothing
 * moves once the next pulse has flared. A plan held past the wave's duration (test and bench holds)
 * is left alone; every real pulse is due within it.
 */
function pullForward(s: FullState, t: number, flare: number): void {
  const w = s.world;
  for (const e of w.enemies) if (e.hp > 0) return;
  let next = Infinity;
  for (const g of w.spawns) if (g.atTick < next) next = g.atTick;
  const shift = next - flare - t;
  if (shift <= 0) return;
  const def = s.cat.wave(w.wave);
  if (!def || next - t > s.cat.steps(def.durationMs) + flare) return;
  for (const g of w.spawns) g.atTick -= shift;
}

/** `count` units of `enemy` just outside `portal`'s edge, spread across it (combat stream jitter). */
export function spawnGroup(s: FullState, enemy: EnemyEnt['kind'], portal: PortalId, count: number) {
  const L = s.cat.map.portals[portal];
  let ex = 0;
  let ey = 0;
  for (const [c, r] of L.entry) {
    ex += c + 0.5;
    ey += r + 0.5;
  }
  ex /= L.entry.length;
  ey /= L.entry.length;
  // Perpendicular to the way in.
  let px = -(ey - L.spawn.y);
  let py = ex - L.spawn.x;
  const pl = Math.sqrt(px * px + py * py) || 1;
  px /= pl;
  py /= pl;
  const rng = s.rng(`combat:${s.world.wave}`);
  // A pack (Swarm, groups of 8) scatters unevenly around the spawn point, never in rows (§9.6).
  const pack = (s.cat.enemy(enemy).groupSize ?? 1) > 1;
  let group: number | undefined;
  for (let i = 0; i < count; i++) {
    let x: number;
    let y: number;
    if (pack) {
      const a = rng.next() * Math.PI * 2;
      const d = 0.9 * Math.sqrt(rng.next());
      x = L.spawn.x + Math.cos(a) * d;
      y = L.spawn.y + Math.sin(a) * d;
    } else {
      const off = (i - (count - 1) / 2) * 0.7 + (rng.next() - 0.5) * 0.3;
      x = L.spawn.x + px * off;
      y = L.spawn.y + py * off;
    }
    const e = s.spawnEnemy(enemy, x, y, portal, group);
    group ??= e.id;
  }
}

// ---- step 10: phases ------------------------------------------------------------------------------

function setPhase(s: FullState, phase: Phase, endsIn: number | null) {
  const w = s.world;
  w.phase = phase;
  w.phaseEndsAt = endsIn === null ? null : w.tick + endsIn;
  s.emit({ e: 'phase', phase, wave: w.wave });
}

/** The build phase before wave `n`: the dead respawn at once (§5), the 20 s cap (§10.2). */
export function startBuild(s: FullState, n: number): void {
  const w = s.world;
  w.wave = n;
  w.projectiles.length = 0;
  w.markers.length = 0;
  for (const p of w.players) {
    p.ready = false;
    if (p.respawnAt !== null) respawn(s, p);
  }
  // A Commander's starting soldiers, once per run; the fallen don't come back (§8.4).
  seedSquads(s);
  // Each player's private pick of 3 upgrade cards (§6.1, FF12).
  dealOffers(s);
  setPhase(s, 'build', s.cat.steps(s.cat.rules.buildCapMs));
}

/** Combat for the current wave: scaling fixed from the players connected now (§9.4, §11.3). */
export function startCombat(s: FullState): void {
  const w = s.world;
  const cat = s.cat;
  const connected = w.players.filter((p) => p.connected);
  const ranged = connected.some((p) => cat.knight(p.classId).hitsFlyers);
  // The player-count table (§9.4), fixed from the players connected now (§11.3).
  const row = cat.playerCount(Math.max(1, connected.length));
  w.team.scaling = {
    players: connected.length,
    budget: row.budget,
    bossHp: row.bossHp,
    respawnMs: row.respawnMs * cat.difficulty.respawn,
    activeCap: Math.min(connected.length + 1, PORTAL_IDS.length),
    flyers: ranged,
  };
  for (const p of w.players) {
    p.ready = false;
    // Respawn = table × difficulty (§5); Quick Recovery still subtracts through the stat.
    const base = s.baseStats.get(p.id);
    if (base) {
      base.respawnMs = w.team.scaling.respawnMs;
      refreshStats(p, base, effectDefs, s.caps);
    }
  }
  // Offers not taken are gone, and the wishlist clears at the wave start (§6.1, §6.2; FF12).
  closeOffers(s);
  clearWishlist(w);
  w.spawns.length = 0;
  const def = cat.wave(w.wave);
  if (def) {
    const pool = def.allowed.map((id) => {
      const e = cat.enemy(id);
      return { id, cost: e.budget, groupSize: e.groupSize };
    });
    const ground = def.allowed.filter((id) => !cat.enemy(id).flying);
    const rng = waveRng(w.seed, w.wave);
    // Every portal is live from wave 1; groups spawn in pulses over at most `players + 1` portals,
    // each pulse with a hot side that gets the hot share (§9.3, §9.4; systems/waves `hotPulses`).
    const portals = cat.map.portals;
    const sides: Record<string, string> = {};
    for (const id of PORTAL_IDS) sides[id] = portals[id].side;
    const groups = generateWave({
      budget: def.budget * w.team.scaling.budget * cat.difficulty.budget,
      pool,
      guaranteed: def.guaranteed.map((g) => ({ id: g.enemy, count: g.count, lane: g.portal })),
      lanes: PORTAL_IDS,
      durationMs: def.durationMs,
      substitute: ranged ? undefined : { flyer: ground },
      rng,
      sides,
      hot: def.hot,
      hotShare: cat.rules.hot.share,
      activeCap: w.team.scaling.activeCap,
    });
    // Every group spawns after its portal has flared (§9.4).
    const lead = cat.steps(cat.rules.flareMs);
    for (const g of groups) {
      w.spawns.push({
        atTick: w.tick + lead + Math.round((g.atMs * 60) / 1000),
        portal: g.lane as PortalId,
        enemy: g.id,
        count: g.count,
        hot: (g.hot as SideId | undefined) ?? null,
        flared: false,
      });
    }
    // A boss wave's boss walks in first, from a seeded portal on the side hot at the start (§9.2,
    // §9.3: on boss waves 5 and 10 the boss's side is hot for the whole wave).
    if (def.boss) {
      const side = (groups[0]?.hot as SideId | undefined) ?? rng.pick(SIDE_IDS);
      const onSide = PORTAL_IDS.filter((id) => portals[id].side === side);
      const boss = bossSpawn(def, w.tick + lead, rng.pick(onSide.length > 0 ? onSide : PORTAL_IDS));
      if (boss) {
        boss.hot = side;
        w.spawns.push(boss);
      }
    }
  }
  // The debug panel's forced hot side holds for every wave until cleared (RD6).
  if (s.debugHot) forceHot(s, s.debugHot);
  // The Hunters' threat picks up range upgrades bought in the build (FF10-fix-1).
  s.repriceHunters();
  setPhase(s, 'combat', null);
}

/**
 * Debug (§9.5, RD6): the unflared spawn plan's hot side becomes `side`. Groups on their pulse's hot
 * side move to `side`'s portals in turn (a flared portal keeps its group: the flare was shown); the
 * rest stay where they are.
 */
export function forceHot(s: FullState, side: SideId): void {
  const portals = s.cat.map.portals;
  const onSide = PORTAL_IDS.filter((id) => portals[id].side === side);
  if (onSide.length === 0) return;
  let k = 0;
  for (const g of s.world.spawns) {
    if (g.flared) continue;
    if (g.hot === null || portals[g.portal].side === g.hot) g.portal = onSide[k++ % onSide.length]!;
    g.hot = side;
  }
}

function endRun(s: FullState, result: 'victory' | 'defeat') {
  const r = s.cat.rules;
  setPhase(s, result, s.cat.steps(result === 'victory' ? r.victoryMs : r.defeatMs));
  s.emit({ e: 'runEnd', result, wave: s.world.wave });
}

/** Damage stage (§3.3) and the 25% alarm, as state. */
function baseState(s: FullState) {
  const b = s.world.base;
  const f = b.maxHp > 0 ? b.hp / b.maxHp : 0;
  const [cracks = 0.66, fire = 0.33, smoke = 0.1] = s.cat.base.stages;
  b.stage = f <= smoke ? 3 : f <= fire ? 2 : f <= cracks ? 1 : 0;
  const alarm = b.hp > 0 && f <= s.cat.base.alarmAt;
  if (alarm !== b.alarm) {
    b.alarm = alarm;
    s.emit({ e: 'baseAlarm', on: alarm });
  }
}

export function stepPhases(s: FullState): void {
  const w = s.world;
  const t = w.tick;
  baseState(s);
  if ((w.phase === 'build' || w.phase === 'combat') && w.base.hp <= 0) {
    w.base.hp = 0;
    endRun(s, 'defeat');
    return;
  }
  switch (w.phase) {
    case 'countdown':
      if (w.phaseEndsAt !== null && t >= w.phaseEndsAt) startBuild(s, w.wave);
      return;
    case 'build': {
      const present = w.players.filter((p) => p.connected);
      const allReady = present.length > 0 && present.every((p) => p.ready);
      if (allReady || (w.phaseEndsAt !== null && t >= w.phaseEndsAt)) {
        // A card not confirmed when the phase ends is picked at random (§10.2).
        autoPickCards(s);
        startCombat(s);
      }
      return;
    }
    case 'combat':
      if (w.spawns.length === 0 && w.enemies.length === 0) {
        s.emit({ e: 'waveCleared', wave: w.wave });
        const last = s.cat.waves[s.cat.waves.length - 1]?.n ?? w.wave;
        if (w.wave >= last) endRun(s, 'victory');
        else {
          // Class growth for the wave just cleared (§6.1), before the next build phase's pop-up.
          growKnights(s);
          startBuild(s, w.wave + 1);
        }
      }
      return;
    case 'victory':
    case 'defeat':
      if (w.phaseEndsAt !== null && t >= w.phaseEndsAt) setPhase(s, 'summary', null);
      return;
    case 'summary':
      return;
  }
}
