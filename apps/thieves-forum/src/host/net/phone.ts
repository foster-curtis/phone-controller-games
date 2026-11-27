// Private phone traffic for one round (SPEC §2, §6.11, §6.17, §12.5): `phone` sim events become host →
// phone messages sent to that player only (never the TV, never another phone); stall views go out on
// open and again on every change of that stall, coalesced to at most one send per
// `STALL_VIEW_MIN_MS` (BUILD_PLAN TF12 risk: jitter on fast changes); hold events feed the phone's
// estimator; the context main button is re-sent when it changes. Times on the wire are wall ms: sim
// ms are divided by the debug `timeScale` so phone bars and countdowns match what the TV shows.
import type { Content } from '../../content/types';
import type { HostMsg, PackItem } from '../../shared/messages';
import type { StallView } from '../../shared/viewer/types';
import type { PhoneEvent } from '../sim/events';
import type { Ledger } from '../sim/ledger/types';
import { stallViewFor } from '../sim/stalls';
import type { Character, PlayerId, StallId, World } from '../sim/types';
import { STEP_MS } from '../sim/types';
import { mainAction } from './registry';
import type { ContextProvider } from './types';

/** Stall-view resends for one phone are at least this far apart, wall ms (≤ 10 Hz). */
export const STALL_VIEW_MIN_MS = 100;

/** Activities that leave Catch! dead (SPEC §6.13: caught, marched, in the stocks, frozen). */
const NO_CATCH = new Set(['caught', 'marched', 'stocks', 'handsUp', 'entering', 'leaving']);

export interface PhoneRouterOptions {
  content: Content;
  world: () => World | null;
  ledger: () => Ledger | null;
  character: (player: PlayerId) => Character | null;
  send: (msg: HostMsg, to: PlayerId) => void;
  /** Sim ms per wall ms (debug `timeScale`, 1 normally). */
  timeScale: () => number;
  providers: readonly ContextProvider[];
  /** The screen to show a phone leaving the stocks (the match's `play` screen). */
  onReleased: (player: PlayerId) => void;
}

interface PhoneSlot {
  /** The stall whose view this phone has open, or null. */
  stall: StallId | null;
  /** A change is waiting for the coalescing window. */
  dirty: boolean;
  lastSentAt: number;
  lastView: string;
  context: string;
  /** The pot of the last guard catch, for the stocks screen. */
  pot: number;
}

export interface PhoneRouter {
  /** One `phone` event from the last step (wall `now` for the coalescing window). */
  event(e: PhoneEvent, now: number): void;
  /** Coalesced stall views and changed contexts; call after each batch of steps. */
  flush(now: number): void;
  /** Re-sends a phone's private state (rejoin, round start). */
  resync(player: PlayerId, now: number): void;
  /** Closes every open view and blanks the context (hands up, round end). */
  closeAll(players: readonly PlayerId[]): void;
  /** Forgets everything (a new round). */
  reset(): void;
  /** The bag message for a player from the ledger, or null. */
  bag(player: PlayerId): HostMsg | null;
}

