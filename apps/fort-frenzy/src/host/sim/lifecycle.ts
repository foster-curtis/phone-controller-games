// Steps 7–10 (SPEC §15.3): status effects and `onTick` hooks, deaths (coins, crate drops, flow field
// rebuilds), the wave spawner with 3 s lane warnings, and the phase checks: wave cleared, base
// destroyed, build timer and ready-up. Also the phase transitions the commands reuse.
import { tickEffects } from '../systems/effects';
import { generateWave, playerScale, waveRng } from '../systems/waves';
import { bossSpawn, collapseAfterBoss } from './boss';
import { closeOffers, dealOffers } from './cards';
import { dropAll } from './crates';
import { clearWishlist } from './shop';
import { releaseAll, respawn } from './players';
import { effects as effectDefs } from './registry';
import { fillSquads } from './squad';
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
  for (const st of w.structures) if (st.effects.length > 0 || st.mods.length > 0) tickUnit(s, st);
}

// ---- step 8: deaths -------------------------------------------------------------------------------

function coinsFor(s: FullState, e: EnemyEnt, paid: Set<number>): number {
  // A Runner's burst is not a kill (FF10): it is its own killer and pays nothing.
  if (s.killers.get(e.id) === e.id) return 0;
  const groupLeft = s.world.enemies.some((o) => o !== e && o.group === e.group && o.hp > 0);
  // A group pays once, when its last unit dies (§9.1), even if several die in the same step.
  if (groupLeft || paid.has(e.group)) return 0;
  paid.add(e.group);
  return Math.round(s.cat.enemy(e.kind).budget * s.cat.difficulty.coinIncome);
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

  // Players: respawn at the base after the respawn time, dropping every crate carried (§5).
  for (const p of w.players) {
    if (p.respawnAt !== null || p.hp > 0) continue;
    const killerId = s.killers.get(p.id) ?? null;
    s.killers.delete(p.id);
    p.hp = 0;
    p.respawnAt = t + s.cat.steps(p.stats.respawnMs);
    p.run.deaths++;
    dropAll(s, p);
    releaseAll(p);
    p.push = null;
    s.emit({ e: 'death', id: p.id, what: 'player', killer: killerId, x: p.x, y: p.y });
    const killer = killerId === null ? null : (s.units.get(killerId) ?? null);
    for (const f of s.hooks(p, 'onDeath')) f(s, p, killer);
  }

  // Structures: a destroyed blocker rebuilds the flow fields this step.
  write = 0;
  for (const st of w.structures) {
    // A snare whose last discharge is used fizzles out and frees its tile (§7.1): no `destroyed`
    // event (its `snareDischarge` with 0 left says so) and no flow-field rebuild (not a blocker).
    if (!st.damageable && st.discharges !== null && st.discharges <= 0) {
      s.removeUnit(st.id);
      continue;
    }
    if (!st.damageable || st.hp > 0) {
      w.structures[write++] = st;
      continue;
    }
    s.emit({ e: 'destroyed', id: st.id, structure: st.kind, tile: st.tile });
    s.removeUnit(st.id);
  }
  w.structures.length = write;

  // Soldiers (FF9): the fallen collapse and return at the next build phase (squad/fillSquads).
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

  if (w.fields.dirty) s.rebuildFields();
}

// ---- step 9: spawner ------------------------------------------------------------------------------

export function stepSpawner(s: FullState): void {
  const w = s.world;
  if (w.phase !== 'combat' || w.spawns.length === 0) return;
  const t = w.tick;
  const warn = s.cat.steps(s.cat.rules.spawnWarningMs);
  let write = 0;
  for (const g of w.spawns) {
    if (!g.warned && t >= g.atTick - warn) {
      g.warned = true;
      s.emit({ e: 'laneWarning', lane: g.lane, spawnsAtTick: g.atTick });
    }
    if (t < g.atTick) {
      w.spawns[write++] = g;
      continue;
    }
    spawnGroup(s, g.enemy, g.lane, g.count);
  }
  w.spawns.length = write;
}

/** `count` units of `enemy` just outside `lane`'s edge, spread across the lane (combat stream jitter). */
export function spawnGroup(
  s: FullState,
  enemy: EnemyEnt['kind'],
  lane: NonNullable<EnemyEnt['lane']>,
  count: number,
) {
  const L = s.cat.map.lanes[lane];
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
    const e = s.spawnEnemy(enemy, x, y, lane, group);
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

/** The build phase before wave `n`: the dead respawn at once (§5), 45 s cap (§10.2). */
export function startBuild(s: FullState, n: number): void {
  const w = s.world;
  w.wave = n;
  w.projectiles.length = 0;
  w.markers.length = 0;
  for (const p of w.players) {
    p.ready = false;
    if (p.respawnAt !== null) respawn(s, p);
  }
  // Dead soldiers return at the base, and squads grow after boss waves (§8, FF9).
  fillSquads(s);
  // Each player's private pick of 3 upgrade cards (§6.1, FF12).
  dealOffers(s);
  setPhase(s, 'build', s.cat.steps(s.cat.rules.buildCapMs));
}

/** Combat for the current wave: scaling fixed from the players connected now (§9.4, §11.3). */
export function startCombat(s: FullState): void {
  const w = s.world;
  const cat = s.cat;
  const connected = w.players.filter((p) => p.connected);
  const ranged = connected.some((p) => p.classId === 'engineer' || p.classId === 'quartermaster');
  w.team.scaling = {
    players: connected.length,
    mult: playerScale(connected.length, cat.scaling),
    flyers: ranged,
  };
  for (const p of w.players) {
    p.ready = false;
    p.ghost = null;
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
    const groups = generateWave({
      budget: def.budget * w.team.scaling.mult * cat.difficulty.budget,
      pool,
      guaranteed: def.guaranteed.map((g) => ({ id: g.enemy, count: g.count, lane: g.lane })),
      lanes: def.lanes,
      durationMs: def.durationMs,
      substitute: ranged ? undefined : { flyer: ground },
      rng: waveRng(w.seed, w.wave),
    });
    // Every group spawns after its lane has glowed for the warning time (§9.4).
    const lead = cat.steps(cat.rules.spawnWarningMs);
    for (const g of groups) {
      w.spawns.push({
        atTick: w.tick + lead + Math.round((g.atMs * 60) / 1000),
        lane: g.lane as NonNullable<EnemyEnt['lane']>,
        enemy: g.id,
        count: g.count,
        warned: false,
      });
    }
    // A boss wave's boss walks in first, up its first lane (§9.2, FF11).
    const boss = bossSpawn(def, w.tick + lead);
    if (boss) w.spawns.push(boss);
  }
  // The Hunters' tower threat picks up range cards and sentries bought in the build (FF10-fix-1).
  s.rebuildFields();
  setPhase(s, 'combat', null);
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
      if (allReady || (w.phaseEndsAt !== null && t >= w.phaseEndsAt)) startCombat(s);
      return;
    }
    case 'combat':
      if (w.spawns.length === 0 && w.enemies.length === 0) {
        s.emit({ e: 'waveCleared', wave: w.wave });
        const last = s.cat.waves[s.cat.waves.length - 1]?.n ?? w.wave;
        if (w.wave >= last) endRun(s, 'victory');
        else startBuild(s, w.wave + 1);
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
