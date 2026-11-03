// Supply crates (SPEC §3.4, §5, §6, §10.1): personal inventory bought at the Armory pad (depot) with
// team coins, picked up from piles, handed over or dropped, delivered to repair the base, dropped on
// death or when dazed.
import type { AckReason } from '../../shared/messages';
import { dist } from './geometry';
import type { FullState } from './state';
import type { PlayerEnt } from './types';

/** Piles closer than this merge (a held Give repeats on the same spot). */
const MERGE = 0.3;

export function carryCap(s: FullState, p: PlayerEnt): number {
  return s.cat.character(p.classId).carryCap;
}

/** Speed multiplier for the crates carried (§6: grows faster than linearly). */
export function carrySpeed(s: FullState, p: PlayerEnt): number {
  const curve = s.cat.character(p.classId).carrySlowdown;
  const loss = curve[Math.min(p.crates, curve.length - 1)] ?? 0;
  return Math.max(0, 1 - loss * p.stats.carrySlowdown);
}

export function inZone(s: FullState, p: PlayerEnt, kind: 'repair' | 'armory'): boolean {
  return s.tileKind(Math.floor(p.x), Math.floor(p.y)) === kind;
}

export function cratePrice(s: FullState): number {
  return s.cat.shopItem('crate')?.tiers[0]?.price ?? Infinity;
}

/** Nearest pile in reach this player may take (not their own fresh drop), or null. */
export function pileInReach(s: FullState, p: PlayerEnt) {
  const t = s.world.tick;
  let best = null;
  let bestD = Infinity;
  for (const pile of s.world.cratePiles) {
    if (pile.n <= 0) continue;
    if (pile.lockedSlot === p.slot && t < pile.lockedUntil) continue;
    const d = dist(p.x, p.y, pile.x, pile.y);
    if (d <= s.cat.rules.pickupRadius && d < bestD) {
      best = pile;
      bestD = d;
    }
  }
  return best;
}

/** Row 1: takes as many crates from the pile as fit. */
export function pickUp(s: FullState, p: PlayerEnt): boolean {
  const room = carryCap(s, p) - p.crates;
  if (room <= 0) return false;
  const pile = pileInReach(s, p);
  if (!pile) return false;
  const n = Math.min(room, pile.n);
  pile.n -= n;
  p.crates += n;
  if (pile.n === 0) s.world.cratePiles.splice(s.world.cratePiles.indexOf(pile), 1);
  s.emit({ e: 'crate', action: 'pickup', slot: p.slot, to: null, x: pile.x, y: pile.y });
  return true;
}

/** Row 2: one crate repairs the base by a chunk. A full base takes no crate (BUILD_PLAN §8, FF6). */
export function canDeliver(s: FullState, p: PlayerEnt): boolean {
  const b = s.world.base;
  return p.crates > 0 && inZone(s, p, 'repair') && b.hp > 0 && b.hp < b.maxHp;
}

export function deliver(s: FullState, p: PlayerEnt): void {
  const b = s.world.base;
  p.crates--;
  p.run.cratesDelivered++;
  b.hp = Math.min(b.maxHp, b.hp + s.cat.base.repairPerCrate);
  s.emit({ e: 'crate', action: 'deliver', slot: p.slot, to: null, x: p.x, y: p.y });
}

/** Row 4 and the phone shop: one crate for team coins at full price. */
export function buyCrate(s: FullState, p: PlayerEnt): AckReason | null {
  if (p.crates >= carryCap(s, p)) return 'cap';
  const price = cratePrice(s);
  if (s.world.team.coins < price) return 'coins';
  s.world.team.coins -= price;
  p.crates++;
  s.emit({ e: 'crate', action: 'buy', slot: p.slot, to: null, x: p.x, y: p.y });
  return null;
}

/** Drops `n` crates at (x, y); `lockedSlot` can't take them back for ~1 s. */
export function dropPile(s: FullState, x: number, y: number, n: number, lockedSlot: number | null) {
  if (n <= 0) return;
  const until = lockedSlot === null ? 0 : s.world.tick + s.cat.steps(s.cat.rules.dropLockMs);
  for (const pile of s.world.cratePiles) {
    if (pile.lockedSlot === lockedSlot && dist(x, y, pile.x, pile.y) < MERGE) {
      pile.n += n;
      pile.lockedUntil = Math.max(pile.lockedUntil, until);
      return;
    }
  }
  s.world.cratePiles.push({ id: s.world.nextId++, x, y, n, lockedSlot, lockedUntil: until });
}

/**
 * Give crate (§10.1): one crate to the nearest teammate in reach who has room, otherwise dropped at
 * your feet.
 */
export function give(s: FullState, p: PlayerEnt): AckReason | null {
  if (p.crates <= 0) return 'crates';
  let to: PlayerEnt | null = null;
  let bestD = Infinity;
  for (const q of s.world.players) {
    if (q === p || !s.targetable(q) || q.crates >= carryCap(s, q)) continue;
    const d = dist(p.x, p.y, q.x, q.y);
    if (d <= s.cat.rules.giveRadius && d < bestD) {
      to = q;
      bestD = d;
    }
  }
  p.crates--;
  if (to) {
    to.crates++;
    p.run.cratesGiven++;
    s.emit({ e: 'crate', action: 'give', slot: p.slot, to: to.slot, x: p.x, y: p.y });
  } else {
    dropPile(s, p.x, p.y, 1, p.slot);
    s.emit({ e: 'crate', action: 'drop', slot: p.slot, to: null, x: p.x, y: p.y });
  }
  return null;
}

/** Death or dazed: everything carried drops where the player stands, takeable by anyone. */
export function dropAll(s: FullState, p: PlayerEnt): void {
  if (p.crates <= 0) return;
  dropPile(s, p.x, p.y, p.crates, null);
  s.emit({ e: 'crate', action: 'drop', slot: p.slot, to: null, x: p.x, y: p.y });
  p.crates = 0;
}