export function createPhoneRouter(o: PhoneRouterOptions): PhoneRouter {
  const slots = new Map<PlayerId, PhoneSlot>();
  const slot = (p: PlayerId): PhoneSlot => {
    let s = slots.get(p);
    if (!s) {
      s = { stall: null, dirty: false, lastSentAt: -Infinity, lastView: '', context: '', pot: 0 };
      slots.set(p, s);
    }
    return s;
  };
  const wall = (simMs: number) => Math.max(0, Math.round(simMs / o.timeScale()));
  const itemName = (id: string) => o.content.items.find((i) => i.id === id)?.name ?? id;

  function bag(player: PlayerId): HostMsg | null {
    const c = o.character(player);
    const l = o.ledger();
    const acc = c?.side && l ? l.account(c.side) : null;
    if (!acc) return null;
    const pack: PackItem[] = acc.pack.map((e) => ({
      item: e.item,
      name: itemName(e.item),
      value: e.value,
      weight: e.weight,
    }));
    return {
      t: 'bag',
      bag: acc.purse,
      pack,
      weight: pack.reduce((s, e) => s + e.weight, 0),
      cap: o.content.balance.match.packCapacity,
    };
  }

  function viewOf(player: PlayerId, stall: StallId): StallView | null {
    const w = o.world();
    const s = w?.stalls.find((x) => x.id === stall);
    if (!w || !s) return null;
    const v = stallViewFor(w, s, o.character(player), o.content);
    const scale = (rows: StallView['counter']) =>
      rows.map((r) => ({ ...r, grabMs: wall(r.grabMs) }));
    return { ...v, counter: scale(v.counter), shelf: scale(v.shelf) };
  }

  function sendView(player: PlayerId, now: number): void {
    const s = slot(player);
    s.dirty = false;
    if (s.stall === null) return;
    const view = viewOf(player, s.stall);
    if (!view) return;
    const sig = JSON.stringify(view);
    s.lastSentAt = now;
    if (sig === s.lastView) return;
    s.lastView = sig;
    o.send({ t: 'stallView', view }, player);
  }

  function closeView(player: PlayerId): void {
    const s = slot(player);
    if (s.stall === null && s.lastView === '') return;
    s.stall = null;
    s.dirty = false;
    s.lastView = '';
    o.send({ t: 'stallView', view: null }, player);
  }

  function dialog(player: PlayerId, open: boolean, stall: StallId): void {
    if (!open) {
      o.send({ t: 'dialog', open: false, buy: [], ask: [] }, player);
      return;
    }
    const s = o.world()?.stalls.find((x) => x.id === stall);
    const buy = [];
    const ask = [];
    for (const sl of s?.slots ?? []) {
      if (sl.item === null) continue;
      const def = o.content.items.find((i) => i.id === sl.item);
      if (!def) continue;
      buy.push({ item: def.id, name: def.name, price: def.value });
      if (sl.row === 'shelf' && !sl.forward)
        ask.push({ slot: sl.slot, item: def.id, name: def.name });
    }
    o.send({ t: 'dialog', open: true, buy, ask }, player);
  }

  function context(player: PlayerId, force = false): void {
    const w = o.world();
    const c = o.character(player);
    const live = w !== null && c !== null && w.phase === 'play';
    const main = live
      ? mainAction(o.providers, { world: w, character: c, content: o.content })
      : null;
    const msg: HostMsg = {
      t: 'context',
      main,
      tossReadyInMs: 0, // coin toss is TF13
      tip: false, // tip-offs are TF14
      catch: live && !NO_CATCH.has(c.activity.k),
    };
    const sig = JSON.stringify(msg);
    const s = slot(player);
    if (!force && sig === s.context) return;
    s.context = sig;
    o.send(msg, player);
  }

  function toast(
    player: PlayerId,
    kind: 'gain' | 'lucky' | 'loss' | 'info',
    text: string,
    amount?: number,
  ) {
    o.send({ t: 'toast', kind, text, ...(amount !== undefined ? { amount } : {}) }, player);
  }

  function event(e: PhoneEvent, now: number): void {
    const p = e.player;
    switch (e.e) {
      case 'holdStart':
        o.send(
          {
            t: 'holdStart',
            id: e.hold,
            kind: e.kind,
            durationMs: wall(e.durationMs),
            elapsedMs: 0,
            ...(e.stall !== undefined ? { stall: e.stall } : {}),
            ...(e.slot !== undefined ? { slot: e.slot } : {}),
          },
          p,
        );
        return;
      case 'holdEnd':
        o.send({ t: 'holdEnd', id: e.hold, result: e.result }, p);
        return;
      case 'grabbed':
        // Phone only (SPEC §6.7, §6.11): the item pops into the bag, "+value".
        toast(p, 'gain', `+${e.value} ${itemName(e.item)}`, e.value);
        return;
      case 'pickpocketed':
        toast(p, e.lucky ? 'lucky' : 'gain', `+${e.amount}`, e.amount);
        return;
      case 'robbed':
        toast(p, 'loss', `Your purse feels lighter… −${e.amount}`, -e.amount);
        return;
      case 'bought':
        toast(p, 'info', `${itemName(e.item)} −${e.price}`, -e.price);
        return;
      case 'sold':
        toast(p, e.lucky ? 'lucky' : 'gain', `+${e.price}`, e.price);
        return;
      case 'wrongGrab':
        toast(p, 'loss', `Wrong grab −${e.penalty}`, -e.penalty);
        return;
      case 'rightGrab':
        toast(p, 'gain', `Thief caught! +${e.pot}`, e.pot);
        return;
      case 'tipPayout':
        toast(p, 'gain', `+${e.amount}`, e.amount);
        return;
      case 'tipResult':
        o.send({ t: 'tipResult', result: e.result, fee: e.fee }, p);
        return;
      case 'caught':
        slot(p).pot = e.pot;
        o.send({ t: 'caught', pot: e.pot, by: e.by }, p);
        closeView(p);
        return;
      case 'stocks': {
        const w = o.world();
        const ms = w ? Math.max(0, (e.releaseAt - w.tick) * STEP_MS) : 0;
        o.send({ t: 'screen', screen: { s: 'stocks', pot: slot(p).pot, endsInMs: wall(ms) } }, p);
        return;
      }
      case 'released':
        o.onReleased(p);
        context(p, true);
        return;
      case 'bagChanged': {
        const m = bag(p);
        if (m) o.send(m, p);
        return;
      }
      case 'stallView': {
        const s = slot(p);
        if (e.stall === null) return closeView(p);
        if (s.stall !== e.stall) {
          s.stall = e.stall;
          s.lastView = '';
          sendView(p, now); // open: at once
        } else s.dirty = true;
        return;
      }
      case 'dialog':
        dialog(p, e.open, e.stall);
        return;
      case 'context':
        context(p);
        return;
      default:
        // sellSheet, pawnSheet, tossed, handOff: TF13, TF16.
        return;
    }
  }

  return {
    event,
    flush(now) {
      for (const [p, s] of slots) {
        if (s.dirty && s.stall !== null && now - s.lastSentAt >= STALL_VIEW_MIN_MS)
          sendView(p, now);
        if (o.character(p)) context(p);
      }
      const w = o.world();
      if (!w) return;
      // Characters with a phone that has no slot yet still need a context.
      for (const c of w.characters) {
        if (c.control.k !== 'player' || slots.has(c.control.playerId)) continue;
        context(c.control.playerId);
      }
    },
    resync(player, now) {
      const c = o.character(player);
      if (!c) return;
      const s = slot(player);
      o.send({ t: 'outfit', outfit: { ...c.outfit } }, player);
      const b = bag(player);
      if (b) o.send(b, player);
      context(player, true);
      if (s.stall !== null) {
        s.lastView = '';
        sendView(player, now);
      }
    },
    closeAll(players) {
      for (const p of players) {
        closeView(p);
        const s = slot(p);
        s.context = '';
        o.send({ t: 'context', main: null, tossReadyInMs: 0, tip: false, catch: false }, p);
      }
    },
    reset: () => slots.clear(),
    bag,
  };
}
