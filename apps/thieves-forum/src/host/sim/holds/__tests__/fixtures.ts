// Test fixtures for the hold machine (SPEC §12.3): a tiny world (one thief, one victim, one stall with
// its merchant) and a StepContext over it, without the sim core (TF2) so the machine tests stand alone.
import { CONTENT } from '../../../../content';
import type { StepContext } from '../../systems';
import {
  STEP_MS,
  type Character,
  type EntityId,
  type Merchant,
  type PlayerId,
  type PlayerInput,
  type SimCommand,
  type Stall,
  type World,
} from '../../types';
import { step } from '../index';

export const THIEF: EntityId = 1;
export const VICTIM: EntityId = 2;
export const MERCHANT: EntityId = 3;
export const STALL = 4;
export const PLAYER: PlayerId = 'p1';
/** bakery: a common counter item and an uncommon shelf item. */
export const COUNTER_SLOT = 0;
export const SHELF_SLOT = 4;

export function citizen(id: EntityId, x: number, y: number, player: PlayerId | null): Character {
  return {
    id,
    x,
    y,
    vx: 0,
    vy: 0,
    r: 0.35,
    rig: 'citizen',
    outfit: { tunic: 'olive', mantle: 'linen', hair: 0, skin: 0 },
    facing: 0,
    gait: 'idle',
    pose: 'idle',
    activity: { k: 'free' },
    control: player === null ? { k: 'npc' } : { k: 'player', playerId: player },
    side: player === null ? null : { kind: 'player', id: player },
    npc: {
      personality: { speed: 1, distractibility: 0.1, browseMs: 3000, hurried: false },
      state: 'wandering',
      wishList: [],
      wants: [],
      purse: 30,
      saleRate: 1.2,
      goal: null,
      until: 0,
      alertUntil: 0,
      glance: null,
    },
    hotUntil: -1,
    holdEndedAt: -1,
    immuneUntil: -1,
    tossReadyAt: 0,
  };
}

function merchant(): Merchant {
  return {
    id: MERCHANT,
    x: 10,
    y: 9,
    vx: 0,
    vy: 0,
    r: 0.35,
    rig: 'merchant',
    stall: STALL,
    facing: 0,
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
  };
}

function stall(): Stall {
  const bakery = CONTENT.items.filter((i) => i.shop === 'bakery');
  const counter = bakery.find((i) => i.placement === 'counter')!;
  const shelf = bakery.find((i) => i.placement === 'shelf')!;
  return {
    id: STALL,
    shop: 'bakery',
    open: true,
    merchant: MERCHANT,
    slots: [
      {
        slot: COUNTER_SLOT,
        row: 'counter',
        item: counter.id,
        heldBy: null,
        forward: false,
        restockAt: null,
      },
      {
        slot: SHELF_SLOT,
        row: 'shelf',
        item: shelf.id,
        heldBy: null,
        forward: false,
        restockAt: null,
      },
    ],
  };
}

export function makeWorld(): World {
  return {
    tick: 0,
    phase: 'play',
    phaseEndsAt: null,
    round: 1,
    seed: 1,
    nextId: 5,
    // The thief stands one body length behind the victim (victim faces +x, thief at its back).
    characters: [citizen(THIEF, 9, 10, PLAYER), citizen(VICTIM, 10, 10, null)],
    merchants: [merchant()],
    guards: [],
    stalls: [stall()],
    holds: [],
    coins: [],
    stocks: [],
    tips: [],
    gateOpen: false,
    activations: 0,
    pawn: { rate: 0.5, rerollAt: 0 },
    plannedNpcs: 0,
    events: [],
  };
}

export interface Harness {
  world: World;
  ctx: StepContext;
  /** Sets this step's input for the thief's player (null = no input this step). */
  input(i: Partial<PlayerInput> | null): void;
  /** One fixed step of the hold machine (clears events, steps, advances the tick). */
  step(): void;
  /** Runs `after` (e.g. an arm, as TF8/TF14 would later in the step) inside the next step. */
  stepThen(after: () => void): void;
  readonly nowMs: number;
}

export function harness(world: World = makeWorld()): Harness {
  const inputs = new Map<PlayerId, PlayerInput>();
  const commands: SimCommand[] = [];
  const ctx: StepContext = {
    world,
    content: CONTENT,
    inputs,
    commands,
    rng() {
      throw new Error('holds use no randomness');
    },
    emit: (e) => world.events.push(e),
    ticks: (ms) => Math.round(ms / STEP_MS),
  };
  const h: Harness = {
    world,
    ctx,
    input(i) {
      if (i === null) inputs.delete(PLAYER);
      else inputs.set(PLAYER, { move: { x: 0, y: 0 }, hold: false, catch: false, ...i });
    },
    step() {
      h.stepThen(() => {});
    },
    stepThen(after) {
      world.events.length = 0;
      step(ctx);
      after();
      world.tick += 1;
    },
    get nowMs() {
      return world.tick * STEP_MS;
    },
  };
  return h;
}
