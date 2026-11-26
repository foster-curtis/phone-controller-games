// Catches (SPEC §6.13, §12.3 step 8): the in-person Catch! (rising edge of the `catch` bit; the nearest
// character in front within reach; right if mid-steal with the 300 ms grace, else the wrong-grab
// penalty), guard catches (pot 25% of the bag kept by the guard, the tipper's ¼ cut for a tip, the march
// and 20 s in the stocks, then 3 s immunity), and the stolen item always going back on the counter.
// Money moves only through the round's ledger (`attachLedger`); the TV gets entity ids, never a player.
// Frozen at TF0 (BUILD_PLAN §3): the exported names and signatures; the bodies are TF9's.
import type { ItemId, Vec2 } from '../../../content/types';
import { inputEdges } from '../derived';
import { angleDiff, dist } from '../geometry';
import { GUARD_TUNING } from '../guards/tuning';
import { holds } from '../holds';
import { chargeWrongGrab, settleCatch, type CatchBy, type Settlement } from '../ledger';
import type { Side } from '../ledger/types';
import type { StepContext } from '../systems';
import type { Character, EntityId, Hold, PlayerId, World } from '../types';
import { ledgerOf } from './ledger';
import type { CatchesApi, CatchKind } from './types';

export type { CatchesApi, CatchKind } from './types';
export { attachLedger, ledgerOf } from './ledger';

// ---- per-world bookkeeping outside `World` -----------------------------------------------------

/** Each actor's latest stall-grab hold and the item it was on (to put it back, SPEC §6.13). */
interface Steal {
  hold: Hold;
  item: ItemId | null;
}
const steals = new WeakMap<World, Map<EntityId, Steal>>();
function stealsOf(world: World): Map<EntityId, Steal> {
  let m = steals.get(world);
  if (!m) {
    m = new Map();
    steals.set(world, m);
  }
  return m;
}

/** Records live GRAB holds (with the item still on the slot) so a catch can put the item back. */
function trackSteals(world: World): void {
  const m = stealsOf(world);
  for (const h of world.holds) {
    if (h.target.k !== 'item') continue;
    const known = m.get(h.actor);
    if (known && known.hold === h) continue;
    const t = h.target;
    const slot = world.stalls.find((s) => s.id === t.stall)?.slots.find((x) => x.slot === t.slot);
    m.set(h.actor, { hold: h, item: slot?.item ?? null });
  }
}

// ---- helpers -----------------------------------------------------------------------------------

const charOf = (world: World, id: EntityId): Character | null =>
  world.characters.find((c) => c.id === id) ?? null;

function playerOf(c: Character): PlayerId | null {
  const k = c.control;
  return k.k === 'npc' ? null : k.playerId;
}

const BUSY = new Set(['caught', 'marched', 'stocks', 'handsUp', 'leaving', 'entering']);

function sideOfPlayer(world: World, player: PlayerId): Side {
  const c = world.characters.find((x) => x.control.k !== 'npc' && x.control.playerId === player);
  return c?.side ?? { kind: 'player', id: player };
}

/** The character a Catch! grabs: nearest in front (within 90° of facing) within reach, ties by id. */
export function touched(ctx: StepContext, catcher: Character): Character | null {
  const reach = ctx.content.balance.catch.reach;
  let best: Character | null = null;
  let bd = Infinity;
  for (const c of ctx.world.characters) {
    if (c.id === catcher.id || c.activity.k === 'stocks' || c.activity.k === 'marched') continue;
    const d = dist(catcher.x, catcher.y, c.x, c.y);
    if (d > reach) continue;
    if (d > 1e-6) {
      const a = Math.atan2(c.y - catcher.y, c.x - catcher.x);
      if (Math.abs(angleDiff(a, catcher.facing)) > Math.PI / 2 + 1e-9) continue;
    }
    if (d < bd - 1e-9) {
      bd = d;
      best = c;
    }
  }
  return best;
}

/**
 * Puts the item being stolen back on the counter (SPEC §6.13): a live hold ends as `caught` (the item
 * never left), and a grab that completed inside the grace window gives its item back.
 */
function returnLoot(ctx: StepContext, thief: Character): void {
  const w = ctx.world;
  if (holds.caught(ctx, thief.id)) return;
  const s = stealsOf(w).get(thief.id);
  if (!s || s.hold.result !== 'complete' || s.item === null || s.hold.target.k !== 'item') return;
  const graceTicks = ctx.ticks(ctx.content.balance.catch.graceMs);
  if (w.tick - thief.holdEndedAt > graceTicks) return;
  const t = s.hold.target;
  const stall = w.stalls.find((x) => x.id === t.stall);
  const slot =
    stall?.slots.find((x) => x.slot === t.slot && x.item === null) ??
    stall?.slots.find((x) => x.row === 'counter' && x.item === null);
  stealsOf(w).delete(thief.id);
  if (!stall || !slot) return;
  slot.item = s.item;
  if (thief.side) ledgerOf(w)?.removeItem(thief.side, s.item);
  ctx.emit({ ch: 'tv', e: 'stallChanged', stall: stall.id });
  const p = playerOf(thief);
  if (p !== null) ctx.emit({ ch: 'phone', player: p, e: 'bagChanged' });
}

