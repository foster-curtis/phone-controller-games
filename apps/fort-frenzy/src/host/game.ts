// Host runtime (SPEC §15.3, §15.6): the relay client ↔ session (party, phones, intents) ↔ the run's
// sim, driven by the fixed-step loop with render interpolation; the TV's home screen and room; the
// run's transient UI state for the overlay (lane warnings, announcements). No Phaser here: the World
// scene calls `frame()` once per render frame and draws what it returns.
import {
  catchUpSteps,
  createFixedStep,
  joinUrl,
  qrMatrix,
  type FixedStep,
  type QrMatrix,
} from '@pcg/game-kit';
import type { ConnectionStatus, HostClient } from '@pcg/net-client';
import { DIFFICULTY_IDS, THEME_IDS, type LaneId } from '../shared/ids';
import { GAME_ID, type TeamPause } from '../shared/messages';
import {
  connectSession,
  createRelayClient,
  localSnapshotStore,
  type Session,
  type SnapshotStore,
} from './net';
import type { FrameInput, Overlays, Pos } from './scene/worldView';
import { STEP_MS, type EntityId, type SimEvent, type World } from './sim/types';
import { buildTvView } from './tv';
import type { HomeIntent } from './ui/homeNav';
import type { Announcement, HomeRow, TvView } from './ui/types';

/** A frame is clamped to this before the accumulator (a hitch or a hidden tab). */
export const MAX_FRAME_MS = 250;
/** The debug panel's speed-up tops out here; the catch-up cap covers it (Sunny Side M7-fix-1). */
export const MAX_SPEED = 8;
const ANNOUNCE_MS = 6000;

/** The net-client's host token key (relay SPEC §3.1 storage keys): dropped to close the room. */
const HOST_TOKEN_KEY = `pcg:hostToken:${GAME_ID}`;

export interface RuntimeOptions {
  client?: HostClient;
  /** Makes the relay client for a new room after "Return to home" (default: the real relay). */
  createClient?: () => HostClient;
  /** Resume snapshot storage (default `localStorage`, §15.8). */
  store?: SnapshotStore;
  /** Page origin for the join URL (LAN host in dev). */
  origin: string;
  /** Seed for the next run; null = random. */
  seed?: number | null;
  /** Build id recorded in replays. */
  build?: string;
  now?: () => number;
}

export interface RunStats {
  enemyDeaths: number;
  /** Players' main and super attacks. */
  shots: number;
  playerDeaths: number;
  steps: number;
}

export interface Runtime {
  readonly session: Session;
  readonly client: HostClient;
  readonly code: string | null;
  readonly status: ConnectionStatus;
  /** Bumps when a run starts or ends (the World scene rebuilds). */
  readonly runId: number;
  /** Sim speed multiplier (debug 2×; e2e speed-ups). */
  speed: number;
  readonly overlays: Overlays;
  /** Seed for the next run (null = random). */
  nextSeed: number | null;
  readonly stats: RunStats;
  /** Every connected run player is gone: the sim waits (§11.3). */
  readonly pausedAll: boolean;
  /**
   * A player paused the run from their phone (C4, FF14-fix-1): no sim steps, wall time or `advance`,
   * and the TV's render clock stops too. Independent of `pausedAll` and the hidden-tab pause.
   */
  readonly paused: TeamPause | null;
  /** Atlas load progress while loading; null once the World scene is ready. */
  loading: number | null;
  createRoom(): Promise<void>;
  onHome(intent: HomeIntent): void;
  /**
   * Advances the sim by wall time (the runtime's own timer, not render frames, so a slow GPU never
   * slows the run) and sends phone state.
   */
  tick(elapsedMs: number): void;
  /** Runs `steps` sim steps at once (e2e and the debug tools; never wall time). */
  advance(steps: number): void;
  /** What to draw this render frame (null with no run); hands over the events since the last one. */
  frame(renderMs: number): FrameInput | null;
  setVisible(visible: boolean): void;
  tvView(): TvView;
  readonly world: World | null;
  /** Writes the resume snapshot now (`pagehide`, §15.8). */
  saveNow(): void;
  /** Closes the room and goes back to the home screen ("Return to home", §4). */
  goHome(): void;
}

