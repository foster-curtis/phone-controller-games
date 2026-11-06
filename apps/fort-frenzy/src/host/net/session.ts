// The host's side of the phones (SPEC §11, §15.6): hello and versions, the party bridge (lobby,
// presence, identity), phone input with receive-time staleness, intents → party calls or sim commands
// with `ack` reasons, and the throttled `team` (≤ 5 Hz, broadcast) and `me` (≤ 10 Hz per phone) state
// sync, sent on change and in full on every hello. Owns the run's sim while one is going, and its
// lifecycle (FF14): late joins at the build phase, the end-of-run options, and the resume snapshot
// (§11.5, §15.8: saved at each build start and on build-phase changes, offered after a reload,
// restored into the same or a new room). No Phaser, no relay client: the runtime passes `send` and
// `kick`.
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
import {
  createSim,
  resumeStart,
  RunRecorder,
  takeSnapshot,
  type RunSnapshot,
  type Sim,
} from '../sim';
import type { RunSettings, RunStart, SimCommand, World } from '../sim/types';
import { PhoneInputSource } from './input';
import { SAVE_DEBOUNCE_MS, type SnapshotStore } from './resume';
import { buildSummary, meView, teamView, type FfParty, type ViewCtx } from './views';

/** Game cap (§11.1); the relay room holds 8 for rejoin headroom (§15.6). */
export const MAX_PARTY = 6;
export const TEAM_MIN_MS = 200;
export const ME_MIN_MS = 100;

export interface SessionDeps {
  send(msg: HostMsg, to?: string): void;
  kick(playerId: string): void;
  content?: Content;
  /** Monotonic ms (input staleness, send throttling, run duration). */
  now?: () => number;
  /** Wall-clock ms for the snapshot's `savedAt` and its 12 h expiry (default `Date.now`). */
  wallClock?: () => number;
  /** Seed for the next run (default: random). */
  seed?: () => number;
  /** Commit hash recorded in replays and snapshots. */
  build?: string;
  /** Resume snapshot storage (§15.8); none = no snapshots. */
  store?: SnapshotStore;
  /** A run started or resumed (the runtime resets its loop and the World scene). */
  onRunStart?(sim: Sim, start: RunStart): void;
  /** Back in the lobby. */
  onRunEnd?(): void;
  /** The leader chose "Return to home" (§4): the runtime closes the room. */
  onHome?(): void;
}

/** A relay room handed to the host (create or reclaim). */
export interface RoomInfo {
  reclaimed: boolean;
  roster: readonly { playerId: string; playerKey: string; connected: boolean }[];
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
  /** A saved run waiting for Resume or New run (§11.5), or null. */
  readonly restoring: { wave: number; savedAt: number } | null;
  handlePeer(change: {
    event: 'joined' | 'left' | 'rejoined';
    playerId: string;
    playerKey: string;
  }): void;
  /** The relay gave the TV a room: a reclaim's roster tells the host the phones' keys. */
  handleRoom(room: RoomInfo): void;
  handleMessage(from: string, data: unknown): void;
  /** After every sim step: acks for this step's commands, party stage, the summary. */
  afterStep(): void;
  /** Sends `team` / `me` snapshots that changed, within the rate limits; saves the snapshot. */
  flush(): void;
  /** Starts a run from the party (leader force-start or everyone ready). */
  startRun(): AckReason | null;
  /** Back to the lobby (names, colors and classes kept). */
  endRun(): void;
  /** Restores the saved run: the build phase of its wave (§11.5). */
  resume(): AckReason | null;
  /** Drops the saved run: the lobby, with the phones that are here. */
  newRun(): AckReason | null;
  /** Writes the snapshot now if the run is in a build phase (`pagehide`, §15.8). */
  saveNow(): void;
  /** The snapshot the host would save now (build phase only), or null. */
  snapshot(): RunSnapshot | null;
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
  const wall = deps.wallClock ?? (() => Date.now());
  const store = deps.store ?? null;
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

  // The resume snapshot (§15.8).
  let saved: RunSnapshot | null = store?.load(wall()) ?? null;
  let lastSave = { json: '', at: -Infinity, phase: '' as World['phase'] | '' };

