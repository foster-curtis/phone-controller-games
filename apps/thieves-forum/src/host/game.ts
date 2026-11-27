// Host runtime (SPEC §6.2, §6.11, §6.14, §6.17, §6.18, §12.3, §12.5; BUILD_PLAN TF12): relay client ↔
// match machine (TF10) ↔ round sim (TF2, TF8, TF9) ↔ scene and phones. Phone messages go through the
// handler registry (`net/handlers/*.ts`); match effects become phone screens, round sims and TV views;
// each fixed 60 Hz step's `phone` events go privately to one phone (`net/phone.ts`) and its `tv` events
// to the scene and the audio only. The sim and the match share one game clock: wall time × the debug
// `timeScale`, so phone timers (`endsInMs`) are divided by it. No Phaser here.
// Stress mode (`bots`) runs one round straight from Start with no match and no phones (TF7).
import { catchUpSteps, createFixedStep, joinUrl, rngStream } from '@pcg/game-kit';
import type { ConnectionStatus, HostClient } from '@pcg/net-client';
import { CONTENT } from '../content';
import type { StallId, Vec2 } from '../content/types';
import { isPhoneMsg, type HostMsg, type Screen } from '../shared/messages';
import { PLAYER_COLOR_IDS, type PlayerColorId } from '../shared/theme';
import { createMatch, type Effect, type Match, type MatchEvent } from './match/match';
import type { MatchPhase } from './match/types';
import { createInputStore } from './net/inputs';
import { createPhoneRouter } from './net/phone';
import { dispatchPhone, loadContextProviders, loadHandlers } from './net/registry';
import type { HandlerCtx } from './net/types';
import { attachLedger } from './sim/catches';
import { isTvEvent, type TvEvent } from './sim/events';
import { createLedger, roundHauls } from './sim/ledger';
import type { Ledger } from './sim/ledger/types';
import { pickOpenStalls } from './match/openStalls';
import type { FrameInput, SceneSource } from './scene/types';
import type { DebugView, WorldView } from './sim/snapshot';
import { THEFT_HOOKS } from './sim/stalls';
import type {
  Character,
  EntityId,
  PlayerId,
  PlayerInput,
  RoundStart,
  SimCommand,
} from './sim/types';
import { STEP_MS } from './sim/types';
import { createSim, type Sim } from './sim/world';
import type { TvControl, TvView } from './ui/types';

/** A frame is clamped to this before the accumulator (a hitch or a hidden tab). */
export const MAX_FRAME_MS = 250;
/** The debug speed-up tops out here; the catch-up cap covers it. */
export const MAX_TIME_SCALE = 8;
/** Recent step times kept for the perf readout. */
const STEP_WINDOW = 600;
/** TV events kept for the scene between frames (and for the debug log). */
const TV_QUEUE_MAX = 400;

/** The round as e2e and the dev tools see it (TF7 names). */
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
  /** Match seed source; default random. */
  seed?: number;
  now?: () => number;
  /** Bots on the player slots (stress mode): their ids and a per-step input source. */
  bots?: { ids: readonly PlayerId[]; inputs(now: number): Map<PlayerId, PlayerInput> };
}

/** A step's TV events with the view after it (audio pans by position). */
export type TvEventsListener = (events: readonly TvEvent[], view: WorldView) => void;

export interface Runtime extends SceneSource {
  readonly client: HostClient | null;
  code(): string | null;
  status(): ConnectionStatus;
  players(): SpikePlayer[];
  phase(): SpikePhase;
  matchPhase(): MatchPhase;
  readonly timeScale: number;
  setTimeScale(n: number): void;
  /** Start from the lobby; `by` is the phone asking (only the leader may), none = the TV. */
  start(by?: PlayerId): boolean;
  /** The TV's keyboard / gamepad / rules-shell controls (SPEC §6.16). */
  control(c: TvControl): void;
  /** Advances by wall time (a 60 Hz timer, not render frames). */
  tick(elapsedMs: number): void;
  setVisible(visible: boolean): void;
  tvView(): TvView;
  world(): WorldView | null;
  sim(): Sim | null;
  ledger(): Ledger | null;
  /** Debug only: the overlay's view and the player character ids. */
  debugView(): DebugView | null;
  characterOf(id: PlayerId): EntityId | null;
  playerNames(): Map<EntityId, string>;
  stepStats(): StepStats;
  /** Debug / e2e: the play timer runs out now. */
  endRound(): void;
  /** Debug log of recent TV events (e2e). */
  tvLog(): readonly TvEvent[];
  /** Called when the TV view's phase changes (main.ts re-renders at once). */
  onChange(cb: () => void): void;
  /** Every step's `tv` events (the audio; never `phone` events). */
  onTvEvents(cb: TvEventsListener): void;
}

