// Game messages between phones and the host (SPEC §2, §6.17, §6.18, §12.5), carried in relay
// `send.data`. Phones send input state (stick + `hold`/`catch` bits) plus discrete UI events; the host
// sends each phone its screen and private events. Nothing here ever goes to the TV's scene: private
// feedback (grab success, pickpocket loot, tip payout) reaches only that player's phone (§6.11).
// Frozen at TF0 (BUILD_PLAN §3): additive changes only (new optional fields, new union members).
import { maxPlayers, minPlayers } from '../../game.meta';
import type { EntryId, FabricId, ItemId, Outfit } from '../content/types';
import { type Ack, type Chunk, isAck, isChunk } from './blob-transfer/types';
import { HOLD_KINDS, HOLD_RESULTS, type HoldEndMsg, type HoldStartMsg } from './hold';
import { PLAYER_COLOR_IDS, theme, type PlayerColorId } from './theme';
import type { HitArea, StallView, StallViewItem, TipSnapshot } from './viewer/types';

/** Relay namespace, game ID "thieves-forum" (SPEC §4). */
export const GAME_ID = 'thieves-forum';
/** Sent in `join`; a mismatch gets `outdated` (SPEC §12.5). Bump on any breaking change (PLATFORM §5). */
export const PROTOCOL_VERSION = 1;

/** Player cap and Start minimum (SPEC §6.1); the values live in game.meta.ts. */
export const MAX_PLAYERS = maxPlayers;
export const MIN_PLAYERS = minPlayers;
/** Name length cap. */
export const NAME_MAX = 12;

/** Stick range on the wire: ints −STICK_MAX..STICK_MAX, dead zone applied on the phone. */
export const STICK_MAX = 100;
/** `input.bits` (SPEC §12.5). */
export const BIT_HOLD = 1;
export const BIT_CATCH = 2;
/** The phone keeps the catch bit set at least this long, so a tap spans a 30 Hz sample. */
export const CATCH_MIN_MS = 120;

// ---- phone → host ----

export const LEADER_ACTIONS = ['start', 'howToPlay', 'next', 'skip', 'playAgain'] as const;
export type LeaderAction = (typeof LEADER_ACTIONS)[number];

/** Merchant dialog picks (SPEC §6.6). "Buy…" opens the phone's list; the purchase is `buy`. */
export type DialogPick = { pick: 'browsing' } | { pick: 'leave' } | { pick: 'ask'; slot: number };

export type PhoneMsg =
  /**
   * The name step and handshake (SPEC §6.18, §12.5): sent on Join and after every reconnect.
   * `proto` absent = the scaffold join screen, read as `PROTOCOL_VERSION` (BUILD_PLAN §8 [TF0]).
   */
  | { t: 'join'; name: string; proto?: number }
  /** Input state: stick ints −100..100 and `BIT_HOLD | BIT_CATCH`. */
  | { t: 'input'; x: number; y: number; bits: number }
  /** Main button tap: BROWSE (stall view or pawnbroker sheet) or SELL (sell sheet). */
  | { t: 'browse' }
  /** Arms GRAB on a stall-view tile; the `hold` bit times it (SPEC §11 #26). */
  | { t: 'grab'; stall: number; slot: number }
  | ({ t: 'dialog' } & DialogPick)
  | { t: 'buy'; item: ItemId }
  /** `to`: 'pawn' or the buyer token from `sellSheet`. */
  | { t: 'sell'; item: ItemId; to: 'pawn' | number }
  /** Coin toss aim, ints −100..100; 0,0 = facing (SPEC §6.9). */
  | { t: 'toss'; x: number; y: number }
  | { t: 'tipOpen' }
  /** `target`: a `HitArea.targetId` from the open snapshot. */
  | { t: 'tipSend'; target: number }
  | { t: 'tipCancel' }
  /** Lobby (SPEC §6.18): pick a player color; the host validates and answers with the lobby screen. */
  | { t: 'color'; color: PlayerColorId }
  | { t: 'ready'; ready: boolean }
  | { t: 'leader'; action: LeaderAction }
  /** Leave game: full removal (SPEC §6.18). */
  | { t: 'leave' }
  /** Blob transfer: every chunk of a tip snapshot arrived (SPEC §12.6). */
  | Ack;

// ---- host → phone ----

