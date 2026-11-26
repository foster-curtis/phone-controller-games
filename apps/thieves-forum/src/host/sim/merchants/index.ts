// Merchants and stall theft (SPEC §6.6, §6.7, §6.9 merchant side, §6.12 merchant calls; §12.3 step 4).
// Each open stall gets its stock and one merchant on the first step. Every step: restock, then the
// phone's BROWSE / grab / dialog commands, then completed grabs (item to the pack, `stallChanged` only on
// the TV), then each merchant: his serving queue, the task he's on (serve with a dialog for players,
// fetch, show, leave on the counter, out from behind the counter), and the glance (wind-up beat, then
// the look; a look landing on a live grab at his own stall is a merchant catch → shout + alert).
// Frozen at TF0 (BUILD_PLAN §3): the exported names and signatures; the bodies are the owner's.
import type { Rng } from '@pcg/game-kit';
import type { StallSlotDef, Vec2 } from '../../../content/types';
import { guards } from '../guards';
import { holds } from '../holds';
import { packWeightOf, restock, slotState, stalls, THEFT_HOOKS, tileGrabMs } from '../stalls';
import type { StepContext } from '../systems';
import {
  STEP_MS,
  type Character,
  type EntityId,
  type Merchant,
  type PlayerId,
  type SimCommand,
  type Stall,
  type StallId,
  type World,
} from '../types';
import { glanceIntervalTicks, strongestSuspicion } from './glance';
import { MERCHANT_TUNING as T } from './tuning';
import type { AwayReason, MerchantDesk, MerchantsApi, MerchantTask } from './types';

export type { AwayReason, MerchantDesk, MerchantsApi, MerchantTask } from './types';
export { glanceIntervalTicks, strongestSuspicion, suspicionFactor } from './glance';
export { MERCHANT_TUNING } from './tuning';

const DT = STEP_MS / 1000;
/** Facing the counter's customers (+y, the lane) and the back shelf (−y). */
const FACE_COUNTER = Math.PI / 2;
const FACE_SHELF = -Math.PI / 2;

// ---- lookups -----------------------------------------------------------------------------------

const charOf = (w: World, id: EntityId | null) =>
  id === null ? null : (w.characters.find((c) => c.id === id) ?? null);
const stallOf = (w: World, id: StallId) => w.stalls.find((s) => s.id === id) ?? null;
const merchantOf = (w: World, id: EntityId) => w.merchants.find((m) => m.id === id) ?? null;
const slotIn = (s: Stall | null, slot: number) => s?.slots.find((x) => x.slot === slot) ?? null;
const defOf = (ctx: StepContext, s: Stall) => ctx.content.layout.stalls[s.id]!;
const playerOf = (c: Character): PlayerId | null =>
  c.control.k === 'player' ? c.control.playerId : null;
const rngOf = (ctx: StepContext, m: Merchant): Rng => ctx.rng(`merchant:${m.stall}`);

function desk(m: Merchant): MerchantDesk {
  return (m.desk ??= { queue: [], served: [], task: { k: 'idle' }, leftOut: null });
}

