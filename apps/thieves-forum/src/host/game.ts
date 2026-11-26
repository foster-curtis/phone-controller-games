// Host runtime for the crowd spike (SPEC §6.2, §6.18, §12.3, §12.5; BUILD_PLAN TF7): relay client ↔
// lobby roster ↔ one round of the sim. Lobby → "Spike start" (the leader phone's `leader start`, or
// the TV's Start key) → the players-only opening → play → hands up → back to the lobby. Phone input
// samples become `PlayerInput`s each fixed 60 Hz step; the scene gets `WorldView` plus the previous
// step's positions for interpolation. `timeScale` (debug) runs n steps per step slot. No Phaser here.
// The match flow proper (rules, three rounds, reveal, podium) is TF10/TF12/TF16.
import { catchUpSteps, createFixedStep, joinUrl } from '@pcg/game-kit';
import type { ConnectionStatus, HostClient } from '@pcg/net-client';
import { CONTENT } from '../content';
import type { StallId, Vec2 } from '../content/types';
import {
  isPhoneMsg,
  MIN_PLAYERS,
  PROTOCOL_VERSION,
  type HostMsg,
  type Screen,
} from '../shared/messages';
import { PLAYER_COLOR_IDS, type PlayerColorId } from '../shared/theme';
import { pickOpenStalls } from './match/openStalls';
import { createInputStore } from './net/inputs';
import { createRoster } from './roster';
import type { FrameInput, SceneSource } from './scene/types';
import type { DebugView, WorldView } from './sim/snapshot';
import type { EntityId, PlayerId, PlayerInput, RoundStart } from './sim/types';
import { STEP_MS } from './sim/types';
import { createSim, type Sim } from './sim/world';
import type { TvView } from './ui/types';

/** A frame is clamped to this before the accumulator (a hitch or a hidden tab). */
export const MAX_FRAME_MS = 250;
/** The debug speed-up tops out here; the catch-up cap covers it. */
export const MAX_TIME_SCALE = 8;
/** Hands up shows this long (wall ms) before the spike returns to the lobby. */
export const HANDS_UP_MS = 6000;
/** Recent step times kept for the perf readout. */
const STEP_WINDOW = 600;

export type SpikePhase = 'lobby' | 'opening' | 'play' | 'handsUp';

export interface SpikePlayer {
  id: PlayerId;
  name: string;
  color: PlayerColorId;
}

export interface StepStats {
  meanMs: number;
  p99Ms: number;
  steps: number;
}

export interface RuntimeOptions {
  /** The relay client; null runs without phones (stress mode). */
  client: HostClient | null;
  origin: string;
  /** Round seed; default random. */
  seed?: number;
  now?: () => number;
  /** Bots on the player slots (stress mode): their ids and a per-step input source. */
  bots?: { ids: readonly PlayerId[]; inputs(now: number): Map<PlayerId, PlayerInput> };
}

export interface Runtime extends SceneSource {
  readonly client: HostClient | null;
  code(): string | null;
  status(): ConnectionStatus;
  players(): SpikePlayer[];
  phase(): SpikePhase;
  readonly timeScale: number;
  setTimeScale(n: number): void;
  /** Starts the spike round; `by` is the phone asking (only the leader may). */
  start(by?: PlayerId): boolean;
  /** Advances by wall time (a 60 Hz timer, not render frames). */
  tick(elapsedMs: number): void;
  setVisible(visible: boolean): void;
  tvView(): TvView;
  world(): WorldView | null;
  sim(): Sim | null;
  /** Debug only: the overlay's view and the player character ids. */
  debugView(): DebugView | null;
  characterOf(id: PlayerId): EntityId | null;
  playerNames(): Map<EntityId, string>;
  stepStats(): StepStats;
  /** Called when the TV view's phase changes (main.ts re-renders at once). */
  onChange(cb: () => void): void;
}