export function createRuntime(opts: RuntimeOptions): Runtime {
  const now = opts.now ?? (() => performance.now());
  const makeClient = opts.createClient ?? createRelayClient;
  const store = opts.store ?? localSnapshotStore();
  let client = opts.client ?? makeClient();
  let runId = 0;
  const stats: RunStats = { enemyDeaths: 0, shots: 0, playerDeaths: 0, steps: 0 };
  const laneWarnings = new Map<LaneId, number>();
  let announcements: { a: Announcement; at: number }[] = [];
  let annId = 0;

  const connect = (c: HostClient) =>
    connectSession(c, {
      now,
      build: opts.build,
      store,
      seed: () => runtime.nextSeed ?? Math.floor(Math.random() * 0x7fffffff),
      onRunStart: () => {
        runId++;
        loop.reset();
        prev.clear();
        events = [];
        laneWarnings.clear();
        announcements = [];
        stats.enemyDeaths = stats.playerDeaths = stats.steps = stats.shots = 0;
      },
      onRunEnd: () => {
        runId++;
        prev.clear();
        events = [];
      },
      // After the leader's ack has gone out.
      onHome: () => queueMicrotask(() => runtime.goHome()),
    });
  let { session, off } = connect(client);

  const loop: FixedStep = createFixedStep({
    stepMs: STEP_MS,
    maxSteps: catchUpSteps(MAX_FRAME_MS * MAX_SPEED, STEP_MS),
  });
  const prev = new Map<EntityId, Pos>();
  let events: SimEvent[] = [];
  let visible = true;
  let pausedAll = false;

  let room: { code: string; joinUrl: string; qr: QrMatrix | null } | null = null;
  const home: { rows: HomeRow[]; focus: number } = { rows: [], focus: 0 };
  /** Home rows: Resume / New run while a saved run waits (§15.8), else create, theme, difficulty. */
  const homeRows = (): HomeRow[] => {
    const r = session.restoring;
    if (r) {
      return [
        { id: 'resume', wave: r.wave, savedAgoMs: Math.max(0, Date.now() - r.savedAt) },
        { id: 'newRun' },
      ];
    }
    return [
      { id: 'create' },
      { id: 'theme', theme: session.settings.theme },
      { id: 'difficulty', difficulty: session.settings.difficulty },
    ];
  };
  /** A saved run: reclaim the room at once so the phones stay joined (§11.5). */
  const offerResume = () => {
    home.focus = 0;
    if (session.restoring)
      runtime.createRoom().catch((e: unknown) => console.error('host: could not reclaim', e));
  };

  const capture = (w: World) => {
    prev.clear();
    for (const u of w.players) prev.set(u.id, { x: u.x, y: u.y, z: 0 });
    for (const u of w.enemies) prev.set(u.id, { x: u.x, y: u.y, z: u.z ?? 0 });
    for (const u of w.soldiers) prev.set(u.id, { x: u.x, y: u.y, z: 0 });
    for (const u of w.projectiles) prev.set(u.id, { x: u.x, y: u.y, z: u.z ?? 0 });
  };

  const step = () => {
    const sim = session.sim;
    if (!sim) return;
    capture(sim.world);
    sim.step();
    stats.steps++;
    session.afterStep();
    const w = sim.world;
    // Events wait for the next render frame; a stalled renderer keeps only the latest ones.
    if (events.length > 4000) events = events.slice(-2000);
    for (const e of w.events) {
      events.push(e);
      if (e.e === 'laneWarning') laneWarnings.set(e.lane, e.spawnsAtTick);
      else if (e.e === 'attack' && e.slot !== 'attack') stats.shots++;
      else if (e.e === 'death') {
        if (e.what === 'enemy') stats.enemyDeaths++;
        else if (e.what === 'player') stats.playerDeaths++;
      } else if (e.e === 'purchase') {
        const p = w.players.find((x) => x.slot === e.slot);
        const m = session.party.members.find((x) => x.slot === e.slot);
        if (p && m)
          announcements.push({
            a: {
              id: ++annId,
              playerId: m.playerId,
              name: p.name,
              color: p.color,
              item: e.item,
              tier: e.tier,
            },
            at: now(),
          });
      }
    }
  };

  const cycle = <T>(list: readonly T[], cur: T, dir: number): T =>
    list[(list.indexOf(cur) + dir + list.length) % list.length]!;

  const runtime: Runtime = {
    get session() {
      return session;
    },
    get client() {
      return client;
    },
    get code() {
      return client.code;
    },
    get status() {
      return client.status;
    },
    get runId() {
      return runId;
    },
    speed: 1,
    overlays: { hitbox: false, range: false, flow: false },
    nextSeed: opts.seed ?? null,
    stats,
    get pausedAll() {
      return pausedAll;
    },
    get paused() {
      return session.paused;
    },
    loading: 0,
    get world() {
      return session.sim?.world ?? null;
    },

    async createRoom() {
      if (room) return;
      const c = client;
      const r = await c.start();
      if (c !== client) return; // went home meanwhile
      const url = joinUrl(opts.origin, r.code);
      room = { code: r.code, joinUrl: url, qr: qrMatrix(url) };
    },

    onHome(intent) {
      if (intent.type === 'focus') home.focus = intent.index;
      else if (intent.type === 'cycle') {
        if (intent.row === 'theme')
          session.setSettings({ theme: cycle(THEME_IDS, session.settings.theme, intent.dir) });
        else
          session.setSettings({
            difficulty: cycle(DIFFICULTY_IDS, session.settings.difficulty, intent.dir),
          });
      } else if (intent.row === 'resume') {
        session.resume();
        home.focus = 0;
      } else if (intent.row === 'newRun') {
        session.newRun();
        home.focus = 0;
      } else if (intent.row === 'create') {
        runtime
          .createRoom()
          .catch((e: unknown) => console.error('host: could not create a room', e));
      }
    },

    saveNow() {
      session.saveNow();
    },

    goHome() {
      // Every phone leaves, the relay forgets the room (no host token to reclaim it), and the next
      // Create starts a new room code (§4).
      for (const m of session.party.members) if (m.connected) client.kick(m.playerId);
      session.endRun();
      off();
      client.close();
      try {
        globalThis.sessionStorage?.removeItem(HOST_TOKEN_KEY);
      } catch {
        /* storage off */
      }
      const settings = { ...session.settings };
      client = makeClient();
      ({ session, off } = connect(client));
      session.setSettings(settings);
      room = null;
      home.focus = 0;
    },

    tick(elapsedMs) {
      const sim = session.sim;
      const dt = visible ? Math.min(Math.max(0, elapsedMs), MAX_FRAME_MS) : 0;
      if (sim) {
        // Everyone in the run dropped at once: hold the sim until someone is back (§11.3).
        pausedAll = session.connectedInRun() === 0;
        // A team pause holds it too; the two are independent (FF14-fix-1).
        if (!pausedAll && !session.paused) loop.advance(dt * runtime.speed, step);
      }
      session.flush();
      const t = now();
      if (announcements.length > 0)
        announcements = announcements.filter((x) => t - x.at < ANNOUNCE_MS);
    },

    advance(steps) {
      for (let i = 0; i < steps && session.sim && !session.paused; i++) step();
      session.flush();
    },

    frame(renderMs) {
      const sim = session.sim;
      if (!sim) return null;
      const out: FrameInput = {
        world: sim.world,
        prev,
        // Render interpolation: how far into the next step the loop's clock is.
        alpha: Math.min(0.999, loop.accumulator / STEP_MS),
        events,
        // Paused, the TV's render-only motion (particles, pulses) holds still with the sim.
        dtMs: visible && !session.paused ? Math.min(Math.max(0, renderMs), MAX_FRAME_MS) : 0,
        overlays: runtime.overlays,
      };
      events = [];
      return out;
    },

    setVisible(v) {
      visible = v;
      if (v) loop.reset();
    },

    tvView() {
      home.rows = homeRows();
      home.focus = Math.min(home.focus, home.rows.length - 1);
      return buildTvView({
        ctx: session.view(),
        loading: runtime.loading,
        home,
        room,
        announcements: announcements.map((x) => x.a),
        laneWarnings,
        outdated: session.outdated,
      });
    },
  };
  offerResume();
  return runtime;
}