/** The stall a character is at: browsing it, or mid-grab on one of its slots. */
function stallAt(w: World, c: Character): StallId | null {
  if (c.activity.k === 'browsing') return c.activity.stall;
  if (c.activity.k === 'holding') {
    const id = c.activity.hold;
    const h = w.holds.find((x) => x.id === id);
    return h?.target.k === 'item' ? h.target.stall : null;
  }
  return null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const counterSpot = (d: StallSlotDef, x: number): Vec2 => ({
  x: clamp(x, d.customer.x0, d.customer.x1),
  y: d.merchantCounterY,
});
const shelfSpot = (d: StallSlotDef, x: number): Vec2 => ({
  x: clamp(x, d.customer.x0, d.customer.x1),
  y: d.merchantShelfY,
});

/** Sets his velocity toward `to` (arriving exactly); true once he's there. */
function walk(ctx: StepContext, m: Merchant, to: Vec2): boolean {
  const dx = to.x - m.x;
  const dy = to.y - m.y;
  const d = Math.hypot(dx, dy);
  if (d <= T.arrive) {
    m.vx = 0;
    m.vy = 0;
    return true;
  }
  const v = Math.min(ctx.content.balance.merchants.walkSpeed, d / DT);
  m.vx = (dx / d) * v;
  m.vy = (dy / d) * v;
  m.facing = Math.atan2(dy, dx);
  return false;
}

function stand(m: Merchant, facing: number): void {
  m.vx = 0;
  m.vy = 0;
  m.facing = facing;
}

// ---- creation (first step) ---------------------------------------------------------------------

function createMerchant(ctx: StepContext, s: Stall): Merchant {
  const w = ctx.world;
  const d = defOf(ctx, s);
  const m: Merchant = {
    id: w.nextId++,
    x: (d.customer.x0 + d.customer.x1) / 2,
    y: d.merchantCounterY,
    vx: 0,
    vy: 0,
    r: ctx.content.balance.movement.bodyRadius,
    rig: 'merchant',
    stall: s.id,
    facing: FACE_COUNTER,
    gait: 'idle',
    pose: 'idle',
    spot: 'counter',
    helping: null,
    glance: null,
    nextGlanceAt: 0,
    suspicion: [],
    carrying: null,
    coin: null,
    shouting: null,
    desk: { queue: [], served: [], task: { k: 'idle' }, leftOut: null },
  };
  m.nextGlanceAt =
    w.tick + glanceIntervalTicks(rngOf(ctx, m), ctx.content.balance.merchants, 1, ctx.ticks);
  return m;
}

/** Stocks every open stall and gives it its merchant (SPEC §6.5, §6.6), once per round. */
export function initStalls(ctx: StepContext): void {
  const w = ctx.world;
  for (const s of w.stalls) {
    if (!s.open || s.merchant !== null) continue;
    if (s.slots.length === 0) s.slots = stalls.stock(ctx.rng('stock'), s.shop, ctx.content);
    const m = createMerchant(ctx, s);
    w.merchants.push(m);
    s.merchant = m.id;
  }
}

// ---- dialog (SPEC §6.6) ------------------------------------------------------------------------

function closeDialog(ctx: StepContext, m: Merchant): void {
  const t = desk(m).task;
  if (t.k !== 'serve' || !t.dialog) return;
  t.dialog = false;
  const c = charOf(ctx.world, t.customer);
  const p = c && playerOf(c);
  if (p) ctx.emit({ ch: 'phone', player: p, e: 'dialog', open: false, stall: m.stall });
}

function served(m: Merchant, who: EntityId): void {
  const dk = desk(m);
  if (!dk.served.includes(who)) dk.served.push(who);
}

function setTask(m: Merchant, task: MerchantTask): void {
  desk(m).task = task;
  m.helping =
    task.k === 'serve' || task.k === 'show' || (task.k === 'fetch' && task.customer !== null)
      ? task.customer
      : null;
}

/** "Just browsing" (SPEC §6.6): suspicion of `of` for `decayMs`; his next glance comes sooner. */
function suspectOf(ctx: StepContext, m: Merchant, of: EntityId): void {
  const b = ctx.content.balance.merchants;
  const decay = ctx.ticks(b.suspicion.decayMs);
  const until = ctx.world.tick + decay;
  const e = m.suspicion.find((s) => s.of === of);
  if (e) e.until = until;
  else m.suspicion.push({ of, until });
  if (m.glance === null) {
    const next =
      ctx.world.tick + glanceIntervalTicks(rngOf(ctx, m), b, b.suspicion.glanceMult, ctx.ticks);
    m.nextGlanceAt = Math.min(m.nextGlanceAt, next);
  }
}

// ---- carrying, leaving on the counter, returning to the shelf (SPEC §6.6) ----------------------

/** The shelf slot he's carrying, if any. */
function carriedSlot(m: Merchant): number | null {
  const t = desk(m).task;
  if (m.carrying === null) return null;
  return t.k === 'show' || t.k === 'fetch' ? t.slot : null;
}

/** Lays the carried item on the counter: grabbable there at its normal time until he returns it. */
function layOut(ctx: StepContext, m: Merchant, slot: number): void {
  const sl = slotIn(stallOf(ctx.world, m.stall), slot);
  m.carrying = null;
  if (!sl || sl.item === null) return;
  sl.row = 'counter';
  sl.forward = true;
  desk(m).leftOut = slot;
  ctx.emit({ ch: 'tv', e: 'stallChanged', stall: m.stall });
}

/** Distracted while carrying: maybe leave it on the counter, else put it straight back. */
function dropCarried(ctx: StepContext, m: Merchant): void {
  const slot = carriedSlot(m);
  if (slot === null) return;
  if (rngOf(ctx, m).next() < ctx.content.balance.merchants.leaveOutChance) layOut(ctx, m, slot);
  else m.carrying = null;
}

/** Picks the left-out item back up off the counter and walks it to the shelf. */
function startStow(ctx: StepContext, m: Merchant): boolean {
  const dk = desk(m);
  const slot = dk.leftOut;
  if (slot === null) return false;
  const sl = slotIn(stallOf(ctx.world, m.stall), slot);
  if (!sl || sl.item === null || !sl.forward) {
    dk.leftOut = null; // grabbed or bought meanwhile
    return false;
  }
  if (sl.heldBy !== null) return false; // someone's hand is on it: wait
  sl.row = 'shelf';
  sl.forward = false;
  dk.leftOut = null;
  m.carrying = sl.item;
  ctx.emit({ ch: 'tv', e: 'stallChanged', stall: m.stall });
  setTask(m, { k: 'fetch', phase: 'stow', slot, customer: null });
  return true;
}

/** A shelf slot he could fetch now (has an item, nobody holding it). */
function fetchable(s: Stall, slot: number): boolean {
  const sl = slotIn(s, slot);
  return !!sl && sl.row === 'shelf' && sl.item !== null && sl.heldBy === null;
}

// ---- out from behind the counter (SPEC §6.7, §6.9) ---------------------------------------------

function sendAway(ctx: StepContext, m: Merchant, to: Vec2, reason: AwayReason): void {
  const s = stallOf(ctx.world, m.stall);
  if (!s) return;
  const d = defOf(ctx, s);
  dropCarried(ctx, m);
  closeDialog(ctx, m);
  m.glance = null;
  const t = desk(m).task;
  const back = [d.exit, counterSpot(d, (d.customer.x0 + d.customer.x1) / 2)];
  const path = t.k === 'away' ? [{ ...to }] : [d.exit, { ...to }];
  setTask(m, { k: 'away', reason, path, back, until: 0, waiting: false });
  m.spot = 'away';
  if (reason === 'coin') ctx.emit({ ch: 'tv', e: 'merchantQuestion', merchant: m.id });
}

function stepAway(ctx: StepContext, m: Merchant, t: Extract<MerchantTask, { k: 'away' }>): void {
  const w = ctx.world;
  m.spot = 'away';
  if (t.path.length > 0) {
    if (walk(ctx, m, t.path[0]!)) t.path.shift();
    if (t.path.length > 0) return;
  }
  if (!t.waiting) {
    t.waiting = true;
    t.until = w.tick + ctx.ticks(T.awayWaitMs);
  }
  if (w.tick < t.until) return stand(m, m.facing);
  if (m.coin !== null) {
    const coin = m.coin;
    m.coin = null;
    const i = w.coins.findIndex((c) => c.id === coin);
    if (i >= 0) w.coins.splice(i, 1);
    ctx.emit({ ch: 'tv', e: 'coinPicked', coin, by: m.id });
  }
  if (t.back.length > 0 && walk(ctx, m, t.back[0]!)) t.back.shift();
  if (t.back.length === 0) {
    // Back behind his counter: the shelf is out of reach again (holds cancel any reach, SPEC §6.7).
    m.spot = 'counter';
    stand(m, FACE_COUNTER);
    setTask(m, { k: 'idle' });
  }
}

// ---- the serving queue and tasks (SPEC §6.6) ---------------------------------------------------

/** Refreshes his queue; returns the customers who arrived this step. */
function updateQueue(w: World, m: Merchant): EntityId[] {
  const dk = desk(m);
  const present = new Set<EntityId>();
  for (const c of w.characters) if (stallAt(w, c) === m.stall) present.add(c.id);
  dk.queue = dk.queue.filter((id) => present.has(id));
  dk.served = dk.served.filter((id) => present.has(id));
  const arrived = [...present].filter((id) => !dk.queue.includes(id));
  dk.queue.push(...arrived);
  m.suspicion = m.suspicion.filter((s) => s.until > w.tick);
  return arrived;
}

function stepTask(ctx: StepContext, m: Merchant, arrived: readonly EntityId[]): void {
  const w = ctx.world;
  const s = stallOf(w, m.stall)!;
  const d = defOf(ctx, s);
  const dk = desk(m);
  const b = ctx.content.balance.merchants;
  const t = dk.task;
  const inQueue = (id: EntityId | null) => id !== null && dk.queue.includes(id);

  // Another customer arrives while he shows a shelf item: he may leave it on the counter (§6.6).
  if (
    arrived.length > 0 &&
    m.carrying !== null &&
    (t.k === 'show' || (t.k === 'fetch' && t.phase === 'bring'))
  ) {
    if (rngOf(ctx, m).next() < b.leaveOutChance) {
      if (t.customer !== null) served(m, t.customer);
      layOut(ctx, m, t.slot);
      setTask(m, { k: 'idle' });
      return;
    }
  }

  switch (t.k) {
    case 'idle': {
      if (startStow(ctx, m)) return;
      const next = dk.queue.find((id) => !dk.served.includes(id));
      if (next === undefined) return stand(m, FACE_COUNTER);
      setTask(m, { k: 'serve', customer: next, until: 0, arrived: false, dialog: false });
      return;
    }
    case 'serve': {
      const c = charOf(w, t.customer);
      if (!c || !inQueue(t.customer)) {
        closeDialog(ctx, m);
        setTask(m, { k: 'idle' });
        return;
      }
      if (!t.arrived) {
        if (!walk(ctx, m, counterSpot(d, c.x))) return;
        t.arrived = true;
        stand(m, FACE_COUNTER);
        const p = playerOf(c);
        if (p) {
          t.dialog = true;
          t.until = w.tick + ctx.ticks(T.dialogMs);
          ctx.emit({ ch: 'phone', player: p, e: 'dialog', open: true, stall: m.stall });
        } else {
          const [lo, hi] = T.helpMs;
          t.until = w.tick + ctx.ticks(lo + (hi - lo) * rngOf(ctx, m).next());
          // An NPC may call him out from behind the counter (SPEC §6.7 "called away by an NPC").
          if (rngOf(ctx, m).next() < T.npcCallChance) {
            served(m, c.id);
            sendAway(ctx, m, { x: c.x, y: (d.counterY + c.y) / 2 }, 'npc');
          }
        }
        return;
      }
      stand(m, FACE_COUNTER);
      if (w.tick < t.until) return;
      served(m, c.id);
      if (t.dialog) {
        closeDialog(ctx, m); // no pick in time reads as Leave
        setTask(m, { k: 'idle' });
        return;
      }
      // Sometimes he brings a shelf item forward to show an NPC (SPEC §6.6).
      const shelf = s.slots.filter((x) => fetchable(s, x.slot));
      if (shelf.length > 0 && rngOf(ctx, m).next() < b.bringForwardChance) {
        const pick = shelf[rngOf(ctx, m).int(0, shelf.length - 1)]!;
        setTask(m, { k: 'fetch', phase: 'get', slot: pick.slot, customer: c.id });
      } else setTask(m, { k: 'idle' });
      return;
    }
    case 'fetch': {
      const sl = slotIn(s, t.slot);
      if (t.phase === 'get') {
        m.spot = 'shelf';
        if (!fetchable(s, t.slot) || (t.customer !== null && !inQueue(t.customer))) {
          m.spot = 'counter';
          setTask(m, { k: 'idle' });
          return;
        }
        if (!walk(ctx, m, shelfSpot(d, m.x))) return;
        m.carrying = sl!.item;
        t.phase = 'bring';
        return;
      }
      if (t.phase === 'bring') {
        m.spot = 'counter';
        const c = charOf(w, t.customer);
        if (!c || !inQueue(t.customer)) {
          setTask(m, { k: 'fetch', phase: 'stow', slot: t.slot, customer: null });
          return;
        }
        if (!walk(ctx, m, counterSpot(d, c.x))) return;
        stand(m, FACE_COUNTER);
        setTask(m, {
          k: 'show',
          slot: t.slot,
          customer: c.id,
          until: w.tick + ctx.ticks(T.showMs),
        });
        return;
      }
      // stow
      m.spot = 'shelf';
      if (!walk(ctx, m, shelfSpot(d, m.x))) return;
      m.carrying = null;
      m.spot = 'counter';
      setTask(m, { k: 'idle' });
      return;
    }
    case 'show': {
      stand(m, FACE_COUNTER);
      if (w.tick < t.until && inQueue(t.customer)) return;
      if (inQueue(t.customer)) served(m, t.customer);
      setTask(m, { k: 'fetch', phase: 'stow', slot: t.slot, customer: null });
      return;
    }
    case 'away':
      return stepAway(ctx, m, t);
  }
}

// ---- glance and merchant catches (SPEC §6.6, §6.7) ---------------------------------------------

/** A look landing on live grabs at his own stall: each is a merchant catch. */
function catchGrabs(ctx: StepContext, m: Merchant): void {
  const w = ctx.world;
  for (const h of [...w.holds]) {
    if (h.result !== null || h.kind !== 'grab' || h.target.k !== 'item') continue;
    if (h.target.stall !== m.stall) continue; // only at his own stall
    const thief = h.actor;
    holds.caught(ctx, thief); // the item never left its slot: it stays on the counter, no money lost
    m.shouting = { at: thief, until: w.tick + ctx.ticks(T.shoutMs) };
    ctx.emit({ ch: 'tv', e: 'shout', by: m.id, at: thief });
    const lane = ctx.content.layout.stalls[m.stall]!.lane;
    guards.raiseAlert(ctx, thief, lane, 'merchantCall');
  }
  if (m.shouting !== null) {
    dropCarried(ctx, m);
    closeDialog(ctx, m);
    if (desk(m).task.k !== 'away') setTask(m, { k: 'idle' });
  }
}

function stepGlance(ctx: StepContext, m: Merchant): void {
  const w = ctx.world;
  const b = ctx.content.balance.merchants;
  // He glances only from behind his counter; away, at the shelf or shouting, any glance is dropped.
  if (m.spot !== 'counter' || m.shouting !== null) {
    m.glance = null;
    return;
  }
  const decay = ctx.ticks(b.suspicion.decayMs);
  if (m.glance === null) {
    if (w.tick < m.nextGlanceAt) return;
    const sus = strongestSuspicion(m, desk(m).queue, w.tick, b.suspicion.glanceMult, decay);
    m.glance = { stage: 'windup', at: sus.of, until: w.tick + ctx.ticks(b.windupMs) };
    ctx.emit({ ch: 'tv', e: 'glanceWindup', by: m.id });
    return;
  }
  if (m.glance.stage === 'windup') {
    if (w.tick < m.glance.until) return;
    m.glance = { stage: 'look', at: m.glance.at, until: w.tick + ctx.ticks(b.lookMs) };
    ctx.emit({ ch: 'tv', e: 'glanceLook', by: m.id });
  }
  catchGrabs(ctx, m);
  // catchGrabs may have set `shouting` (TS keeps the earlier null narrowing, so re-read it).
  const shout = m.shouting as Merchant['shouting'];
  if (shout !== null || w.tick >= m.glance.until) {
    m.glance = null;
    const sus = strongestSuspicion(m, desk(m).queue, w.tick, b.suspicion.glanceMult, decay);
    const after = shout !== null ? shout.until : w.tick;
    m.nextGlanceAt = after + glanceIntervalTicks(rngOf(ctx, m), b, sus.factor, ctx.ticks);
  }
}

function pose(m: Merchant): void {
  const speed = Math.hypot(m.vx, m.vy);
  m.gait = speed > 0.05 ? 'walk' : 'idle';
  if (m.shouting !== null) m.pose = 'point';
  else if (m.glance !== null) m.pose = m.glance.stage === 'windup' ? 'glanceWindup' : 'glanceLook';
  else if (m.carrying !== null) m.pose = 'carry';
  else if (m.spot === 'shelf') m.pose = 'fetch';
  else m.pose = m.gait === 'walk' ? 'walk' : 'idle';
}

// ---- phone commands (SPEC §6.6, §6.7, §6.17) ---------------------------------------------------

function playerChar(w: World, p: PlayerId): Character | null {
  return w.characters.find((c) => c.control.k === 'player' && c.control.playerId === p) ?? null;
}

/** Distance from a point to a stall's customer line. */
function toCustomerLine(d: StallSlotDef, c: Character): number {
  const dx = Math.max(d.customer.x0 - c.x, 0, c.x - d.customer.x1);
  return Math.hypot(dx, c.y - d.customer.y);
}

function browse(ctx: StepContext, c: Character): void {
  if (c.activity.k !== 'free') return;
  let best: { s: Stall; d: number } | null = null;
  for (const s of ctx.world.stalls) {
    if (!s.open || !ctx.content.shops[s.shop].sells) continue; // the pawnbroker's tap is SELL (TF13)
    const d = toCustomerLine(defOf(ctx, s), c);
    if (d <= T.browseReach && (best === null || d < best.d)) best = { s, d };
  }
  if (!best) return;
  c.activity = { k: 'browsing', stall: best.s.id };
  c.vx = 0;
  c.vy = 0;
  c.facing = FACE_SHELF;
  ctx.emit({ ch: 'phone', player: playerOf(c)!, e: 'stallView', stall: best.s.id });
}

function grab(ctx: StepContext, c: Character, stall: StallId, slot: number): void {
  const w = ctx.world;
  if (c.activity.k !== 'browsing' || c.activity.stall !== stall) return;
  const s = stallOf(w, stall);
  const sl = slotIn(s, slot);
  if (!s || !sl || sl.item === null) return;
  const def = ctx.content.items.find((i) => i.id === sl.item);
  if (!def) return;
  if (slotState(w, s, sl, c.id, def, packWeightOf(c), ctx.content) !== 'free') return;
  holds.armGrab(ctx, c.id, stall, slot, tileGrabMs(def, sl));
}

function dialogPick(
  ctx: StepContext,
  c: Character,
  cmd: Extract<SimCommand, { k: 'dialog' }>,
): void {
  const m = ctx.world.merchants.find((mm) => {
    const t = mm.desk?.task;
    return t?.k === 'serve' && t.customer === c.id && t.dialog;
  });
  if (!m) return;
  closeDialog(ctx, m);
  served(m, c.id);
  setTask(m, { k: 'idle' });
  if (cmd.pick === 'browsing') suspectOf(ctx, m, c.id);
  else if (cmd.pick === 'ask') {
    // He turns around to fetch it: his back to the counter (SPEC §6.6, §6.9).
    const s = stallOf(ctx.world, m.stall);
    if (s && fetchable(s, cmd.slot)) {
      setTask(m, { k: 'fetch', phase: 'get', slot: cmd.slot, customer: c.id });
    }
  }
}

function applyCommands(ctx: StepContext): void {
  for (const cmd of ctx.commands) {
    if (cmd.k !== 'browse' && cmd.k !== 'grab' && cmd.k !== 'dialog') continue;
    const c = playerChar(ctx.world, cmd.player);
    if (!c) continue;
    if (cmd.k === 'browse') browse(ctx, c);
    else if (cmd.k === 'grab') grab(ctx, c, cmd.stall, cmd.slot);
    else dialogPick(ctx, c, cmd);
  }
}

/** A browsing player who moves the stick walks away from the stall (closes the view). */
function leaveStalls(ctx: StepContext): void {
  for (const c of ctx.world.characters) {
    const p = playerOf(c);
    if (p === null || c.activity.k !== 'browsing') continue;
    const move = ctx.inputs.get(p)?.move;
    if (!move || (move.x === 0 && move.y === 0)) continue;
    c.activity = { k: 'free' };
    ctx.emit({ ch: 'phone', player: p, e: 'stallView', stall: null });
  }
}

/** Grabs that completed this step (holds, step 2): the item goes to the pack (SPEC §6.7). */
function completeGrabs(ctx: StepContext): void {
  const w = ctx.world;
  for (const h of w.holds) {
    if (h.result !== 'complete' || h.kind !== 'grab' || h.target.k !== 'item') continue;
    const { stall, slot } = h.target;
    const sl = slotIn(stallOf(w, stall), slot);
    const c = charOf(w, h.actor);
    const def = sl?.item == null ? null : ctx.content.items.find((i) => i.id === sl.item);
    if (!c || !def) continue;
    const ledger = THEFT_HOOKS.ledger;
    if (ledger && c.side) {
      const ok = ledger.addItem(c.side, { item: def.id, value: def.value, weight: def.weight });
      if (!ok) continue; // pack full after all: the item stays
    }
    // The only TV trace of a grab: the item leaves the counter (SPEC §6.7, §6.11).
    stalls.take(ctx, stall, slot);
    const p = playerOf(c) ?? (c.control.k === 'npc' ? null : c.control.playerId);
    if (p) {
      ctx.emit({ ch: 'phone', player: p, e: 'grabbed', item: def.id, value: def.value });
      ctx.emit({ ch: 'phone', player: p, e: 'bagChanged' });
    }
  }
}

/** Re-sends the stall view to every player at a stall whose tiles may have changed this step. */
function refreshViews(ctx: StepContext, dirty: ReadonlySet<StallId>): void {
  const w = ctx.world;
  for (const e of w.events)
    if (e.ch === 'tv' && e.e === 'stallChanged') (dirty as Set<StallId>).add(e.stall);
  for (const h of w.holds) {
    if (h.target.k === 'item' && (h.result !== null || h.startTick === w.tick)) {
      (dirty as Set<StallId>).add(h.target.stall);
    }
  }
  if (dirty.size === 0) return;
  for (const c of w.characters) {
    const p = playerOf(c);
    const at = stallAt(w, c);
    if (p !== null && at !== null && dirty.has(at)) {
      ctx.emit({ ch: 'phone', player: p, e: 'stallView', stall: at });
    }
  }
}

// ---- the step (SPEC §12.3 step 4) --------------------------------------------------------------

export function step(ctx: StepContext): void {
  const w = ctx.world;
  initStalls(ctx);
  if (w.phase !== 'play') {
    for (const m of w.merchants) stand(m, m.facing);
    return;
  }
  restock(ctx);
  applyCommands(ctx);
  leaveStalls(ctx);
  completeGrabs(ctx);
  const dirty = new Set<StallId>();
  for (const m of w.merchants) {
    const wasAway = m.spot === 'away';
    const arrived = updateQueue(w, m);
    if (m.shouting !== null && w.tick >= m.shouting.until) m.shouting = null;
    if (m.shouting !== null) stand(m, FACE_COUNTER);
    else stepTask(ctx, m, arrived);
    stepGlance(ctx, m);
    pose(m);
    if (wasAway !== (m.spot === 'away')) dirty.add(m.stall);
  }
  refreshViews(ctx, dirty);
}

// ---- the API -----------------------------------------------------------------------------------

export const merchants: MerchantsApi = {
  callAway(ctx, merchant, to, reason) {
    const m = merchantOf(ctx.world, merchant);
    if (!m || m.shouting !== null) return;
    sendAway(ctx, m, to, reason ?? (m.coin !== null ? 'coin' : 'call'));
  },
  isAway: (m) => m.spot === 'away',
  suspect(ctx, merchant, of) {
    const m = merchantOf(ctx.world, merchant);
    if (m) suspectOf(ctx, m, of);
  },
};

/**
 * Ends the merchant's service of `customer` (TF13 hook: after a Buy… purchase from the dialog the
 * dialog closes and he moves on, SPEC §6.6).
 */
export function endService(ctx: StepContext, merchant: EntityId, customer: EntityId): void {
  const m = merchantOf(ctx.world, merchant);
  const t = m?.desk?.task;
  if (!m || t?.k !== 'serve' || t.customer !== customer) return;
  closeDialog(ctx, m);
  served(m, customer);
  setTask(m, { k: 'idle' });
}
