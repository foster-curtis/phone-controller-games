// The shared build pipeline (SPEC §7, §15.3 steps 3–4): a build press with a full meter places or
// throws the knight's build (one active per knight: the oldest over `maxActive` is removed the moment
// the new one leaves his hands), thrown builds fly and land, then switch on after `armMs`; behaviors
// (builds/index.ts) run their effects while active, in combat only. HP builds are targetable like a
// knight once landed (`buildTargetable`; ai/path.ts, combat.ts); charge builds and the flag never
// are. Builds stay on the map between waves with their HP and never regen.
import type { Vec2 } from '../../../content/types';
import { cleanVec, dist } from '../geometry';
import type { SimState } from '../internal';
import type { FullState } from '../state';
import type { BuildEnt, PlayerEnt } from '../types';
import { buildBehaviors } from './index';
import { clampLanding, throwLanding, type LandingArea } from './landing';

/** Can enemies target this build now? HP builds on the ground with HP left (§7.3). */
export function buildTargetable(b: BuildEnt): boolean {
  return b.targetable && b.state !== 'flight' && b.hp > 0;
}

/** The playfield and the Citadel's footprint, for landings. */
export function landingArea(s: SimState): LandingArea {
  return { cols: s.cat.map.cols, rows: s.cat.map.rows, citadel: s.baseRect };
}

/** HP bar data for the TV (§7.5): emitted on landing and on every hit. */
function emitHp(s: SimState, b: BuildEnt): void {
  if (!b.targetable) return;
  s.emit({ e: 'buildHp', build: b.id, kind: b.kind, owner: b.owner, hp: b.hp, maxHp: b.maxHp });
}

/** Removes a build from the map: replaced (`destroyed` false) or destroyed. */
export function removeBuild(s: FullState, b: BuildEnt, destroyed: boolean): void {
  const i = s.world.builds.indexOf(b);
  if (i >= 0) s.world.builds.splice(i, 1);
  s.dropBruteField(b);
  s.emit({ e: 'buildGone', build: b.id, kind: b.kind, destroyed });
  s.removeUnit(b.id);
}

/**
 * Places or throws `p`'s build toward `aim` (−1..1, 0,0 = at his feet) and empties the meter. Null
 * when his build has no behavior yet (nothing happens; the meter stays full).
 */
export function placeBuild(s: FullState, p: PlayerEnt, aim: Vec2): BuildEnt | null {
  const kind = s.cat.knight(p.classId).build;
  const beh = buildBehaviors[kind];
  if (!beh) return null;
  const def = s.cat.build(kind);
  const w = s.world;
  const t = w.tick;
  const mine = w.builds
    .filter((b) => b.owner === p.slot)
    .sort((a, b) => a.seq - b.seq || a.id - b.id);
  const seq = mine.length > 0 ? mine[mine.length - 1]!.seq + 1 : 0;
  const max = Math.max(
    1,
    beh.maxActive?.(s, p, def) ?? def.maxActive + s.attackStat(p, 0, 'buildMax', 'build'),
  );
  while (mine.length >= max) removeBuild(s, mine.shift()!, false);

  const r = def.bodyRadius;
  const area = landingArea(s);
  const from = { x: p.x, y: p.y };
  let to: Vec2;
  let landsAt = t;
  if (def.input === 'aimed' && def.throw) {
    const range = s.attackStat(p, def.throw.range, 'throwRange', 'build');
    to = throwLanding(from, cleanVec(aim.x, aim.y), range, r, area);
    const speed = Math.max(0.01, s.attackStat(p, def.throw.speed, 'throwSpeed', 'build'));
    const flySteps = Math.ceil((dist(from.x, from.y, to.x, to.y) / speed) * 60);
    landsAt = t + Math.max(s.cat.steps(def.throw.minFlightMs), flySteps);
  } else {
    to = clampLanding(p.x, p.y, r, area);
  }
  const flying = landsAt > t;
  const b = s.addBuild(kind, flying ? from.x : to.x, flying ? from.y : to.y, p.slot);
  b.seq = seq;
  b.facing = p.facing;
  if (def.hp !== undefined) {
    const hp = s.attackStat(p, def.hp, 'buildHp', 'build');
    b.hp = b.maxHp = b.stats.maxHp = hp;
    s.baseStats.get(b.id)!.maxHp = hp;
  }
  b.flight = flying ? { from, to, launchedAt: t, landsAt } : null;
  b.state = flying ? 'flight' : 'landed';
  b.liveAt = landsAt + (def.armMs ? s.cat.steps(def.armMs) : 0);
  p.meter = 0;
  p.run.buildsPlaced++;
  s.emit({ e: 'buildPlaced', slot: p.slot, build: b.id, kind });
  if (!flying) land(s, b);
  beh.placed?.(s, p, b);
  return b;
}

function land(s: SimState, b: BuildEnt): void {
  if (b.flight) {
    b.x = b.flight.to.x;
    b.y = b.flight.to.y;
  }
  b.flight = null;
  b.state = 'landed';
  s.emit({ e: 'buildLanded', build: b.id });
  emitHp(s, b);
}

/** Step 4: flights land, switch-on, then each active build's effect (combat only, §7.1). */
export function stepBuilds(s: FullState): void {
  const w = s.world;
  const t = w.tick;
  const combat = w.phase === 'combat';
  for (const b of w.builds) {
    if (b.state === 'flight' && b.flight) {
      const f = b.flight;
      if (t >= f.landsAt) land(s, b);
      else {
        const u = (t - f.launchedAt) / Math.max(1, f.landsAt - f.launchedAt);
        b.x = f.from.x + (f.to.x - f.from.x) * u;
        b.y = f.from.y + (f.to.y - f.from.y) * u;
        continue;
      }
    }
    if (b.state === 'landed' && t >= b.liveAt) b.state = 'active';
    if (b.state === 'active' && combat) buildBehaviors[b.kind]?.combat?.(s, b, s.cat.build(b.kind));
    // A mine's delay cut off by the wave's end: it re-arms with its charge (§7.1, combat only).
    else if (!combat) b.triggerAt = null;
  }
  // Charge builds used up this step (a mine's burst) leave after the loop, which they'd otherwise skip.
  for (let i = 0; i < w.builds.length;) {
    const b = w.builds[i]!;
    if (b.charges === 0) removeBuild(s, b, false);
    else i++;
  }
}

/** A build that took damage: the TV's HP bar data (§7.5; state.ts `afterDamage`). */
export function buildDamaged(s: SimState, b: BuildEnt): void {
  s.emit({ e: 'buildHit', build: b.id, kind: b.kind });
  emitHp(s, b);
}