/** Takes and pays out the pot through TF10's `settleCatch` (the §6.13 payout table in one place). */
function settle(ctx: StepContext, thief: Character, how: CatchBy): Settlement {
  const ledger = ledgerOf(ctx.world);
  if (!ledger || !thief.side) return { pot: 0, catcher: 0, tipper: 0, guard: 0 };
  return settleCatch(ledger, thief.side, how, ctx.content.balance);
}

function freeStocksSlot(world: World): number {
  const marching = new Set(
    world.guards.flatMap((g) => (g.mode.k === 'march' ? [g.mode.slot] : [])),
  );
  const s = world.stocks.find((x) => x.character === null && !marching.has(x.slot));
  return s ? s.slot : -1;
}

function caughtBeat(ctx: StepContext, thief: Character): void {
  thief.activity = { k: 'caught', until: ctx.world.tick + ctx.ticks(GUARD_TUNING.caughtMs) };
  thief.vx = 0;
  thief.vy = 0;
  thief.pose = 'caught';
}

// ---- the API -----------------------------------------------------------------------------------

function catchable(ctx: StepContext, thiefId: EntityId): boolean {
  const c = charOf(ctx.world, thiefId);
  if (!c) return false;
  const k = c.activity.k;
  if (k === 'caught' || k === 'marched' || k === 'stocks') return false;
  return ctx.world.tick >= c.immuneUntil;
}

function inPerson(ctx: StepContext, catcherId: EntityId): void {
  const w = ctx.world;
  const b = ctx.content.balance;
  const catcher = charOf(w, catcherId);
  if (!catcher || BUSY.has(catcher.activity.k)) return;
  const target = touched(ctx, catcher);
  if (!target) return;
  const catcherPlayer = playerOf(catcher);
  const right = target.side !== null && holds.isMidSteal(w, target.id, ctx.ticks(b.catch.graceMs));
  if (right) {
    // A thief in the stocks or just out of them can't be caught again: the grab does nothing.
    if (!catchable(ctx, target.id)) return;
    returnLoot(ctx, target);
    const taken = catcher.side
      ? settle(ctx, target, { by: 'player', catcher: catcher.side }).pot
      : 0;
    caughtBeat(ctx, target);
    ctx.emit({ ch: 'tv', e: 'grabAttempt', by: catcher.id, at: target.id, right: true });
    ctx.emit({ ch: 'tv', e: 'caught', thief: target.id, to: catcher.id, coins: taken });
    if (catcherPlayer !== null) {
      ctx.emit({ ch: 'phone', player: catcherPlayer, e: 'rightGrab', pot: taken });
      ctx.emit({ ch: 'phone', player: catcherPlayer, e: 'bagChanged' });
    }
    const thiefPlayer = playerOf(target);
    if (thiefPlayer !== null) {
      ctx.emit({ ch: 'phone', player: thiefPlayer, e: 'caught', pot: taken, by: 'player' });
      ctx.emit({ ch: 'phone', player: thiefPlayer, e: 'bagChanged' });
    }
    return;
  }
  // Wrong (not mid-steal, or an NPC): the grabber pays the penalty; the TV shows the grab either way.
  const ledger = ledgerOf(w);
  const paid = ledger && catcher.side ? chargeWrongGrab(ledger, catcher.side, b) : 0;
  ctx.emit({ ch: 'tv', e: 'grabAttempt', by: catcher.id, at: target.id, right: false });
  if (catcherPlayer !== null) {
    ctx.emit({ ch: 'phone', player: catcherPlayer, e: 'wrongGrab', penalty: paid });
    ctx.emit({ ch: 'phone', player: catcherPlayer, e: 'bagChanged' });
  }
}

