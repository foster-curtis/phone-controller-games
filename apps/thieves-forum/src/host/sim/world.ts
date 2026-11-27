// The sim core (SPEC §12.3): one deterministic round from `RoundStart`. `createSim` builds the world
// (players' characters first, standing in the lanes for the players-only opening), assembles the fixed
// 13-step system order and exposes `step(inputs, commands)`, `view()`, `debugView()`, `events()` and a
// state hash. All randomness comes from named seeded streams, created once per label and reused.
import { rngStream, type Rng } from '@pcg/game-kit';
import { CONTENT } from '../../content';
import type { Content, Vec2 } from '../../content/types';
import * as catchesMod from './catches';
import { makeCitizen } from './citizen';
import { initDerived } from './derived';
import * as distractions from './distractions';
import * as economy from './economy';
import { dist, rectDist } from './geometry';
import * as guards from './guards';
import { stateHash } from './hash';
import * as holds from './holds';
import { stepInput } from './input';
import * as lifecycle from './lifecycle';
import * as merchants from './merchants';
import { stepMovement, stepSeparation } from './movement';
import * as npc from './npc';
import { newCrowd, plannedNpcs } from './npc/churn';
import { createMind } from './npc/mind';
import { assignOutfit, OUTFIT_STREAM } from './outfits';
import * as pickpocket from './pickpocket';
import type { DebugView, WorldView } from './snapshot';
import { runStep, type StepContext, type Systems } from './systems';
import { stepTimers } from './timers';
import { TUNING } from './tuning';
import type { PlayerId, PlayerInput, RoundStart, SimCommand, SimEvent, World } from './types';
import { STEP_MS } from './types';
import { debugView, worldView } from './views';

/** The fixed step order's systems (SPEC §12.3, `systems.ts`). */
export const SYSTEMS: Systems = {
  input: stepInput,
  holds: holds.step,
  npc: npc.step,
  merchants: merchants.step,
  guards: guards.step,
  pickpocket: pickpocket.step,
  distractions: distractions.step,
  catches: catchesMod.step,
  economy: economy.step,
  lifecycle: lifecycle.step,
  movement: stepMovement,
  separation: stepSeparation,
  timers: stepTimers,
};

export interface Sim {
  readonly world: World;
  readonly content: Content;
  /** One fixed step with this step's inputs (staleness-filtered) and commands. */
  step(inputs?: ReadonlyMap<PlayerId, PlayerInput>, commands?: readonly SimCommand[]): void;
  view(): WorldView;
  /** Dev overlay only (`?debug=1`). */
  debugView(): DebugView;
  /** The last step's events (the scene, HUD and audio read only `tv` ones). */
  events(): readonly SimEvent[];
  /** FNV-1a of the world's run state (determinism tests, replays). */
  hash(): number;
  /** A step context outside `step` (tests, debug hooks): no inputs, no commands. */
  context(): StepContext;
}

const NO_INPUTS: ReadonlyMap<PlayerId, PlayerInput> = new Map();

/** Players' opening spots: seeded points in the lanes, apart from each other and from blockers. */
function startSpots(content: Content, rng: Rng, n: number): Vec2[] {
  const out: Vec2[] = [];
  const lanes = Object.values(content.layout.lanes);
  const gap = TUNING.startGap;
  for (let i = 0; i < n; i++) {
    let p: Vec2 = { x: 0, y: 0 };
    for (let tries = 0; tries < 200; tries++) {
      const r = lanes[rng.int(0, lanes.length - 1)]!.rect;
      p = {
        x: r.x + gap + (r.w - 2 * gap) * rng.next(),
        y: r.y + gap + (r.h - 2 * gap) * rng.next(),
      };
      const clearOfBlockers = content.layout.blockers.every((b) => rectDist(p.x, p.y, b) >= gap);
      if (clearOfBlockers && out.every((q) => dist(p.x, p.y, q.x, q.y) >= gap)) break;
    }
    out.push(p);
  }
  return out;
}

export function createWorld(
  start: RoundStart,
  content: Content,
  rng: (label: string) => Rng,
): World {
  const b = content.balance;
  const world: World = {
    tick: 0,
    phase: 'opening',
    phaseEndsAt: Math.round(b.match.openingMs / STEP_MS),
    round: start.round,
    seed: start.seed,
    nextId: 1,
    characters: [],
    merchants: [],
    guards: [],
    stalls: content.layout.stalls.map((s) => ({
      id: s.id,
      shop: s.shop,
      open: start.openStalls.includes(s.id),
      merchant: null,
      slots: [],
    })),
    holds: [],
    coins: [],
    stocks: content.layout.stocks.slots.map((_, i) => ({ slot: i, character: null, releaseAt: 0 })),
    tips: [],
    gateOpen: false,
    activations: 0,
    pawn: { rate: b.pawn.rate[0], rerollAt: 0 },
    plannedNpcs: plannedNpcs(start.players.length, b),
    crowd: newCrowd(),
    events: [],
  };
  initDerived(world, content.layout.size.w, content.layout.size.h);
  const open = world.stalls.filter((s) => s.open).map((s) => s.shop);
  const spots = startSpots(content, rng('start'), start.players.length);
  start.players.forEach((p, i) => {
    const id = world.nextId;
    const mind = createMind(rng(`npc:${id}`), content, open);
    mind.state = 'wandering';
    const outfit = assignOutfit(rng(OUTFIT_STREAM), b.outfit);
    world.characters.push(
      makeCitizen(
        world,
        spots[i]!,
        b.movement.bodyRadius,
        outfit,
        mind,
        { k: 'player', playerId: p.id },
        p.side,
        { k: 'free' },
        Math.PI / 2,
      ),
    );
  });
  return world;
}

export function createSim(start: RoundStart, content: Content = CONTENT): Sim {
  const streams = new Map<string, Rng>();
  const rng = (label: string): Rng => {
    let s = streams.get(label);
    if (!s) {
      s = rngStream(start.seed, label);
      streams.set(label, s);
    }
    return s;
  };
  const world = createWorld(start, content, rng);
  const ticks = (ms: number) => Math.round(ms / STEP_MS);
  const ctxFor = (
    inputs: ReadonlyMap<PlayerId, PlayerInput>,
    commands: readonly SimCommand[],
  ): StepContext => ({
    world,
    content,
    inputs,
    commands,
    rng,
    emit: (e) => void world.events.push(e),
    ticks,
  });
  return {
    world,
    content,
    step(inputs = NO_INPUTS, commands = []) {
      runStep(SYSTEMS, ctxFor(inputs, commands));
    },
    view: () => worldView(world, content.balance),
    debugView: () => debugView(world),
    events: () => world.events,
    hash: () => stateHash(world),
    context: () => ctxFor(NO_INPUTS, []),
  };
}
