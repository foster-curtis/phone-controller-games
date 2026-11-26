// The round simulation's public types (SPEC §12.3): the world and its entities (characters, NPC minds,
// merchants, guards, stalls, holds, coins, stocks), phases, player input, commands and the round start.
// Plain TS: no Phaser, no net-client, no DOM, no wall clock (lint, SPEC §12.1). Units: tiles and ticks
// (60 Hz steps); config times in ms are converted to ticks at load.
// Frozen at TF0 (BUILD_PLAN §3): additive changes only (new optional fields, new union members).
import type { EntryId, ItemId, Outfit, ShopId, StallId, Vec2 } from '../../content/types';
import type { HoldKind, HoldResult } from '../../shared/hold';
import type { SimEvent } from './events';
import type { HoldMachineState } from './holds/types';
import type { MerchantDesk } from './merchants/types';
import type { Side } from './ledger/types';
import type { CrowdState, NpcNav } from './npc/types';

export type { SimEvent } from './events';
export type { Outfit, StallId, Vec2 } from '../../content/types';
export type { Side } from './ledger/types';

/** Steps per second (fixed-step loop, @pcg/game-kit). */
export const SIM_HZ = 60;
export const STEP_MS = 1000 / SIM_HZ;

/** A relay player id. Lives only in sim state, commands and `phone` events, never in views. */
export type PlayerId = string;

/** Incrementing per round, never reused; players' characters first, then everyone else (SPEC §12.3). */
export type EntityId = number;

/** Ticks since the round started. */
export type Tick = number;

// ---- bodies and characters ---------------------------------------------------------------------

export interface Body {
  id: EntityId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Circle radius (tiles). */
  r: number;
}

/** Which rig draws an entity (SPEC §6.21). */
export type RigId = 'citizen' | 'merchant' | 'guard';

/** Movement speeds (SPEC §6.10): nobody but a fleeing player or a guard runs or jogs. */
export type Gait = 'idle' | 'shuffle' | 'walk' | 'brisk' | 'jog' | 'run';

/** A pose clip name (SPEC §6.21; clips live in render/clips, TF1). Append-only. */
export type PoseId =
  | 'idle'
  | 'walk'
  | 'browse' // shared with reach/grab, so stealing looks like browsing
  | 'pickpocket'
  | 'throw'
  | 'point'
  | 'handsUp'
  | 'run'
  | 'stocks'
  | 'caught'
  // merchant
  | 'glanceWindup'
  | 'glanceLook'
  | 'fetch'
  | 'carry'
  // guard
  | 'patrol'
  | 'jog'
  | 'catch'
  | 'march';

/** What a citizen is doing (SPEC §6.7–§6.14, §6.18). */
export type Activity =
  | { k: 'free' }
  | { k: 'browsing'; stall: StallId }
  | { k: 'holding'; hold: number }
  | { k: 'tossing'; until: Tick }
  | { k: 'pointing'; at: EntityId; until: Tick }
  | { k: 'tipping' } // standing still with the tip-off sheet open (SPEC §6.17)
  | { k: 'caught'; until: Tick }
  | { k: 'marched'; guard: EntityId }
  | { k: 'stocks'; slot: number; until: Tick }
  | { k: 'handsUp' }
  | { k: 'entering'; entry: EntryId }
  | { k: 'leaving' };

/** Who drives a citizen (SPEC §6.18). Never copied into a view (SPEC §6.11). */
export type Control =
  | { k: 'npc' }
  | { k: 'player'; playerId: PlayerId }
  /** Disconnected: NPC behavior drives the character until the player reconnects. */
  | { k: 'takeover'; playerId: PlayerId }
  /** Mid-round join walking on as an NPC; the player takes over at `handOffAt`. */
  | { k: 'walkOn'; playerId: PlayerId; handOffAt: Tick };

/** NPC personality sliders (SPEC §6.10 technique 4), rolled at spawn. */
export interface Personality {
  speed: number;
  distractibility: number;
  browseMs: number;
  hurried: boolean;
}

/** NPC shopper states (SPEC §6.10 technique 1). Append-only. */
export type NpcState =
  | 'entering'
  | 'wandering'
  | 'approaching'
  | 'browsing'
  | 'buying'
  | 'waiting'
  | 'chasingCoin'
  | 'glancing'
  | 'pointing'
  | 'leaving';

/**
 * An NPC mind. Every NPC has one; player characters have one too, so takeover and walk-on drive the
 * same character with NPC behavior (SPEC §6.18).
 */