export function createRuntime(opts: RuntimeOptions): Runtime {
  const now = opts.now ?? (() => performance.now());
  const { client } = opts;
  const balance = CONTENT.balance;
  const roster = createRoster();
  const inputs = createInputStore(balance.net);
  const listeners: (() => void)[] = [];
  let visible = true;
  let timeScale = 1;
  let phase: SpikePhase = 'lobby';
  let sim: Sim | null = null;
  let roundPlayers: SpikePlayer[] = [];
  let handsUpAt = 0;
  let openStalls: StallId[] = CONTENT.layout.stalls.map((s) => s.id);
  const prev = new Map<EntityId, Vec2>();
  const times = new Float64Array(STEP_WINDOW);
  let stepCount = 0;
  let loop = makeLoop();

  function makeLoop() {
    return createFixedStep({
      stepMs: STEP_MS,
      maxSteps: catchUpSteps(MAX_FRAME_MS * MAX_TIME_SCALE, STEP_MS),
    });
  }

  const changed = () => {
    for (const cb of listeners) cb();
  };
  const send = (msg: HostMsg, to: PlayerId) => client?.send(msg, to);
  const colorOf = (i: number): PlayerColorId => PLAYER_COLOR_IDS[i % PLAYER_COLOR_IDS.length]!;
  const lobbyPlayers = (): SpikePlayer[] =>
    roster.players().map((p, i) => ({ id: p.id, name: p.name, color: colorOf(i) }));
  const rounds = balance.match.rounds;
  const wallMs = (simMs: number) => Math.max(0, Math.round(simMs / timeScale));

  function characterOf(id: PlayerId): EntityId | null {
    const c = sim?.world.characters.find(
      (ch) => ch.control.k === 'player' && ch.control.playerId === id,
    );
    return c ? c.id : null;
  }

  /** The screen a round player's phone shows now (SPEC §6.17). */
  function screenFor(p: SpikePlayer): Screen | null {
    if (!sim) return null;
    const w = sim.world;
    const c = w.characters.find((ch) => ch.id === characterOf(p.id));
    if (!c) return null;
    if (phase === 'opening')
      return {
        s: 'roundStart',
        round: w.round,
        rounds,
        outfits: [{ ...c.outfit }],
        endsInMs: wallMs(((w.phaseEndsAt ?? w.tick) - w.tick) * STEP_MS),
      };
    if (phase === 'play')
      return {
        s: 'play',
        round: w.round,
        rounds,
        endsInMs: wallMs(sim.view().timeLeftMs),
        name: p.name,
        color: p.color,
      };
    if (phase === 'handsUp') return { s: 'handsUp', bag: 0, items: [], total: 0 };
    return null;
  }

  function sendRoundState(p: SpikePlayer) {
    const s = screenFor(p);
    if (!s) return;
    send({ t: 'screen', screen: s }, p.id);
    const c = sim?.world.characters.find((ch) => ch.id === characterOf(p.id));
    if (c && phase !== 'handsUp') {
      send({ t: 'outfit', outfit: { ...c.outfit } }, p.id);
      // Holds, toss and tips are later milestones: the context buttons stay blank (TF12).
      send({ t: 'context', main: null, tossReadyInMs: 0, tip: false, catch: false }, p.id);
    }
  }

  function setPhase(next: SpikePhase) {
    if (next === phase) return;
    phase = next;
    if (next === 'handsUp') handsUpAt = now();
    for (const p of roundPlayers) sendRoundState(p);
    changed();
  }

  function toLobby() {
    sim = null;
    phase = 'lobby';
    prev.clear();
    inputs.clear();
    for (const p of roundPlayers) send({ t: 'screen', screen: { s: 'joining' } }, p.id);
    roundPlayers = [];
    changed();
  }

  function start(by?: PlayerId): boolean {
    if (phase !== 'lobby') return false;
    const players = opts.bots
      ? opts.bots.ids.map((id, i) => ({ id, name: id, color: colorOf(i) }))
      : lobbyPlayers();
    if (by !== undefined && players[0]?.id !== by) return false; // only the leader
    if (!opts.bots && players.length < MIN_PLAYERS) return false;
    const seed = opts.seed ?? Math.floor(Math.random() * 0x7fffffff);
    openStalls = pickOpenStalls(seed, players.length, CONTENT.layout, balance);
    const rs: RoundStart = {
      seed,
      round: 1,
      players: players.map((p) => ({ id: p.id, side: { kind: 'player', id: p.id } })),
      openStalls,
      guards: 0, // guards are TF9
    };
    sim = createSim(rs);
    roundPlayers = players;
    prev.clear();
    loop = makeLoop();
    phase = 'opening';
    for (const p of roundPlayers) sendRoundState(p);
    changed();
    return true;
  }

  function stepOnce() {
    if (!sim) return;
    const w = sim.world;
    prev.clear();
    for (const c of w.characters) prev.set(c.id, { x: c.x, y: c.y });
    const t = now();
    const sample = opts.bots ? opts.bots.inputs(t) : inputs.sample(t);
    const t0 = performance.now();
    sim.step(sample);
    times[stepCount++ % STEP_WINDOW] = performance.now() - t0;
    if (w.phase === 'play' && phase === 'opening') setPhase('play');
    else if (w.phase !== 'opening' && w.phase !== 'play' && phase !== 'handsUp')
      setPhase('handsUp');
  }

  if (client) {
    client.onMessage((from, data) => {
      if (!isPhoneMsg(data)) return;
      switch (data.t) {
        case 'join': {
          if ((data.proto ?? PROTOCOL_VERSION) !== PROTOCOL_VERSION) {
            send({ t: 'outdated', proto: PROTOCOL_VERSION }, from);
            return;
          }
          const name = roster.join(from, data.name);
          if (name === null) return;
          send({ t: 'joined', name }, from);
          const p = roundPlayers.find((x) => x.id === from);
          if (p) sendRoundState(p); // a reconnect heals itself (SPEC §12.5)
          changed();
          return;
        }
        case 'input':
          inputs.set(from, data.x, data.y, data.bits, now());
          return;
        case 'leader':
          if (data.action === 'start') start(from);
          return;
        default:
          return; // holds, stalls, tips, lobby colors: later milestones
      }
    });
    client.onPeer((change) => {
      roster.peer(change);
      if (change.event === 'left') inputs.forget(change.playerId);
      changed();
    });
    client.onRoom(() => changed());
    client.onStatus(() => changed());
  }

  return {
    client,
    code: () => client?.code ?? null,
    status: () => client?.status ?? 'idle',
    players: () => (opts.bots && sim ? roundPlayers : lobbyPlayers()).map((p) => ({ ...p })),
    phase: () => phase,
    get timeScale() {
      return timeScale;
    },
    get openStalls() {
      return openStalls;
    },
    setTimeScale(n) {
      if (Number.isFinite(n) && n > 0) timeScale = Math.min(MAX_TIME_SCALE, n);
    },
    start,
    tick(elapsedMs) {
      if (!visible || !sim) return;
      if (phase === 'handsUp' && now() - handsUpAt >= HANDS_UP_MS && !opts.bots) {
        toLobby();
        return;
      }
      const dt = Math.min(Math.max(0, elapsedMs), MAX_FRAME_MS);
      loop.advance(dt * timeScale, stepOnce);
    },
    setVisible(v) {
      visible = v;
      if (v) loop.reset(); // the host runs no steps while the TV tab is hidden (SPEC §12.3)
    },
    frame(): FrameInput | null {
      if (!sim) return null;
      return {
        view: sim.view(),
        prev,
        alpha: Math.min(0.999, loop.accumulator / STEP_MS),
      };
    },
    tvView(): TvView {
      const code = client?.code ?? null;
      const w = sim?.world;
      if (!w || phase === 'lobby') {
        const players = lobbyPlayers();
        return {
          phase: 'lobby',
          code,
          joinUrl: code ? joinUrl(opts.origin, code) : null,
          players: players.map((p, i) => ({
            name: p.name,
            color: p.color,
            ready: false,
            leader: i === 0,
          })),
          canStart: players.length >= MIN_PLAYERS,
        };
      }
      if (phase === 'opening')
        return {
          phase: 'roundStart',
          round: w.round,
          rounds,
          endsInMs: wallMs(((w.phaseEndsAt ?? w.tick) - w.tick) * STEP_MS),
        };
      if (phase === 'play')
        return {
          phase: 'play',
          round: w.round,
          rounds,
          timeLeftMs: wallMs(sim!.view().timeLeftMs),
          code,
        };
      return { phase: 'handsUp', round: w.round, rounds };
    },
    world: () => sim?.view() ?? null,
    sim: () => sim,
    debugView: () => sim?.debugView() ?? null,
    characterOf,
    playerNames() {
      const out = new Map<EntityId, string>();
      for (const p of roundPlayers) {
        const id = characterOf(p.id);
        if (id !== null) out.set(id, p.name);
      }
      return out;
    },
    stepStats() {
      const k = Math.min(stepCount, STEP_WINDOW);
      const recent = Array.from(times.subarray(0, k)).sort((a, b) => a - b);
      const mean = recent.reduce((s, x) => s + x, 0) / Math.max(1, k);
      return {
        meanMs: mean,
        p99Ms: recent[Math.min(k - 1, Math.floor(k * 0.99))] ?? 0,
        steps: stepCount,
      };
    },
    onChange(cb) {
      listeners.push(cb);
    },
  };
}