const IN_ROUND = new Set<MatchPhase>(['roundStart', 'play', 'handsUp', 'reveal', 'transition']);

export function createRuntime(opts: RuntimeOptions): Runtime {
  const wallNow = opts.now ?? (() => performance.now());
  const { client } = opts;
  const content = CONTENT;
  const balance = content.balance;
  const inputs = createInputStore(balance.net);
  const handlers = loadHandlers();
  const providers = loadContextProviders();
  const listeners: (() => void)[] = [];
  const tvListeners: TvEventsListener[] = [];
  let visible = true;
  let timeScale = 1;
  /** Game ms: wall ms × timeScale, shared by the match deadlines and the sim steps. */
  let gameMs = 0;
  let sim: Sim | null = null;
  let ledger: Ledger | null = null;
  let commands: SimCommand[] = [];
  let tvQueue: TvEvent[] = [];
  const tvRecent: TvEvent[] = [];
  let openStalls: StallId[] = content.layout.stalls.map((s) => s.id);
  let botPlayers: SpikePlayer[] = [];
  let lastCode: string | null = null;
  const prev = new Map<EntityId, Vec2>();
  const times = new Float64Array(STEP_WINDOW);
  let stepCount = 0;
  let loop = makeLoop();

  const match: Match = createMatch({
    rng: rngStream(opts.seed ?? Math.floor(Math.random() * 0x7fffffff), 'match'),
    now: () => gameMs,
    content,
    rulesOnFirstStart: false,
  });

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
  const wall = (gms: number) => Math.max(0, Math.round(gms / timeScale));

  function character(id: PlayerId): Character | null {
    return (
      sim?.world.characters.find((c) => c.control.k !== 'npc' && c.control.playerId === id) ??
      null
    );
  }

  const router = createPhoneRouter({
    content,
    world: () => sim?.world ?? null,
    ledger: () => ledger,
    character,
    send,
    timeScale: () => timeScale,
    providers,
    onReleased: (p) => {
      const s = match.screenFor(p);
      if (s) sendScreen(p, s);
    },
  });

  // ---- screens -------------------------------------------------------------------------------

  /** Phone timers in wall ms; a player in the stocks keeps the stocks screen (SPEC §6.13). */
  function sendScreen(to: PlayerId, screen: Screen): void {
    let s: Screen = screen;
    const c = character(to);
    if (s.s === 'play' && c?.activity.k === 'stocks' && sim) {
      const ms = (c.activity.until - sim.world.tick) * STEP_MS;
      s = { s: 'stocks', pot: 0, endsInMs: ms };
    }
    if ('endsInMs' in s) s = { ...s, endsInMs: wall(s.endsInMs) };
    send({ t: 'screen', screen: s }, to);
    if (s.s === 'play') router.resync(to, wallNow());
  }

  // ---- rounds --------------------------------------------------------------------------------

  function beginRound(start: RoundStart): void {
    sim = createSim(start, content);
    ledger = createLedger(balance.match.packCapacity);
    for (const p of start.players) ledger.open(p.side, balance.match.startPurse);
    // TF8 / TF9 hooks: stall theft and catches pay through this round's ledger.
    attachLedger(sim.world, ledger);
    THEFT_HOOKS.ledger = ledger;
    openStalls = [...start.openStalls];
    router.reset();
    commands = [];
    tvQueue = [];
    prev.clear();
    loop = makeLoop();
    for (const p of start.players) router.resync(p.id, wallNow());
  }

  function dropRound(): void {
    sim = null;
    ledger = null;
    THEFT_HOOKS.ledger = null;
    commands = [];
    tvQueue = [];
    prev.clear();
    router.reset();
  }

  /** Time up (SPEC §6.14): freeze the round, close every sheet, hand the hauls to the match. */
  function handsUp(round: number): void {
    if (!sim || !ledger) return;
    const w = sim.world;
    if (w.phase === 'opening' || w.phase === 'play') {
      w.phase = 'handsUp';
      w.phaseEndsAt = null;
    }
    const chars: Record<PlayerId, EntityId> = {};
    for (const c of w.characters) {
      if (c.control.k === 'npc') continue;
      chars[c.control.playerId] = c.id;
      c.vx = 0;
      c.vy = 0;
      if (c.activity.k !== 'stocks') c.activity = { k: 'handsUp' };
      c.pose = 'handsUp';
    }
    router.closeAll(Object.keys(chars));
    apply(match.dispatch({ type: 'hauls', round, hauls: roundHauls(ledger), characters: chars }));
  }

  function apply(effects: readonly Effect[]): void {
    let tv = false;
    for (const f of effects) {
      switch (f.k) {
        case 'tv':
          tv = true;
          break;
        case 'screen':
          sendScreen(f.to, f.screen);
          break;
        case 'roundStart':
          beginRound(f.start);
          break;
        case 'handsUp':
          handsUp(f.round);
          break;
        case 'podium':
        case 'lobby':
          dropRound();
          break;
        case 'left':
          inputs.forget(f.id);
          break;
        default:
          break; // play, reveal, transition: the sim, scene and audio follow the TV view
      }
    }
    if (tv) changed();
  }

  const dispatch = (e: MatchEvent) => apply(match.dispatch(e));

  // ---- the step ------------------------------------------------------------------------------

  const stepping = () => !!sim && (sim.world.phase === 'opening' || sim.world.phase === 'play');

  function stepOnce() {
    if (!sim || !stepping()) return;
    const w = sim.world;
    prev.clear();
    for (const c of w.characters) prev.set(c.id, { x: c.x, y: c.y });
    const t = wallNow();
    const sample = opts.bots ? opts.bots.inputs(t) : inputs.sample(t);
    const cmds = commands;
    commands = [];
    const t0 = performance.now();
    sim.step(sample, cmds);
    times[stepCount++ % STEP_WINDOW] = performance.now() - t0;
    const tvEvents: TvEvent[] = [];
    for (const e of sim.events()) {
      if (isTvEvent(e)) tvEvents.push(e);
      else router.event(e, t);
    }
    if (tvEvents.length > 0) {
      tvQueue.push(...tvEvents);
      if (tvQueue.length > TV_QUEUE_MAX) tvQueue.splice(0, tvQueue.length - TV_QUEUE_MAX);
      tvRecent.push(...tvEvents);
      if (tvRecent.length > TV_QUEUE_MAX) tvRecent.splice(0, tvRecent.length - TV_QUEUE_MAX);
      const view = sim.view();
      for (const cb of tvListeners) cb(tvEvents, view);
    }
  }

  // ---- phones --------------------------------------------------------------------------------

  const hctx: HandlerCtx = {
    now: wallNow,
    character,
    world: () => sim?.world ?? null,
    playing: () => match.state().phase === 'play' && sim?.world.phase === 'play',
    command: (cmd) => void commands.push(cmd),
    match: dispatch,
    send,
    resync: (p) => router.resync(p, wallNow()),
    inputs,
  };

  if (client) {
    client.onMessage((from, data) => {
      if (isPhoneMsg(data)) dispatchPhone(handlers, data, from, hctx);
    });
    client.onPeer((change) => {
      if (change.event !== 'left') return;
      inputs.forget(change.playerId);
      // A drop mid-match keeps the spot (SPEC §6.18; takeover is TF16); in the lobby it's a leave.
      const inMatch = IN_ROUND.has(match.state().phase);
      dispatch(
        inMatch
          ? { type: 'disconnect', id: change.playerId }
          : { type: 'leave', id: change.playerId },
      );
    });
    client.onRoom(() => syncRoom());
    client.onStatus(() => {
      syncRoom();
      changed();
    });
  }

  function syncRoom(): void {
    const code = client?.code ?? null;
    if (code === lastCode) return;
    lastCode = code;
    dispatch({ type: 'room', code, joinUrl: code ? joinUrl(opts.origin, code) : null });
  }

  // ---- views ---------------------------------------------------------------------------------

  function phase(): SpikePhase {
    const p = sim?.world.phase;
    if (!p) return 'lobby';
    return p === 'opening' ? 'opening' : p === 'play' ? 'play' : 'handsUp';
  }

  function tvView(): TvView {
    syncRoom();
    if (opts.bots) {
      const w = sim?.world;
      if (!w) return { phase: 'handsUp', round: 1, rounds: balance.match.rounds };
      return {
        phase: 'play',
        round: w.round,
        rounds: balance.match.rounds,
        timeLeftMs: wall(sim!.view().timeLeftMs),
        code: null,
      };
    }
    const v = match.tvView();
    if (v.phase === 'roundStart') return { ...v, endsInMs: wall(v.endsInMs) };
    if (v.phase === 'play') return { ...v, timeLeftMs: wall(v.timeLeftMs) };
    return v;
  }

  function players(): SpikePlayer[] {
    if (opts.bots) return botPlayers.map((p) => ({ ...p }));
    return match.state().players.map((p) => ({ id: p.id, name: p.name, color: p.color }));
  }

  return {
    client,
    code: () => client?.code ?? null,
    status: () => client?.status ?? 'idle',
    players,
    phase,
    matchPhase: () => match.state().phase,
    get timeScale() {
      return timeScale;
    },
    get openStalls() {
      return openStalls;
    },
    setTimeScale(n) {
      if (Number.isFinite(n) && n > 0) timeScale = Math.min(MAX_TIME_SCALE, n);
    },
    start(by) {
      if (opts.bots) {
        if (sim) return false;
        botPlayers = opts.bots.ids.map((id, i) => ({
          id,
          name: id,
          color: PLAYER_COLOR_IDS[i % PLAYER_COLOR_IDS.length]!,
        }));
        const seed = opts.seed ?? Math.floor(Math.random() * 0x7fffffff);
        beginRound({
          seed,
          round: 1,
          players: botPlayers.map((p) => ({ id: p.id, side: { kind: 'player', id: p.id } })),
          openStalls: pickOpenStalls(seed, botPlayers.length, content.layout, balance),
          guards: 0,
        });
        changed();
        return true;
      }
      const before = match.state().phase;
      dispatch(
        by === undefined
          ? { type: 'control', action: 'start' }
          : { type: 'leader', id: by, action: 'start' },
      );
      return before === 'lobby' && match.state().phase !== 'lobby';
    },
    control: (c) => dispatch({ type: 'control', action: c }),
    tick(elapsedMs) {
      if (!visible) return;
      const dt = Math.min(Math.max(0, elapsedMs), MAX_FRAME_MS) * timeScale;
      gameMs += dt;
      if (stepping()) loop.advance(dt, stepOnce);
      if (!opts.bots) dispatch({ type: 'tick' });
      router.flush(wallNow());
    },
    setVisible(v) {
      visible = v;
      if (v) loop.reset(); // the host runs no steps while the TV tab is hidden (SPEC §12.3)
    },
    frame(): FrameInput | null {
      if (!sim) return null;
      const events = tvQueue;
      tvQueue = [];
      return {
        view: sim.view(),
        prev,
        alpha: stepping() ? Math.min(0.999, loop.accumulator / STEP_MS) : 1,
        events,
      };
    },
    tvView,
    world: () => sim?.view() ?? null,
    sim: () => sim,
    ledger: () => ledger,
    debugView: () => sim?.debugView() ?? null,
    characterOf: (id) => character(id)?.id ?? null,
    playerNames() {
      const out = new Map<EntityId, string>();
      for (const p of players()) {
        const id = character(p.id)?.id;
        if (id !== undefined) out.set(id, p.name);
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
    endRound() {
      const st = match.state();
      if (st.phase !== 'play' || st.phaseEndsAt === null) return;
      gameMs = Math.max(gameMs, st.phaseEndsAt);
      dispatch({ type: 'tick' });
    },
    tvLog: () => [...tvRecent],
    onChange(cb) {
      listeners.push(cb);
    },
    onTvEvents(cb) {
      tvListeners.push(cb);
    },
  };
}