export interface Npc {
  personality: Personality;
  state: NpcState;
  /** Shops still to visit, in order ("spices, then bread"). */
  wishList: ShopId[];
  /** Items it will buy from a player (SPEC §6.4, §6.10). */
  wants: ItemId[];
  /** Denarii carried (NPC money; a player's money is in the ledger). */
  purse: number;
  /** Rolled at spawn, kept (SPEC §6.4). */
  saleRate: number;
  goal: Vec2 | null;
  /** Tick the current state ends (browse, pause, glance). */
  until: Tick;
  /** Recently robbed: higher glance chance until this tick (SPEC §6.8). */
  alertUntil: Tick;
  /** Glance wind-up / look against a pickpocket (SPEC §6.8). */
  glance: Glance | null;
  /** Steering and navigation memory (TF2 contract+; set by `npc.createMind`). */
  nav?: NpcNav;
}

/** A head-turn glance with a wind-up (SPEC §6.6, §6.8). */
export interface Glance {
  stage: 'windup' | 'look';
  /** The character the glance is aimed at (null = a general look round). */
  at: EntityId | null;
  until: Tick;
}

/** A shopper on screen: player or NPC, identical to the renderer (SPEC §6.11). */
export interface Character extends Body {
  rig: 'citizen';
  outfit: Outfit;
  /** Radians, world angle (0 = +x, y down). */
  facing: number;
  gait: Gait;
  pose: PoseId;
  activity: Activity;
  control: Control;
  /** The ledger side for player characters (SPEC §9 prep); null for NPCs. */
  side: Side | null;
  npc: Npc;
  /** Hot hands until this tick (SPEC §6.13); −1 = never hot. */
  hotUntil: Tick;
  /** Tick the last steal hold ended (in-person catch grace, SPEC §6.13); −1 = none. */
  holdEndedAt: Tick;
  /** Can't be caught again before this tick (stocks + immunity, SPEC §6.13). */
  immuneUntil: Tick;
  /** Coin toss ready at this tick (SPEC §6.9). */
  tossReadyAt: Tick;
}

// ---- merchants, guards, stalls -----------------------------------------------------------------

/** Where a merchant is (SPEC §6.6, §6.7): only `away` makes the back shelf reachable. */
export type MerchantSpot = 'counter' | 'shelf' | 'away';

export interface Merchant extends Body {
  rig: 'merchant';
  stall: StallId;
  facing: number;
  gait: Gait;
  pose: PoseId;
  spot: MerchantSpot;
  /** The customer he's standing in front of (SPEC §6.6), or null. */
  helping: EntityId | null;
  glance: Glance | null;
  nextGlanceAt: Tick;
  /** "Just browsing" suspicion per character (SPEC §6.6). */
  suspicion: { of: EntityId; until: Tick }[];
  /** A shelf item he's carrying forward or fetching (SPEC §6.6). */
  carrying: ItemId | null;
  /** A tossed coin he's walking to (shows "?", SPEC §6.9). */
  coin: number | null;
  /** Shouting "THIEF!" at this character until the tick (merchant catch, SPEC §6.6). */
  shouting: { at: EntityId; until: Tick } | null;
  /** Serving queue, current task and dialog (TF8 contract+; set when the merchants step creates him). */
  desk?: MerchantDesk;
}

/** Why a guard was activated (SPEC §6.12 escalation counts all of these). */
export type ActivationCause = 'npcAlert' | 'merchantCall' | 'tipOff' | 'spot';

export type GuardMode =
  | { k: 'enter' } // through the top gate (reinforcement)
  | { k: 'patrol'; waypoint: number }
  | { k: 'chase'; thief: EntityId; lastSeen: Vec2; unseenTicks: number }
  /** A landed tip: locked-in catch on arrival, no escape (SPEC §6.13). */
  | { k: 'collect'; thief: EntityId; tipper: PlayerId }
  | { k: 'march'; thief: EntityId; slot: number }
  | { k: 'rush'; target: EntityId | null }; // end-of-round transition (SPEC §6.14)

export interface Guard extends Body {
  rig: 'guard';
  facing: number;
  gait: Gait;
  pose: PoseId;
  mode: GuardMode;
  /** View cone turns red while chasing a spotted thief (SPEC §6.12). */
  alert: boolean;
  /** Red "!" until this tick. */
  bangUntil: Tick;
}

/** One item spot in a stall (SPEC §6.5, §6.6). `slot` is unique across both rows. */
export interface StallSlot {
  slot: number;
  row: 'counter' | 'shelf';
  item: ItemId | null;
  /** The character holding GRAB on it (SPEC §6.7 "one player at a time"). */
  heldBy: EntityId | null;
  /** A shelf item the merchant brought forward (shown in the counter row, SPEC §6.6). */
  forward: boolean;
  /** Restocks at this tick (null = not waiting, or never for rares). */
  restockAt: Tick | null;
  /** The item this slot was stocked with: what restock and `putBack` restore (TF8 contract+). */
  stocked?: ItemId | null;
}

export interface Stall {
  id: StallId;
  shop: ShopId;
  open: boolean;
  merchant: EntityId | null;
  slots: StallSlot[];
}

// ---- holds, coins, stocks ----------------------------------------------------------------------

export type HoldTarget =
  | { k: 'item'; stall: StallId; slot: number; fromShelf: boolean }
  | { k: 'pocket'; victim: EntityId };

