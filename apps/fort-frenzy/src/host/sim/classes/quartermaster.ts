// Quartermaster supply perks (SPEC §3.4, §6, §10.1 rows 3 and 6): the emergency repair kit used in
// the repair zone, and crate throws that auto-target the nearest Engineer or Warden. The discount,
// the cap of 8 and no slowdown are content (`supply`, `carryCap`, `carrySlowdown`) read by crates.ts.
// Field Medic is a passive module (modules/fieldMedic.ts).
import { carryCap, dropPile, inZone } from '../crates';
import { dist } from '../geometry';
import type { FullState } from '../state';
import type { PlayerEnt, ThrownCrate, World } from '../types';

/** Who a Quartermaster throws to (§10.1 row 6). */
const RECEIVERS = new Set(['engineer', 'warden']);

/**
 * Row 6's target: the nearest Engineer or Warden who is up, connected, has room and is within the
 * throw range; ties go to the lower slot. Pure on the world (the phones' action icon uses it too).
 */
export function throwTarget(
  w: World,
  p: PlayerEnt,
  capOf: (q: PlayerEnt) => number,
): PlayerEnt | null {
  if (p.classId !== 'quartermaster' || p.crates <= 0) return null;
  const range = p.stats.throwRange;
  let best: PlayerEnt | null = null;
  let bestD = Infinity;
  for (const q of w.players) {
    if (q === p || !RECEIVERS.has(q.classId)) continue;
    if (q.respawnAt !== null || !q.connected || q.hp <= 0 || q.crates >= capOf(q)) continue;
    const d = dist(p.x, p.y, q.x, q.y);
    if (d <= range && d < bestD) {
      best = q;
      bestD = d;
    }
  }
  return best;
}

/** Row 6: throws one crate at the target; it lands on them after its flight. */
export function throwCrate(s: FullState, p: PlayerEnt, to: PlayerEnt): void {
  const w = s.world;
  const d = dist(p.x, p.y, to.x, to.y);
  const speed = Math.max(0.1, p.stats.throwSpeed);
  // Never shorter than content's `throwMinFlightMs`: a lob, even point-blank.
  const least = s.cat.steps(s.cat.character(p.classId).supply!.throwMinFlightMs!);
  const flight = Math.max(least, Math.round((d / speed) * 60));
  p.crates--;
  const c: ThrownCrate = {
    id: w.nextId++,
    from: p.slot,
    to: to.slot,
    x0: p.x,
    y0: p.y,
    x: to.x,
    y: to.y,
    launchedAt: w.tick,
    landsAt: w.tick + flight,
  };
  (w.thrown ??= []).push(c);
  s.emit({ e: 'crate', action: 'throw', slot: p.slot, to: to.slot, x: p.x, y: p.y });
}

/**
 * Crates in flight follow their receiver and land on their tick: caught if the receiver is still up
 * with room, otherwise dropped where they land (anyone may pick it up).
 */
export function stepThrown(s: FullState): void {
  const w = s.world;
  const list = w.thrown;
  if (!list || list.length === 0) return;
  let write = 0;
  for (const c of list) {
    const q = s.player(c.to);
    const up = q !== undefined && s.targetable(q);
    if (up) {
      c.x = q.x;
      c.y = q.y;
    }
    if (w.tick < c.landsAt) {
      list[write++] = c;
      continue;
    }
    if (up && q.crates < carryCap(s, q)) {
      q.crates++;
      const from = s.player(c.from);
      if (from) from.run.cratesGiven++;
    } else {
      dropPile(s, c.x, c.y, 1, null);
      s.emit({ e: 'crate', action: 'drop', slot: c.from, to: null, x: c.x, y: c.y });
    }
  }
  list.length = write;
}

/** Row 3: a Quartermaster in the repair zone holding a kit, with the base hurt (a full base takes none). */
export function canUseKit(s: FullState, p: PlayerEnt): boolean {
  const b = s.world.base;
  return (
    p.classId === 'quartermaster' &&
    p.kits > 0 &&
    inZone(s, p, 'repair') &&
    b.hp > 0 &&
    b.hp < b.maxHp
  );
}

export function useKit(s: FullState, p: PlayerEnt): void {
  const b = s.world.base;
  p.kits--;
  b.hp = Math.min(b.maxHp, b.hp + (s.cat.character(p.classId).supply?.kitRepair ?? 0));
  s.emit({ e: 'kitUsed', slot: p.slot });
}
