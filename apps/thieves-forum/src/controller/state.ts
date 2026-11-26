// Phone state and the pure reducer for private host messages (SPEC §6.17, §12.5, §12.7). The host's
// `screen` message drives the router (app.ts); everything else lands here and the play screen reads it.
// Timers ride as `endsInMs` and become absolute deadlines on receipt (BUILD_PLAN §8 [plan] timers).
// Never imports host code.
import type { Outfit } from '../content/types';
import type { HoldKind, HoldResult } from '../shared/hold';
import type {
  HostMsg,
  MainAction,
  PackItem,
  PawnSheet,
  SellSheet,
  ToastKind,
} from '../shared/messages';
import type { PlayerColorId } from '../shared/theme';
import type { HitArea, StallView, TipSnapshot } from '../shared/viewer/types';

export interface HoldInfo {
  id: number;
  kind: HoldKind;
  stall?: number;
  slot?: number;
  /** Set by `holdEnd complete`; the bar shows 100% only then (SPEC §3). */
  result?: HoldResult;
  endedAt?: number;
}

export interface DialogState {
  buy: { item: string; name: string; price: number }[];
  ask: { slot: number; item: string; name: string }[];
}

export interface TipState {
  snapshot: TipSnapshot;
  hits: HitArea[];
  fee: number;
  /** Absolute deadline on the app clock. */
  until: number;
}

export interface PhoneState {
  name: string;
  color: PlayerColorId | null;
  bag: number;
  pack: PackItem[];
  weight: number;
  cap: number;
  outfit: Outfit | null;
  main: MainAction;
  tossReadyAt: number;
  tipOk: boolean;
  catchOk: boolean;
  stall: StallView | null;
  dialog: DialogState | null;
  sell: SellSheet | null;
  pawn: { sheet: PawnSheet; until: number } | null;
  packOpen: boolean;
  tip: TipState | null;
  caught: { pot: number; by: 'player' | 'guard'; at: number } | null;
  hold: HoldInfo | null;
  /** The hold this phone is pressing now (optimistic bar until the host's `holdStart` arrives). */
  press: { kind: HoldKind; slot?: number } | null;
}

export function initialState(): PhoneState {
  return {
    name: '',
    color: null,
    bag: 0,
    pack: [],
    weight: 0,
    cap: 0,
    outfit: null,
    main: null,
    tossReadyAt: 0,
    tipOk: false,
    catchOk: false,
    stall: null,
    dialog: null,
    sell: null,
    pawn: null,
    packOpen: false,
    tip: null,
    caught: null,
    hold: null,
    press: null,
  };
}

/** Drops everything a screen change ends (sheets, hold, context). Bag, pack and outfit persist. */
export function clearRound(s: PhoneState): void {
  s.main = null;
  s.tossReadyAt = 0;
  s.tipOk = false;
  s.catchOk = false;
  s.stall = null;
  s.dialog = null;
  s.sell = null;
  s.pawn = null;
  s.packOpen = false;
  s.tip = null;
  s.hold = null;
  s.press = null;
  s.caught = null;
}

/** What a message asks the app to show outside the state: a small toast. */
export interface Effect {
  toast?: { kind: ToastKind; text: string };
}

/**
 * Applies one private host message. `screen`, `joined`, `outdated` and blob `chunk`s are the app's.
 */
export function applyHostMsg(s: PhoneState, m: HostMsg, now: number): Effect {
  switch (m.t) {
    case 'stallView':
      s.stall = m.view;
      if (!m.view) s.dialog = null; // walking away closes everything over it
      return {};
    case 'holdStart':
      s.hold = {
        id: m.id,
        kind: m.kind,
        ...(m.stall !== undefined ? { stall: m.stall } : {}),
        ...(m.slot !== undefined ? { slot: m.slot } : {}),
      };
      return {};
    case 'holdEnd':
      if (s.hold && s.hold.id === m.id) {
        if (m.result === 'complete') {
          s.hold.result = m.result;
          s.hold.endedAt = now;
        } else s.hold = null;
      }
      return {};
    case 'toast':
      return { toast: { kind: m.kind, text: m.text } };
    case 'bag':
      s.bag = m.bag;
      s.pack = m.pack;
      s.weight = m.weight;
      s.cap = m.cap;
      return {};
    case 'outfit':
      s.outfit = m.outfit;
      return {};
    case 'context':
      s.main = m.main;
      s.tossReadyAt = now + m.tossReadyInMs;
      s.tipOk = m.tip;
      s.catchOk = m.catch;
      return {};
    case 'dialog':
      s.dialog = m.open ? { buy: m.buy, ask: m.ask } : null;
      return {};
    case 'sellSheet':
      s.sell = m.sheet;
      return {};
    case 'pawnSheet':
      s.pawn = m.sheet ? { sheet: m.sheet, until: now + m.sheet.endsInMs } : null;
      return {};
    case 'caught':
      s.caught = { pot: m.pot, by: m.by, at: now };
      s.hold = null;
      return {};
    case 'tipSnapshot':
      s.tip = { snapshot: m.snapshot, hits: m.hits, fee: m.fee, until: now + m.endsInMs };
      return {};
    case 'tipResult':
      s.tip = null;
      if (m.result === 'missed') return { toast: { kind: 'loss', text: `Tip missed −${m.fee}` } };
      if (m.result === 'expired') return { toast: { kind: 'info', text: 'Tip-off expired' } };
      return {};
    default:
      return {};
  }
}

/** Main button priority when several apply (SPEC §6.17): BROWSE > SELL > PICKPOCKET. */
export function resolveMain(avail: readonly NonNullable<MainAction>[]): MainAction {
  for (const a of ['browse', 'sell', 'pickpocket'] as const) if (avail.includes(a)) return a;
  return null;
}

export const MAIN_LABEL: Record<NonNullable<MainAction>, string> = {
  browse: 'BROWSE',
  sell: 'SELL',
  pickpocket: 'PICKPOCKET',
};