function byGuard(
  ctx: StepContext,
  guardId: EntityId,
  thiefId: EntityId,
  kind: CatchKind,
  tipper?: PlayerId,
): void {
  const w = ctx.world;
  const guard = w.guards.find((g) => g.id === guardId);
  const thief = charOf(w, thiefId);
  // Guards never grab NPCs (SPEC §6.12).
  if (!guard || !thief || thief.side === null || !catchable(ctx, thiefId)) return;
  returnLoot(ctx, thief);
  const tip = kind === 'guardTip' && tipper !== undefined;
  const paid = settle(
    ctx,
    thief,
    tip ? { by: 'tip', tipper: sideOfPlayer(w, tipper) } : { by: 'guard' },
  );
  const taken = paid.pot;
  // The tipper's cut (¼ of the pot) is paid on their phone only (SPEC §6.13).
  if (tip) {
    const cut = paid.tipper;
    if (cut > 0) {
      ctx.emit({ ch: 'phone', player: tipper, e: 'tipPayout', amount: cut });
      ctx.emit({ ch: 'phone', player: tipper, e: 'bagChanged' });
    }
  }
  caughtBeat(ctx, thief);
  ctx.emit({ ch: 'tv', e: 'caught', thief: thief.id, to: guard.id, coins: taken });
  const p = playerOf(thief);
  if (p !== null) {
    ctx.emit({ ch: 'phone', player: p, e: 'caught', pot: taken, by: 'guard' });
    ctx.emit({ ch: 'phone', player: p, e: 'bagChanged' });
  }
  guard.alert = false;
  guard.vx = 0;
  guard.vy = 0;
  guard.pose = 'catch';
  const slot = freeStocksSlot(w);
  if (slot >= 0) {
    guard.mode = { k: 'march', thief: thief.id, slot };
  } else {
    // Every stocks slot taken: pot only, then the usual immunity (BUILD_PLAN §8 [TF9]).
    thief.immuneUntil =
      w.tick + ctx.ticks(GUARD_TUNING.caughtMs) + ctx.ticks(ctx.content.balance.stocks.immunityMs);
    guard.mode = { k: 'patrol', waypoint: 0 };
  }
}

/** The march arrived (or timed out): the thief stands in the stocks for `stocks.ms` (SPEC §6.13). */
export function lockIn(ctx: StepContext, thiefId: EntityId, slot: number): void {
  const w = ctx.world;
  const thief = charOf(w, thiefId);
  const s = w.stocks.find((x) => x.slot === slot);
  if (!thief || !s) return;
  const until = w.tick + ctx.ticks(ctx.content.balance.stocks.ms);
  const at = ctx.content.layout.stocks.slots[slot]!;
  thief.x = at.x;
  thief.y = at.y;
  thief.vx = 0;
  thief.vy = 0;
  thief.facing = Math.PI / 2;
  thief.activity = { k: 'stocks', slot, until };
  thief.pose = 'stocks';
  s.character = thief.id;
  s.releaseAt = until;
  ctx.emit({ ch: 'tv', e: 'stocksIn', character: thief.id, slot, releaseAt: until });
  const p = playerOf(thief);
  if (p !== null) ctx.emit({ ch: 'phone', player: p, e: 'stocks', releaseAt: until });
}

function frontOf(ctx: StepContext, slot: number): Vec2 {
  const s = ctx.content.layout.stocks;
  const p = s.slots[slot] ?? s.slots[0]!;
  return { x: p.x, y: s.rect.y - GUARD_TUNING.stocksFront };
}

/** Stocks countdowns, releases and immunity; ends in-person caught beats (SPEC §6.13). */
function stepStocks(ctx: StepContext): void {
  const w = ctx.world;
  for (const s of w.stocks) {
    if (s.character === null) continue;
    const c = charOf(w, s.character);
    if (!c) {
      s.character = null;
      continue;
    }
    if (w.tick < s.releaseAt) {
      // Controls disabled: pinned to the slot.
      const at = ctx.content.layout.stocks.slots[s.slot]!;
      c.x = at.x;
      c.y = at.y;
      c.vx = 0;
      c.vy = 0;
      continue;
    }
    const out = frontOf(ctx, s.slot);
    c.x = out.x;
    c.y = out.y;
    c.activity = { k: 'free' };
    c.pose = 'idle';
    c.immuneUntil = w.tick + ctx.ticks(ctx.content.balance.stocks.immunityMs);
    s.character = null;
    ctx.emit({ ch: 'tv', e: 'stocksOut', character: c.id });
    const p = playerOf(c);
    if (p !== null) ctx.emit({ ch: 'phone', player: p, e: 'released' });
  }
  for (const c of w.characters) {
    if (c.activity.k !== 'caught') continue;
    const marched = w.guards.some((g) => g.mode.k === 'march' && g.mode.thief === c.id);
    if (marched) continue;
    c.vx = 0;
    c.vy = 0;
    if (w.tick >= c.activity.until) c.activity = { k: 'free' };
  }
}

export function step(ctx: StepContext): void {
  const w = ctx.world;
  trackSteals(w);
  if (w.phase === 'play') {
    for (const c of w.characters) {
      if (c.control.k !== 'player') continue;
      if (inputEdges(w, c.control.playerId).catchRose) inPerson(ctx, c.id);
    }
  }
  stepStocks(ctx);
}

export const catches: CatchesApi = {
  inPerson,
  byGuard,
  catchable,
};