/** A pack entry (SPEC §6.4): items count at full value. */
export interface PackItem {
  item: ItemId;
  name: string;
  value: number;
  weight: number;
}

export interface LobbyPlayer {
  name: string;
  color: PlayerColorId;
  ready: boolean;
  leader: boolean;
  connected: boolean;
}

/** Phone screens (SPEC §6.17, §6.18). Timers ride as `endsInMs`, set on receipt (§12.5). */
export type Screen =
  /** Joined, waiting for the host to place the phone. */
  | { s: 'joining' }
  /** `you` indexes `players`. */
  | { s: 'lobby'; players: LobbyPlayer[]; you: number; canStart: boolean }
  /** How to play (SPEC §6.19): the phone mirrors the TV's card; the leader drives it. */
  | { s: 'rules'; card: number; count: number; leader: boolean }
  /** "THIS IS YOU": one outfit in v1, room for a partner's (SPEC §9 prep). */
  | { s: 'roundStart'; round: number; rounds: number; outfits: Outfit[]; endsInMs: number }
  | {
      s: 'play';
      round: number;
      rounds: number;
      endsInMs: number;
      name: string;
      color: PlayerColorId;
    }
  /** Controls frozen; this round's tiles (SPEC §6.14). */
  | { s: 'handsUp'; bag: number; items: PackItem[]; total: number }
  /** CAUGHT! + countdown ring (SPEC §6.13). */
  | { s: 'stocks'; pot: number; endsInMs: number }
  /** Mid-round join (SPEC §6.18): "You're walking in at the {label}"; control after `endsInMs`. */
  | { s: 'walkOn'; outfit: Outfit; entry: EntryId; label: string; endsInMs: number }
  /** Final place and total (SPEC §6.15); the leader gets Play again. */
  | { s: 'matchEnd'; place: number; total: number; tied: boolean; leader: boolean }
  /** Joined during the reveal, transition or podium, or the game is full (SPEC §6.18). */
  | { s: 'waiting'; reason: 'nextRound' | 'full' };
export type ScreenKind = Screen['s'];

export const TOAST_KINDS = ['gain', 'lucky', 'loss', 'info'] as const;
/** `lucky` = the gold-edged top-quarter roll (SPEC §6.4). */
export type ToastKind = (typeof TOAST_KINDS)[number];

/** The context main button (SPEC §6.17); null = blank and disabled. */
export type MainAction = 'browse' | 'sell' | 'pickpocket' | null;

export interface PriceRow {
  item: ItemId;
  name: string;
  price: number;
}

export interface SellSheet {
  /** Buyer token, echoed by `sell`. */
  to: number;
  /** What this shopper wants (SPEC §6.17). */
  wants: ItemId[];
  /** Over-value offers for matching pack items. */
  offers: PriceRow[];
}

export interface PawnSheet {
  /** Today's offer per pack item at the rate of the moment (SPEC §6.17, §11 #25). */
  offers: PriceRow[];
  /** Until the rate re-rolls. */
  endsInMs: number;
}

export type HostMsg =
  /** The host took the name (trimmed and capped). */
  | { t: 'joined'; name: string }
  /** Protocol mismatch: the host's version (SPEC §12.5). */
  | { t: 'outdated'; proto: number }
  | { t: 'screen'; screen: Screen }
  /** Private stall view; null closes it (walked away). */
  | { t: 'stallView'; view: StallView | null }
  | HoldStartMsg
  | HoldEndMsg
  | { t: 'toast'; kind: ToastKind; text: string; amount?: number }
  | { t: 'bag'; bag: number; pack: PackItem[]; weight: number; cap: number }
  | { t: 'outfit'; outfit: Outfit }
  /** What the right-hand buttons can do now. */
  | { t: 'context'; main: MainAction; tossReadyInMs: number; tip: boolean; catch: boolean }
  /** Merchant dialog (SPEC §6.6): open with Buy… rows and Ask about… shelf rows; closed when false. */
  | {
      t: 'dialog';
      open: boolean;
      buy: PriceRow[];
      ask: { slot: number; item: ItemId; name: string }[];
    }
  | { t: 'sellSheet'; sheet: SellSheet | null }
  | { t: 'pawnSheet'; sheet: PawnSheet | null }
  /** CAUGHT! banner with the pot lost (SPEC §6.13); `guard` catches go on to the stocks screen. */
  | { t: 'caught'; pot: number; by: 'player' | 'guard' }
  /** The tip-off sheet: header + hit areas now, the image by blob transfer (SPEC §12.6). */
  | { t: 'tipSnapshot'; snapshot: TipSnapshot; hits: HitArea[]; fee: number; endsInMs: number }
  | { t: 'tipResult'; result: 'landed' | 'missed' | 'expired'; fee: number }
  /** A piece of a tip snapshot's bytes. */
  | Chunk;

