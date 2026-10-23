// Host runtime (plain TS, no Phaser): HostClient ↔ match ↔ sim, driven by the fixed-step loop with
// render interpolation (SPEC §8). Scenes only read from it and call `match.hostAction`.
import {
  createHostClient,
  type ConnectionStatus,
  type HostClient,
  type HostRoom,
} from '@pcg/net-client';
import { GAME_ID } from '../shared/messages';
import { relayUrl } from '../shared/relayUrl';
import { createDebugSim, type DebugSim } from './debug';
import { createFixedStep, type FixedStep } from './loop/fixedStep';
import { interpolateSnapshot } from './loop/interpolate';
import { createMatch, STEP_MS, type Match, type MatchView, type StorageLike } from './match';
import { createSim, type Sim, type SimSnapshot } from './sim';
import { createHostNet } from './net';

/** Players per room (SPEC §6.1: 2–8; spectators count toward the relay's cap). */
export const MAX_PLAYERS = 8;

/** Elapsed time per frame is clamped to this before the accumulator (a long hitch or a hidden tab). */
const MAX_FRAME_MS = 250;

export interface GameRuntimeOptions {
  client?: HostClient;
  storage?: StorageLike;
  /** Wrap the sim with debug controls (`__pcg.debug.eliminate`). */
  debug?: boolean;
  /** Called when the relay hands us a brand-new room after the old one expired. */
  onNewRoom?: (room: HostRoom) => void;
}

export interface GameRuntime {
  readonly match: Match;
  readonly sim: Sim;
  /** Present when created with `debug: true`. */
  readonly debugSim: DebugSim | null;
  readonly client: HostClient;
  /** Room code once the relay answered. */
  readonly code: string | null;
  readonly status: ConnectionStatus;
  /** Creates (or reclaims) the room. Rejects with RelayError. */
  start(): Promise<HostRoom>;
  /** One render frame: runs the owed fixed steps (sim + match) and updates `alpha`. */
  frame(elapsedMs: number): void;
  /** The interpolated snapshot to draw this frame. */
  snapshot(): SimSnapshot;
  view(): MatchView;
  /** Bumps on every match event / room / status change (scenes re-render when it moves). */
  readonly version: number;
  setHostVisible(visible: boolean): void;
  destroy(): void;
}

export function createGameRuntime(opts: GameRuntimeOptions = {}): GameRuntime {
  const client =
    opts.client ?? createHostClient({ url: relayUrl(), game: GAME_ID, maxPlayers: MAX_PLAYERS });
  const realSim = createSim();
  const debugSim = opts.debug ? createDebugSim(realSim) : null;
  const sim: Sim = debugSim ?? realSim;
  const net = createHostNet(client);
  const match = createMatch({
    sim,
    send: net.deps.send,
    kick: net.deps.kick,
    storage: opts.storage ?? sessionStorage,
  });
  const loop: FixedStep = createFixedStep({ stepMs: STEP_MS });

  let version = 0;
  const bump = () => {
    version++;
  };

  let prev = sim.snapshot();
  let curr = prev;
  let alpha = 0;
  const resetSnapshots = () => {
    prev = curr = sim.snapshot();
    alpha = 0;
  };

  const offs = [
    net.attach(match, (room) => {
      bump();
      opts.onNewRoom?.(room);
    }),
    match.onEvent((e) => {
      bump();
      // A new round re-seeds the world: drop the old frames so nothing lerps across rounds.
      if (e.type === 'phase' && e.phase === 'countdown') resetSnapshots();
    }),
    client.onRoom(bump),
    client.onStatus(bump),
  ];

  const step = () => {
    if (match.simRunning) {
      prev = curr;
      const events = sim.step();
      curr = sim.snapshot();
      if (events.length > 0) match.handleSimEvents(events);
    }
    match.tick(STEP_MS);
  };

  return {
    match,
    sim,
    debugSim,
    client,
    get code() {
      return client.code;
    },
    get status() {
      return client.status;
    },
    start: () => client.start(),
    frame(elapsedMs) {
      const dt = Math.min(Math.max(0, elapsedMs), MAX_FRAME_MS);
      alpha = loop.advance(dt, step).alpha;
    },
    snapshot: () => interpolateSnapshot(prev, curr, alpha),
    view: () => match.view(),
    get version() {
      return version;
    },
    setHostVisible(visible) {
      if (visible) loop.reset();
      match.setHostVisible(visible);
    },
    destroy() {
      for (const off of offs) off();
      client.close();
      sim.destroy();
    },
  };
}
