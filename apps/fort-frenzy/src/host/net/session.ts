// The host's side of the phones (SPEC §11, §15.6): hello and versions, the party bridge (lobby,
// presence, identity), phone input with receive-time staleness, intents → party calls or sim commands
// with `ack` reasons, and the throttled `team` (≤ 5 Hz, broadcast) and `me` (≤ 10 Hz per phone) state
// sync, sent on change and in full on every hello. Owns the run's sim while one is going. No Phaser,
// no relay client: the runtime passes `send` and `kick`.
import { content as defaultContent, type Content } from '../../content';
import { PLAYER_COLOR_IDS, type ClassId, type PlayerColorId } from '../../shared/ids';
import {
  PROTOCOL_VERSION,
  isControllerMsg,
  type AckReason,
  type HostMsg,
  type Intent,
  type RunSummary,
} from '../../shared/messages';
import { createParty } from '../party';
import { createSim, RunRecorder, type Sim } from '../sim';
import type { RunSettings, RunStart, SimCommand, World } from '../sim/types';
import { PhoneInputSource } from './input';
import { buildSummary, meView, teamView, type FfParty, type ViewCtx } from './views';

/** Game cap (§11.1); the relay room holds 8 for rejoin headroom (§15.6). */
export const MAX_PARTY = 6;
export const TEAM_MIN_MS = 200;
export const ME_MIN_MS = 100;

export interface SessionDeps {
  send(msg: HostMsg, to?: string): void;
  kick(playerId: string): void;
  content?: Content;
  /** Wall clock, ms (input staleness and send throttling). */
  now?: () => number;
  /** Seed for the next run (default: random). */
  seed?: () => number;
  /** Commit hash recorded in replays. */
  build?: string;
  /** A run started (the runtime resets its loop and the World scene). */
  onRunStart?(sim: Sim, start: RunStart): void;
  /** Back in the lobby. */
  onRunEnd?(): void;
}

export interface Session {
  readonly party: FfParty;
  readonly content: Content;
  readonly sim: Sim | null;
  readonly recorder: RunRecorder | null;
  readonly start: RunStart | null;
  readonly settings: RunSettings;
  readonly summary: RunSummary | null;
  /** A phone runs a newer protocol than this TV (§15.6 banner). */
  readonly outdated: boolean;
  handlePeer(change: {
    event: 'joined' | 'left' | 'rejoined';
    playerId: string;
    playerKey: string;
  }): void;
  handleMessage(from: string, data: unknown): void;
  /** After every sim step: acks for this step's commands, party stage, the summary. */
  afterStep(): void;
  /** Sends `team` / `me` snapshots that changed, within the rate limits. */
  flush(): void;
  /** Starts a run from the party (leader force-start or everyone ready). */
  startRun(): AckReason | null;
  /** Back to the lobby (names, colors and classes kept). */
  endRun(): void;
  /** A TV-side command (debug panel), logged like any other. */
  command(cmd: SimCommand): void;
  /** Lobby removal from the TV (§11.1). */
  removeFromTv(playerId: string): boolean;
  setSettings(next: Partial<RunSettings>): void;
  /** Players in the run who are connected (all-disconnected pause, §11.3). */
  connectedInRun(): number;
  view(): ViewCtx;
}

interface SyncState {
  json: string;
  at: number;
}