/** Trims, collapses whitespace and caps at NAME_MAX; '' when nothing is left. */
export function cleanName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

// ---- guards ----

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => Number.isInteger(v);
const isNat = (v: unknown): v is number => isInt(v) && (v as number) >= 0;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
const isStick = (v: unknown): v is number => isInt(v) && Math.abs(v as number) <= STICK_MAX;
const isArr = <T>(v: unknown, each: (x: unknown) => x is T): v is T[] =>
  Array.isArray(v) && v.every(each);
const oneOf =
  <T extends string>(xs: readonly T[]) =>
  (v: unknown): v is T =>
    typeof v === 'string' && (xs as readonly string[]).includes(v);

const isColor = oneOf(PLAYER_COLOR_IDS);
const isFabric = oneOf(Object.keys(theme.fabric) as FabricId[]);
const isOutfit = (v: unknown): v is Outfit =>
  isObj(v) && isFabric(v.tunic) && isFabric(v.mantle) && isNat(v.hair) && isNat(v.skin);
const isPackItem = (v: unknown): v is PackItem =>
  isObj(v) && isStr(v.item) && isStr(v.name) && isNat(v.value) && isNat(v.weight);
const isPriceRow = (v: unknown): v is PriceRow =>
  isObj(v) && isStr(v.item) && isStr(v.name) && isNat(v.price);
const isLobbyPlayer = (v: unknown): v is LobbyPlayer =>
  isObj(v) &&
  isStr(v.name) &&
  isColor(v.color) &&
  isBool(v.ready) &&
  isBool(v.leader) &&
  isBool(v.connected);
const isViewItem = (v: unknown): v is StallViewItem =>
  isObj(v) &&
  isNat(v.slot) &&
  isStr(v.item) &&
  isStr(v.name) &&
  isNat(v.price) &&
  isNat(v.grabMs) &&
  oneOf(['common', 'uncommon', 'rare'] as const)(v.rarity) &&
  oneOf(['free', 'takenByOther', 'tooHeavy', 'outOfReach'] as const)(v.state);
const isStallView = (v: unknown): v is StallView =>
  isObj(v) &&
  isNat(v.stall) &&
  isStr(v.canopy) &&
  isStr(v.title) &&
  isArr(v.counter, isViewItem) &&
  isArr(v.shelf, isViewItem);
const isHit = (v: unknown): v is HitArea =>
  isObj(v) && isNat(v.targetId) && isNum(v.x) && isNum(v.y) && isNum(v.w) && isNum(v.h);
const isSnapshot = (v: unknown): v is TipSnapshot =>
  isObj(v) &&
  isNat(v.id) &&
  isNat(v.w) &&
  isNat(v.h) &&
  oneOf(['image/jpeg', 'image/webp'] as const)(v.mime) &&
  isNat(v.bytes);
const isEntry = oneOf(['upperLeft', 'upperRight', 'lowerLeft', 'lowerRight'] as const);

function isScreen(v: unknown): v is Screen {
  if (!isObj(v)) return false;
  switch (v.s) {
    case 'joining':
      return true;
    case 'lobby':
      return isArr(v.players, isLobbyPlayer) && isNat(v.you) && isBool(v.canStart);
    case 'rules':
      return isNat(v.card) && isNat(v.count) && isBool(v.leader);
    case 'roundStart':
      return isNat(v.round) && isNat(v.rounds) && isArr(v.outfits, isOutfit) && isNat(v.endsInMs);
    case 'play':
      return (
        isNat(v.round) && isNat(v.rounds) && isNat(v.endsInMs) && isStr(v.name) && isColor(v.color)
      );
    case 'handsUp':
      return isInt(v.bag) && isArr(v.items, isPackItem) && isInt(v.total);
    case 'stocks':
      return isNat(v.pot) && isNat(v.endsInMs);
    case 'walkOn':
      return isOutfit(v.outfit) && isEntry(v.entry) && isStr(v.label) && isNat(v.endsInMs);
    case 'matchEnd':
      return isNat(v.place) && isInt(v.total) && isBool(v.tied) && isBool(v.leader);
    case 'waiting':
      return v.reason === 'nextRound' || v.reason === 'full';
    default:
      return false;
  }
}