/** A host-measured hold (SPEC §3, §12.3). */
export interface Hold {
  id: number;
  kind: HoldKind;
  actor: EntityId;
  target: HoldTarget;
  startTick: Tick;
  /** Completes at this tick if the `hold` bit is still set. */
  endTick: Tick;
  /** Set on the tick it ends; the hold is removed the next step. */
  result: HoldResult | null;
}

/** A tossed coin (SPEC §6.9). */
export interface Coin {
  id: number;
  by: EntityId;
  from: Vec2;
  to: Vec2;
  thrownAt: Tick;
  landsAt: Tick;
  /** The merchant (or NPC) walking to pick it up. */
  claimedBy: EntityId | null;
}

export interface StocksSlot {
  slot: number;
  character: EntityId | null;
  releaseAt: Tick;
}

// ---- tip-offs ----------------------------------------------------------------------------------

/** An open tip-off sheet (SPEC §6.13, §12.6). */
export interface Tip {
  id: number;
  tipper: PlayerId;
  takenAt: Tick;
  expiresAt: Tick;
  /** Opaque hit-area ids → characters (the tipper's own excluded). */
  targets: { targetId: number; character: EntityId }[];
  /** Characters hot at the snapshot tick. */
  hotAtSnapshot: EntityId[];
}

// ---- world -------------------------------------------------------------------------------------

/** The round's phases (SPEC §6.2, §6.14). The match (lobby, reveal sequencing, podium) is outside. */
export type Phase = 'opening' | 'play' | 'handsUp' | 'rush' | 'ended';

export interface World {
  tick: Tick;
  phase: Phase;
  /** Tick the current phase ends (opening, play) or null. */
  phaseEndsAt: Tick | null;
  round: number;
  seed: number;
  nextId: EntityId;
  characters: Character[];
  merchants: Merchant[];
  guards: Guard[];
  stalls: Stall[];
  holds: Hold[];
  coins: Coin[];
  stocks: StocksSlot[];
  tips: Tip[];
  gateOpen: boolean;
  /** Guard activations this round (SPEC §6.12 escalation). */
  activations: number;
  /** The pawnbroker's rate of the moment and when it re-rolls (SPEC §6.4). */
  pawn: { rate: number; rerollAt: Tick };
  /** NPCs the crowd aims for this round (SPEC §6.10). */
  plannedNpcs: number;
  /** Crowd churn bookkeeping (TF2 contract+; set by `createWorld`). */
  crowd?: CrowdState;
  /** Cleared at the start of each step; views, audio and phones read them. */
  events: SimEvent[];
  /** The hold machine's arms and hold-id counter (TF3); absent until the first arm. */
  holdMachine?: HoldMachineState;
}

// ---- input, commands, round start --------------------------------------------------------------

/** One player's input state as the sim sees it (SPEC §12.5), after staleness. */
export interface PlayerInput {
  /** Stick −1..1 (dead zone applied on the phone). */
  move: Vec2;
  /** Main button held: times GRAB and PICKPOCKET holds. */
  hold: boolean;
  /** Catch! is down (rising edge = one catch attempt). */
  catch: boolean;
}

/** Discrete phone events and lifecycle changes, applied at the start of a step (SPEC §12.3). */
export type SimCommand =
  | { k: 'browse'; player: PlayerId }
  | { k: 'grab'; player: PlayerId; stall: StallId; slot: number }
  | { k: 'dialog'; player: PlayerId; pick: 'browsing' | 'leave' }
  | { k: 'dialog'; player: PlayerId; pick: 'ask'; slot: number }
  | { k: 'buy'; player: PlayerId; item: ItemId }
  | { k: 'sell'; player: PlayerId; item: ItemId; to: 'pawn' | EntityId }
  | { k: 'toss'; player: PlayerId; dir: Vec2 }
  /** The host took the snapshot this tick; `targets` maps its hit areas (SPEC §12.6). */
  | {
      k: 'tipOpen';
      player: PlayerId;
      tip: number;
      targets: { targetId: number; character: EntityId }[];
    }
  | { k: 'tipSend'; player: PlayerId; target: number }
  | { k: 'tipCancel'; player: PlayerId }
  /** Mid-round join: walks on from `entry` (SPEC §6.18). */
  | { k: 'join'; player: PlayerId; side: Side; entry: EntryId }
  | { k: 'disconnect'; player: PlayerId }
  | { k: 'reconnect'; player: PlayerId }
  | { k: 'leave'; player: PlayerId };

/** Everything a round starts from (SPEC §12.3). */
export interface RoundStart {
  seed: number;
  /** 1-based. */
  round: number;
  /** In join order. Outfits come from the sim's own `outfits` stream. */
  players: { id: PlayerId; side: Side }[];
  /** The match's open stalls (SPEC §6.3, §11 #24). */
  openStalls: StallId[];
  /** Starting guards this round (SPEC §6.12). */
  guards: number;
}