export function createSession(deps: SessionDeps): Session {
  const content = deps.content ?? defaultContent;
  const now = deps.now ?? (() => performance.now());
  const party: FfParty = createParty<PlayerColorId, ClassId>({
    colors: PLAYER_COLOR_IDS,
    maxPlayers: MAX_PARTY,
  });
  const settings: RunSettings = { theme: 'neon-knights', difficulty: 'normal' };
  /** Relay player keys by playerId (from peer events; hello carries the device ID). */
  const keys = new Map<string, string>();
  /** Phones refused as `full`. */
  const full = new Set<string>();
  /** One input source per run slot; it survives a reconnect under a new playerId. */
  const sources = new Map<number, PhoneInputSource>();
  /** Sim command ref → the intent to ack. */
  const pending = new Map<number, { to: string; seq: number }>();
  let nextRef = 1;
  let sim: Sim | null = null;
  let recorder: RunRecorder | null = null;
  let start: RunStart | null = null;
  let summary: RunSummary | null = null;
  let runStartedAt = 0;
  let outdated = false;

  let rev = 0;
  let team: SyncState = { json: '', at: -Infinity };
  const mes = new Map<string, SyncState>();

  const ctx = (): ViewCtx => ({
    party,
    content,
    settings,
    world: sim?.world ?? null,
    summary,
  });

  const sendTeam = (to?: string) => {
    const view = teamView(ctx());
    if (to === undefined) team = { json: JSON.stringify(view), at: now() };
    deps.send({ t: 'team', rev: ++rev, team: view }, to);
  };
  const sendMe = (playerId: string) => {
    const m = party.member(playerId);
    const me = meView(ctx(), m, full.has(playerId));
    const json = JSON.stringify(me);
    mes.set(playerId, { json, at: now() });
    deps.send({ t: 'me', rev: ++rev, me }, playerId);
  };

  const ack = (to: string, seq: number, reason: AckReason | null) =>
    deps.send(
      reason === null ? { t: 'ack', seq, ok: true } : { t: 'ack', seq, ok: false, reason },
      to,
    );

  const slotOf = (playerId: string) => party.member(playerId)?.slot ?? null;

  function startRun(): AckReason | null {
    if (sim) return 'phase';
    const r = party.startRun();
    if (!r.ok) return r.reason;
    if (r.slots.length === 0) {
      party.endRun();
      return 'invalid';
    }
    const seed = deps.seed?.() ?? Math.floor(Math.random() * 0x7fffffff);
    start = {
      seed,
      settings: { ...settings },
      slots: r.slots.map((s) => ({
        slot: s.slot,
        name: s.name,
        color: s.color,
        classId: s.classId,
        connected: s.connected,
      })),
    };
    sources.clear();
    for (const s of r.slots) sources.set(s.slot, new PhoneInputSource(now));
    recorder = new RunRecorder(start, deps.build ?? 'dev');
    sim = createSim(start, { content, sources, observer: recorder });
    summary = null;
    pending.clear();
    runStartedAt = now();
    deps.onRunStart?.(sim, start);
    return null;
  }

  function endRun() {
    party.endRun();
    sim = null;
    recorder = null;
    start = null;
    summary = null;
    pending.clear();
    sources.clear();
    deps.onRunEnd?.();
  }

  const maybeAutoStart = () => {
    if (!sim && party.canAutoStart()) startRun();
  };

  /** Queues a sim command for this intent; the `command` event acks it after the step. */
  const toSim = (from: string, seq: number, cmd: SimCommand) => {
    if (!sim) return ack(from, seq, 'phase');
    const ref = nextRef++;
    pending.set(ref, { to: from, seq });
    sim.command({ ...cmd, ref } as SimCommand);
  };

  function intent(from: string, seq: number, i: Intent) {
    const m = party.member(from);
    if (!m) return ack(from, seq, 'invalid');
    const res = (r: { ok: true } | { ok: false; reason: AckReason }) =>
      ack(from, seq, r.ok ? null : r.reason);
    const slot = m.slot;
    switch (i.k) {
      case 'name':
        return res(party.setName(from, i.name));
      case 'class':
        // The slice ships the Engineer only; the other kits arrive with FF8/FF9.
        if (!content.characters.some((c) => c.id === i.classId)) return ack(from, seq, 'invalid');
        return res(party.setClass(from, i.classId));
      case 'color':
        // Reasons pass through unchanged (FF2-fix-1: they are ack reasons).
        return res(party.setColor(from, i.color));
      case 'ready':
        if (!sim) {
          res(party.setReady(from, i.ready));
          maybeAutoStart();
          return;
        }
        if (slot === null) return ack(from, seq, 'phase');
        return toSim(from, seq, { c: 'ready', slot, ready: i.ready });
      case 'leader': {
        if (!party.isLeader(from)) return ack(from, seq, 'notLeader');
        switch (i.action) {
          case 'start': {
            if (sim) return ack(from, seq, 'phase');
            const can = party.canForceStart(from);
            if (!can.ok) return ack(from, seq, can.reason);
            return ack(from, seq, startRun());
          }
          case 'theme':
          case 'difficulty':
            if (sim) return ack(from, seq, 'phase');
            if (i.action === 'theme') settings.theme = i.theme;
            else settings.difficulty = i.difficulty;
            return ack(from, seq, null);
          case 'remove': {
            const r = party.remove(from, i.playerId);
            if (r.ok) deps.kick(i.playerId);
            return res(r);
          }
          case 'end':
            // FF14 brings the three end options; the slice returns to the lobby.
            if (sim?.world.phase !== 'summary') return ack(from, seq, 'phase');
            endRun();
            return ack(from, seq, null);
          default:
            // resume / newRun: FF14.
            return ack(from, seq, 'invalid');
        }
      }
      case 'build':
        if (slot === null) return ack(from, seq, 'phase');
        return toSim(
          from,
          seq,
          i.action === 'select'
            ? { c: 'build', slot, action: 'select', structure: i.structure }
            : { c: 'build', slot, action: i.action },
        );
      case 'buy':
        if (slot === null) return ack(from, seq, 'phase');
        return toSim(from, seq, { c: 'buy', slot, item: i.item });
      case 'request':
        if (slot === null) return ack(from, seq, 'phase');
        return toSim(from, seq, { c: 'request', slot, item: i.item, on: i.on });
      case 'card':
        if (slot === null) return ack(from, seq, 'phase');
        return toSim(from, seq, { c: 'card', slot, card: i.card });
      case 'give':
        if (slot === null) return ack(from, seq, 'phase');
        return toSim(from, seq, { c: 'give', slot });
      case 'claim':
        return ack(from, seq, 'invalid');
    }
  }

  function hello(from: string, proto: number, deviceId: string) {
    if (proto !== PROTOCOL_VERSION) {
      if (proto > PROTOCOL_VERSION) outdated = true;
      deps.send({ t: 'outdated', proto: PROTOCOL_VERSION }, from);
      if (proto < PROTOCOL_VERSION) return;
    }
    const r = party.connect({ playerId: from, key: keys.get(from) ?? null, deviceId });
    if (r.kind === 'full') full.add(from);
    else {
      full.delete(from);
      const slot = r.member.slot;
      if (sim && slot !== null) {
        const p = sim.world.players.find((x) => x.slot === slot);
        if (p && !p.connected) sim.command({ c: 'presence', slot, connected: true });
      }
    }
    // Full snapshots on every hello (§15.6).
    sendTeam(from);
    sendMe(from);
  }

  return {
    party,
    content,
    get sim() {
      return sim;
    },
    get recorder() {
      return recorder;
    },
    get start() {
      return start;
    },
    settings,
    get summary() {
      return summary;
    },
    get outdated() {
      return outdated;
    },

    handlePeer({ event, playerId, playerKey }) {
      if (event !== 'left') {
        keys.set(playerId, playerKey);
        return;
      }
      full.delete(playerId);
      mes.delete(playerId);
      const m = party.disconnect(playerId);
      if (sim && m && m.slot !== null)
        sim.command({ c: 'presence', slot: m.slot, connected: false });
    },

    handleMessage(from, data) {
      if (!isControllerMsg(data)) return;
      if (Array.isArray(data)) {
        const slot = slotOf(from);
        if (slot !== null) sources.get(slot)?.push(data);
        return;
      }
      if (data.t === 'hello') return hello(from, data.proto, data.deviceId);
      intent(from, data.seq, data.intent);
    },

    afterStep() {
      const w: World | undefined = sim?.world;
      if (!w) return;
      for (const e of w.events) {
        if (e.e === 'command') {
          const p = pending.get(e.ref);
          if (!p) continue;
          pending.delete(e.ref);
          ack(p.to, p.seq, e.ok ? null : (e.reason ?? 'invalid'));
        } else if (e.e === 'phase') {
          if (e.phase === 'build') party.setStage('build');
          else if (e.phase !== 'countdown') party.setStage('combat');
          if (e.phase === 'victory' || e.phase === 'defeat')
            summary = buildSummary(w, party, e.phase, now() - runStartedAt);
        }
      }
    },

    flush() {
      const t = now();
      if (t - team.at >= TEAM_MIN_MS) {
        const json = JSON.stringify(teamView(ctx()));
        if (json !== team.json) sendTeam();
      }
      const phones = [...party.members.filter((m) => m.connected).map((m) => m.playerId), ...full];
      for (const id of phones) {
        const s = mes.get(id);
        if (s && t - s.at < ME_MIN_MS) continue;
        const json = JSON.stringify(meView(ctx(), party.member(id), full.has(id)));
        if (!s || json !== s.json) sendMe(id);
      }
    },

    startRun,
    endRun,
    command(cmd) {
      sim?.command(cmd);
    },
    removeFromTv(playerId) {
      const r = party.remove(null, playerId);
      if (r.ok) deps.kick(playerId);
      return r.ok;
    },
    setSettings(next) {
      Object.assign(settings, next);
    },
    connectedInRun() {
      return party.members.filter((m) => m.slot !== null && m.connected).length;
    },
    view: ctx,
  };
}