export function isPhoneMsg(v: unknown): v is PhoneMsg {
  if (!isObj(v)) return false;
  switch (v.t) {
    case 'join':
      return isStr(v.name) && (v.proto === undefined || isNat(v.proto));
    case 'input':
      return isStick(v.x) && isStick(v.y) && isNat(v.bits) && (v.bits as number) < 4;
    case 'browse':
    case 'tipOpen':
    case 'tipCancel':
    case 'leave':
      return true;
    case 'grab':
      return isNat(v.stall) && isNat(v.slot);
    case 'dialog':
      return v.pick === 'browsing' || v.pick === 'leave' || (v.pick === 'ask' && isNat(v.slot));
    case 'buy':
      return isStr(v.item);
    case 'sell':
      return isStr(v.item) && (v.to === 'pawn' || isNat(v.to));
    case 'toss':
      return isStick(v.x) && isStick(v.y);
    case 'tipSend':
      return isNat(v.target);
    case 'color':
      return isColor(v.color);
    case 'ready':
      return isBool(v.ready);
    case 'leader':
      return oneOf(LEADER_ACTIONS)(v.action);
    case 'blobAck':
      return isAck(v);
    default:
      return false;
  }
}

export function isHostMsg(v: unknown): v is HostMsg {
  if (!isObj(v)) return false;
  switch (v.t) {
    case 'joined':
      return isStr(v.name);
    case 'outdated':
      return isNat(v.proto);
    case 'screen':
      return isScreen(v.screen);
    case 'stallView':
      return v.view === null || isStallView(v.view);
    case 'holdStart':
      return (
        isNat(v.id) &&
        oneOf(HOLD_KINDS)(v.kind) &&
        isNat(v.durationMs) &&
        isNat(v.elapsedMs) &&
        (v.stall === undefined || isNat(v.stall)) &&
        (v.slot === undefined || isNat(v.slot))
      );
    case 'holdEnd':
      return isNat(v.id) && oneOf(HOLD_RESULTS)(v.result);
    case 'toast':
      return (
        oneOf(TOAST_KINDS)(v.kind) && isStr(v.text) && (v.amount === undefined || isInt(v.amount))
      );
    case 'bag':
      return isInt(v.bag) && isArr(v.pack, isPackItem) && isNat(v.weight) && isNat(v.cap);
    case 'outfit':
      return isOutfit(v.outfit);
    case 'context':
      return (
        (v.main === null || oneOf(['browse', 'sell', 'pickpocket'] as const)(v.main)) &&
        isNat(v.tossReadyInMs) &&
        isBool(v.tip) &&
        isBool(v.catch)
      );
    case 'dialog':
      return (
        isBool(v.open) &&
        isArr(v.buy, isPriceRow) &&
        isArr(
          v.ask,
          (a): a is { slot: number; item: string; name: string } =>
            isObj(a) && isNat(a.slot) && isStr(a.item) && isStr(a.name),
        )
      );
    case 'sellSheet':
      return (
        v.sheet === null ||
        (isObj(v.sheet) &&
          isNat(v.sheet.to) &&
          isArr(v.sheet.wants, isStr) &&
          isArr(v.sheet.offers, isPriceRow))
      );
    case 'pawnSheet':
      return (
        v.sheet === null ||
        (isObj(v.sheet) && isArr(v.sheet.offers, isPriceRow) && isNat(v.sheet.endsInMs))
      );
    case 'caught':
      return isNat(v.pot) && (v.by === 'player' || v.by === 'guard');
    case 'tipSnapshot':
      return isSnapshot(v.snapshot) && isArr(v.hits, isHit) && isNat(v.fee) && isNat(v.endsInMs);
    case 'tipResult':
      return (
        (v.result === 'landed' || v.result === 'missed' || v.result === 'expired') && isNat(v.fee)
      );
    case 'chunk':
      return isChunk(v);
    default:
      return false;
  }
}
