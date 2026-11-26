// The Artificer (SPEC §8.2, §8.3; RD8). Nanite blast: one release sends `count` nanites over `burstMs`,
// each to a random spot in the narrow cone from the wave's combat stream, along the aim he released
// with. Each shot restarts regen, and going down, dazed or a phase end drops the shots left. Also the
// healing shared by Field Medic and the beacon, and the super charge it gives.
import type { AttackDef } from '../../../content/types';
import type { SimState } from '../internal';
import { holdRegen } from '../regen';
import type { AttackEvent, NaniteBurst, PlayerEnt } from '../types';

/** Starts a blast and fires its first nanite (the press's step). */
export function startBlast(
  s: SimState,
  p: PlayerEnt,
  a: AttackDef,
  damage: number,
  range: number,
  speed: number,
  atk: AttackEvent,
): void {
  p.burst = {
    angle: p.facing,
    startedAt: s.world.tick,
    fired: 0,
    count: atk.count,
    steps: s.cat.steps(a.burstMs ?? 0),
    halfSpread: ((atk.spreadDeg / 2) * Math.PI) / 180,
    minReach: a.burstMinReach ?? 1,
    damage,
    range,
    speed,
    pierce: atk.pierce,
    tags: atk.tags,
    effects: atk.effects,
  };
  stepBlast(s, p);
}

/** The step a shot leaves: evenly over the burst, the first at once and the last at its end. */
export function blastShotAt(b: Pick<NaniteBurst, 'startedAt' | 'count' | 'steps'>, i: number) {
  return b.count > 1 ? b.startedAt + Math.round((i * b.steps) / (b.count - 1)) : b.startedAt;
}

/** Fires the nanites due this step. */
export function stepBlast(s: SimState, p: PlayerEnt): void {
  const b = p.burst;
  if (!b) return;
  const rng = s.rng(`combat:${s.world.wave}`);
  while (b.fired < b.count && s.world.tick >= blastShotAt(b, b.fired)) {
    const angle = b.angle + (rng.next() * 2 - 1) * b.halfSpread;
    const reach = b.minReach + (1 - b.minReach) * rng.next();
    holdRegen(s, p);
    s.fire({
      source: p,
      from: p.classId,
      slot: 'main',
      side: 'ours',
      x: p.x,
      y: p.y,
      dx: Math.cos(angle),
      dy: Math.sin(angle),
      attack: s.cat.knight(p.classId).main,
      damage: b.damage,
      range: b.range * reach,
      speed: b.speed,
      kind: 'ranged',
      tags: b.tags,
      effects: b.effects,
      pierce: b.pierce,
    });
    b.fired++;
  }
  if (b.fired >= b.count) p.burst = null;
}

/**
 * Heals the knights `reaches` accepts and returns the HP restored. With Overflow a full knight still
 * takes the heal, as a shield.
 */
export function healKnights(
  s: SimState,
  healer: PlayerEnt,
  amount: number,
  reaches: (q: PlayerEnt) => boolean,
): number {
  const overflow = (healer.cards.overflow ?? 0) > 0;
  let healed = 0;
  for (const q of s.world.players) {
    if (!s.targetable(q) || (q.hp >= q.maxHp && !overflow) || !reaches(q)) continue;
    healed += s.heal(q.id, amount, healer.id).healed;
  }
  return healed;
}

/** Field Medic and beacon healing charge his super (§8.3), with Focus; the super's own never does. */
export function chargeSuperFromHeal(s: SimState, p: PlayerEnt, healed: number): void {
  const rate = s.cat.knight(p.classId).superCharge.perHeal ?? 0;
  if (healed <= 0 || rate <= 0 || p.superCharge >= 1) return;
  p.superCharge = Math.min(1, p.superCharge + healed * s.attackStat(p, rate, 'superCharge'));
  if (p.superCharge >= 1) s.emit({ e: 'superReady', slot: p.slot });
}