  let rev = 0;
  let team: SyncState = { json: '', at: -Infinity };
  const mes = new Map<string, SyncState>();

  const ctx = (): ViewCtx => ({
    party,
    content,
    settings,
    world: sim?.world ?? null,
    summary,
    restoring: saved && !sim ? { wave: saved.wave, savedAt: saved.savedAt } : null,
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

  // A saved run: its slots wait for their phones (key, then device ID, or a claim) until Resume.
  if (saved) {
    Object.assign(settings, {
      theme: saved.settings.theme,
      difficulty: saved.settings.difficulty,
    });
    party.restore(
      saved.slots.map((s) => ({
        slot: s.slot,
        key: s.playerKey || null,
        deviceId: s.deviceId || null,
        name: s.name,
        color: s.color,
        classId: s.classId,
      })),
      saved.leaderKey,
      { claimable: true },
    );
  }

  /** The sim, its recorder and the phones' input sources for a run start (new or resumed). */
  function begin(next: RunStart, elapsedMs: number) {
    start = next;
    sources.clear();
    for (const s of next.slots) sources.set(s.slot, new PhoneInputSource(now));
    // A resume is a new replay segment: its RunStart carries the snapshot (§15.8, §15.9).
    recorder = new RunRecorder(next, deps.build ?? 'dev');
    sim = createSim(next, { content, sources, observer: recorder });
    summary = null;
    pending.clear();
    runStartedAt = now() - elapsedMs;
    lastSave = { json: '', at: -Infinity, phase: '' };
    deps.onRunStart?.(sim, next);
  }

  function startRun(): AckReason | null {
    if (sim || saved) return 'phase';
    const r = party.startRun();
    if (!r.ok) return r.reason;
    if (r.slots.length === 0) {
      party.endRun();
      return 'invalid';
    }
    const seed = deps.seed?.() ?? Math.floor(Math.random() * 0x7fffffff);
    begin(
      {
        seed,
        settings: { ...settings },
        slots: r.slots.map((s) => ({
          slot: s.slot,
          name: s.name,
          color: s.color,
          classId: s.classId,
          connected: s.connected,
        })),
      },
      0,
    );
    return null;
  }

  function resume(): AckReason | null {
    if (sim || !saved) return 'phase';
    const snap = saved;
    saved = null;
    const connected = (slot: number) => party.members.some((m) => m.slot === slot && m.connected);
    begin(resumeStart(snap, connected), snap.runMs ?? 0);
    party.setStage('build');
    return null;
  }

  function newRun(): AckReason | null {
    if (sim || !saved) return 'phase';
    saved = null;
    store?.clear();
    party.endRun();
    // The saved run's absent players go; the phones that are here keep their names and classes.
    for (const m of [...party.members]) if (!m.connected) party.remove(null, m.playerId);
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
    store?.clear();
    deps.onRunEnd?.();
  }

  const maybeAutoStart = () => {
    if (!sim && !saved && party.canAutoStart()) startRun();
  };

  /** The end-of-run options (§4), chosen by the leader's phone on the summary. */
  function endOption(option: 'again' | 'classes' | 'home') {
    if (option === 'home') {
      endRun();
      deps.onHome?.();
      return;
    }
    endRun();
    // Play again: every player keeps their class and goes straight to Ready.
    if (option === 'again') {
      for (const m of party.members) if (m.connected) party.setReady(m.playerId, true);
      maybeAutoStart();
    }
  }

  /** Queues a sim command for this intent; the `command` event acks it after the step. */
  const toSim = (from: string, seq: number, cmd: SimCommand) => {
    if (!sim) return ack(from, seq, 'phase');
    const ref = nextRef++;
    pending.set(ref, { to: from, seq });
    sim.command({ ...cmd, ref } as SimCommand);
  };

  /** A late joiner taps Ready in a build phase (§11.2): the next free slot, at the base. */
  function lateJoin(from: string, seq: number) {
    const r = party.joinLate(from);
    if (!r.ok) return ack(from, seq, r.reason);
    const { slot, name, color, classId } = r.slot;
    const src = new PhoneInputSource(now);
    sources.set(slot, src);
    sim!.setSource(slot, src);
    toSim(from, seq, { c: 'join', slot, name, color, classId });
  }

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
        // Only classes in content (the Warden arrives with FF8).
        if (!content.characters.some((c) => c.id === i.classId)) return ack(from, seq, 'invalid');
        return res(party.setClass(from, i.classId));
      case 'color':
        // Reasons pass through unchanged (FF2-fix-1: they are ack reasons).
        return res(party.setColor(from, i.color));
      case 'ready':
        if (!sim) {
          if (saved) return ack(from, seq, 'phase');
          res(party.setReady(from, i.ready));
          maybeAutoStart();
          return;
        }
        if (slot === null) return i.ready ? lateJoin(from, seq) : ack(from, seq, null);
        return toSim(from, seq, { c: 'ready', slot, ready: i.ready });
      case 'leader': {
        if (!party.isLeader(from)) return ack(from, seq, 'notLeader');
        switch (i.action) {
          case 'start': {
            if (sim || saved) return ack(from, seq, 'phase');
            const can = party.canForceStart(from);
            if (!can.ok) return ack(from, seq, can.reason);
            return ack(from, seq, startRun());
          }
          case 'resume':
            return ack(from, seq, resume());
          case 'newRun':
            return ack(from, seq, newRun());
          case 'theme':
          case 'difficulty':
            if (sim || saved) return ack(from, seq, 'phase');
            if (i.action === 'theme') settings.theme = i.theme;
            else settings.difficulty = i.difficulty;
            return ack(from, seq, null);
          case 'remove': {
            const r = party.remove(from, i.playerId);
            if (r.ok) deps.kick(i.playerId);
            return res(r);
          }
          case 'end':
            if (sim?.world.phase !== 'summary') return ack(from, seq, 'phase');
            ack(from, seq, null);
            return endOption(i.option);
        }
        return ack(from, seq, 'invalid');
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
      case 'claim': {
        // Resume into a new room (§15.8): an unmatched phone takes a free restored slot.
        const r = party.claim(from, i.slot);
        if (!r.ok) return ack(from, seq, r.reason);
        if (sim) sim.command({ c: 'presence', slot: i.slot, connected: true });
        return ack(from, seq, null);
      }
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

  /** The snapshot of the run now, in its build phase (§11.5); null otherwise. */
  function snapshot(): RunSnapshot | null {
    const w = sim?.world;
    if (!w || w.phase !== 'build') return null;
    const leader = party.leaderId === null ? null : party.member(party.leaderId);
    return takeSnapshot(w, content, {
      savedAt: wall(),
      build: deps.build ?? 'dev',
      runMs: Math.max(0, Math.round(now() - runStartedAt)),
      leaderKey: leader?.key ?? null,
      ids: (slot) => {
        const m = party.members.find((x) => x.slot === slot);
        return { playerKey: m?.key ?? '', deviceId: m?.deviceId ?? '' };
      },
    });
  }

  /** At each build start at once, then build-phase changes at most every 250 ms (§15.8). */
  function autosave(force = false) {
    const w = sim?.world;
    if (!store || !w) return;
    if (w.phase === 'victory' || w.phase === 'defeat' || w.phase === 'summary') {
      // The run is over: no resume (§4).
      if (lastSave.phase !== w.phase) store.clear();
      lastSave.phase = w.phase;
      return;
    }
    if (w.phase !== 'build') {
      lastSave.phase = w.phase;
      return;
    }
    const t = now();
    const buildStart = lastSave.phase !== 'build';
    if (!force && !buildStart && t - lastSave.at < SAVE_DEBOUNCE_MS) return;
    const snap = snapshot()!;
    // Compare without the clock, so an unchanged build phase isn't rewritten.
    const json = JSON.stringify({ ...snap, savedAt: 0, runMs: 0 });
    lastSave.at = t;
    lastSave.phase = 'build';
    if (json === lastSave.json && !force) return;
    lastSave.json = json;
    store.save(snap);
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
    get restoring() {
      return ctx().restoring ?? null;
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

    handleRoom(room) {
      // Phones that stayed joined through a TV reload: their keys match the saved slots (§11.5).
      for (const r of room.roster) keys.set(r.playerId, r.playerKey);
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
      autosave();
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
    resume,
    newRun,
    saveNow: () => autosave(true),
    snapshot,
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
