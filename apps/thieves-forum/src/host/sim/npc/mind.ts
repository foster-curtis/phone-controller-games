// An NPC mind (SPEC §6.10 techniques 1 and 4, §6.4): personality sliders, a short wish list from the
// open shops ("spices, then bread"), the items it would buy from a player, its purse and its sale rate,
// all rolled from the NPC's own seeded stream (SPEC §5, §12.3 `npc:<id>`), plus (TF2-fix-1) how unsure
// of itself it is.
import type { Rng } from '@pcg/game-kit';
import type { Content, Range, ShopId } from '../../../content/types';
import { economy } from '../economy';
import type { Npc } from '../types';
import { TUNING } from '../tuning';
import type { NpcNav } from './types';

const inRange = (rng: Rng, [lo, hi]: Range): number => lo + (hi - lo) * rng.next();

/** Fresh steering memory: no leg, no path (SPEC §6.10 technique 2). */
export function newNav(x = 0, y = 0): NpcNav {
  return {
    leg: 'none',
    path: [],
    stall: null,
    spot: -1,
    detour: false,
    wander: 0,
    slow: 1,
    slowUntil: 0,
    look: null,
    pauseUntil: 0,
    passed: [],
    brisk: false,
    exit: null,
    still: 0,
    stuck: 0,
    lastX: x,
    lastY: y,
    doubt: 0,
    moment: 'none',
    drift: 0,
    driftTo: 0,
    driftAt: 0,
    faceTo: null,
    lookBase: 0,
    looks: 0,
    lookAt: 0,
  };
}

/**
 * Rolls a mind. `open` is the round's open shops; the wish list only names shops that sell (not the
 * pawnbroker) and are open. Without `open`, every selling shop counts.
 */
export function createMind(rng: Rng, content: Content, open?: readonly ShopId[]): Npc {
  const b = content.balance;
  const p = b.npcs.personality;
  const personality = {
    speed: inRange(rng, p.speed),
    distractibility: inRange(rng, p.distractibility),
    browseMs: Math.round(inRange(rng, p.browseMs)),
    hurried: rng.next() < p.hurriedChance,
  };
  const shops = (open ?? (Object.keys(content.shops) as ShopId[])).filter(
    (s) => content.shops[s].sells,
  );
  const wishList: ShopId[] = [];
  const want = rng.int(b.npcs.wishList[0], b.npcs.wishList[1]);
  const pool = [...shops];
  while (wishList.length < want && pool.length > 0)
    wishList.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]!);
  // Items it would buy from a player: one per wish-list shop (SPEC §6.4 "wish list says what").
  const wants = wishList.flatMap((s) => {
    const items = content.items.filter((i) => i.shop === s && i.rarity !== 'rare');
    return items.length ? [rng.pick(items).id] : [];
  });
  // TF2-fix-1: rolled last so the rolls above keep their places in the stream.
  const nav = newNav();
  nav.doubt = rng.next() * (personality.hurried ? TUNING.doubt.hurried : 1);
  return {
    personality,
    state: 'entering',
    wishList,
    wants,
    purse: rng.int(b.npcs.purse[0], b.npcs.purse[1]),
    saleRate: economy.roll(rng, b.npcSale.rate, b.luck.skew),
    goal: null,
    until: 0,
    alertUntil: -1,
    glance: null,
    nav,
  };
}
