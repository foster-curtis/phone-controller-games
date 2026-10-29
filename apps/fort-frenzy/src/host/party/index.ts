// Lobby and presence: roster, colors, names, leader and handoff, ready, lobby removal, identity
// matching and late joins (SPEC §11.1–§11.3, §15.6). Extraction-ready (§15.1): no content, sim,
// protocol or net-client imports; colors and class ids are generics, and refusal reasons are a subset
// of the protocol's ack reasons. The host maps relay events and intents onto these calls.
// Frozen at FF2 (BUILD_PLAN §3): additive changes only.

/**
 * Where the party is: the lobby, a run's build phase (late joins accepted), or any other run phase
 * (countdown, combat, victory, defeat, summary: late joiners wait).
 */
export type PartyStage = 'lobby' | 'build' | 'combat';

export interface Member<Color extends string = string, Cls extends string = string> {
  /** Relay player id of the current connection. */
  playerId: string;
  /** Relay player key (rejoin after the token window). */
  key: string | null;
  /** The phone's device ID (resume into a new room, §15.8). */
  deviceId: string | null;
  /** '' until the player enters one. */
  name: string;
  color: Color;
  classId: Cls | null;
  /** Lobby ready. */
  ready: boolean;
  connected: boolean;
  /** Run slot, held for the whole run; null in the lobby and for late joiners not yet in. */
  slot: number | null;
}

/** One player slot at run start or on a late join (fits the sim's `RunSlot`). */
export interface PartySlot<Color extends string = string, Cls extends string = string> {
  slot: number;
  playerId: string;
  name: string;
  color: Color;
  classId: Cls;
  connected: boolean;
}

/** Refusals, named as the intent ack reasons (`AckReason`). */
export type PartyRefusal = 'phase' | 'invalid' | 'notLeader';
export type PartyResult = { ok: true } | { ok: false; reason: PartyRefusal };

export type ConnectResult<Color extends string, Cls extends string> =
  { kind: 'joined' | 'rejoined'; member: Readonly<Member<Color, Cls>> } | { kind: 'full' };

/** What a member's phone shows, as far as the party knows ('run' = the sim decides). */
export type PartyScreen = 'name' | 'lobby' | 'waiting' | 'run';

export interface PartyOptions<Color extends string> {
  /** Assigned in this order, lowest free first (brand order, §2.3). */
  colors: readonly Color[];
  /** Game cap (6); the next new phone gets `full`. */
  maxPlayers: number;
  /** Ready players needed to start (2). */
  minPlayers?: number;
  /** Name length in characters (10). */
  nameMax?: number;
}

export interface Party<Color extends string, Cls extends string> {
  /** Join order. */
  readonly members: readonly Readonly<Member<Color, Cls>>[];
  readonly leaderId: string | null;
  readonly stage: PartyStage;
  member(playerId: string): Readonly<Member<Color, Cls>> | null;
  isLeader(playerId: string): boolean;
  /** A phone (re)connects: matched by playerId, then key, then device ID; else a new member or `full`. */
  connect(peer: {
    playerId: string;
    key?: string | null;
    deviceId?: string | null;
  }): ConnectResult<Color, Cls>;
  /** Relay `peer left`: the member stays (dazed in a run, §11.3); leadership may pass on. */
  disconnect(playerId: string): Readonly<Member<Color, Cls>> | null;
  setName(playerId: string, raw: string): PartyResult;
  /** Lobby, or a late joiner before they're in; never mid-run for a slotted player. */
  setClass(playerId: string, classId: Cls): PartyResult;
  /** Lobby only; needs a name and a class. */
  setReady(playerId: string, ready: boolean): PartyResult;
  /** Lobby only. `by` is the remover's playerId (must lead) or null for the TV. */
  remove(
    by: string | null,
    target: string,
  ): { ok: true; removed: Readonly<Member<Color, Cls>> } | { ok: false; reason: PartyRefusal };
  /** Every connected player is ready, and at least `minPlayers` of them. */
  canAutoStart(): boolean;
  /** The leader may force-start once `minPlayers` connected players are ready. */
  canForceStart(playerId: string): PartyResult;
  /** Slots, in join order, for every member with a name and a class; the stage becomes `combat`. */
  startRun(): { ok: true; slots: PartySlot<Color, Cls>[] } | { ok: false; reason: PartyRefusal };
  /** Follows the run's phases (`build` opens late joins). */
  setStage(stage: 'build' | 'combat'): void;
  /** Members in a run without a slot yet. */
  waiting(): Readonly<Member<Color, Cls>>[];
  /** Build phase only: a member with a name and a class takes the next unused slot. */
  joinLate(
    playerId: string,
  ): { ok: true; slot: PartySlot<Color, Cls> } | { ok: false; reason: PartyRefusal };
  screen(playerId: string): PartyScreen | null;
  /** Back to the lobby: slots and ready cleared; names, colors and classes kept. */
  endRun(): void;
}

/** Trims, collapses whitespace, drops control characters and keeps the first `max` characters. */
export function cleanName(raw: string, max = 10): string {
  const s = String(raw)
    .replace(/\s+/gu, ' ')
    .replace(/\p{Cc}/gu, '')
    .trim();
  return Array.from(s).slice(0, max).join('').trim();
}

const ok: PartyResult = { ok: true };
const no = (reason: PartyRefusal) => ({ ok: false as const, reason });

export function createParty<Color extends string, Cls extends string>(
  opts: PartyOptions<Color>,
): Party<Color, Cls> {
  const { colors, maxPlayers, minPlayers = 2, nameMax = 10 } = opts;
  if (colors.length < maxPlayers) throw new Error('createParty: fewer colors than players');
  type M = Member<Color, Cls>;
  const members: M[] = [];
  let leaderId: string | null = null;
  let stage: PartyStage = 'lobby';

  const find = (playerId: string) => members.find((m) => m.playerId === playerId) ?? null;
  const freeColor = () => colors.find((c) => !members.some((m) => m.color === c))!;
  const slotOf = (m: M): PartySlot<Color, Cls> => ({
    slot: m.slot!,
    playerId: m.playerId,
    name: m.name,
    color: m.color,
    classId: m.classId!,
    connected: m.connected,
  });

  /** First joiner leads; a disconnected or removed leader hands off to the earliest connected. */
  function updateLeader() {
    const cur = leaderId === null ? null : find(leaderId);
    if (cur?.connected) return;
    const next = members.find((m) => m.connected);
    if (next) leaderId = next.playerId;
    else if (!cur) leaderId = members[0]?.playerId ?? null;
  }

  const party: Party<Color, Cls> = {
    members,
    get leaderId() {
      return leaderId;
    },
    get stage() {
      return stage;
    },
    member: find,
    isLeader: (playerId) => leaderId === playerId,

    connect({ playerId, key = null, deviceId = null }) {
      let m = find(playerId) ?? (key ? members.find((x) => x.key === key) : undefined);
      let newRoom = false;
      if (!m && deviceId) {
        m = members.find((x) => x.deviceId === deviceId);
        newRoom = m !== undefined;
      }
      if (m) {
        // Known ids are kept; a device-ID match is a new room, so it takes the new relay key.
        if (leaderId === m.playerId) leaderId = playerId;
        m.playerId = playerId;
        m.key = newRoom && key ? key : (m.key ?? key);
        m.deviceId = m.deviceId ?? deviceId;
        m.connected = true;
        updateLeader();
        return { kind: 'rejoined', member: m };
      }
      if (members.length >= maxPlayers) return { kind: 'full' };
      const fresh: M = {
        playerId,
        key,
        deviceId,
        name: '',
        color: freeColor(),
        classId: null,
        ready: false,
        connected: true,
        slot: null,
      };
      members.push(fresh);
      updateLeader();
      return { kind: 'joined', member: fresh };
    },

    disconnect(playerId) {
      const m = find(playerId);
      if (!m) return null;
      m.connected = false;
      updateLeader();
      return m;
    },

    setName(playerId, raw) {
      const m = find(playerId);
      if (!m) return no('invalid');
      if (m.slot !== null) return no('phase');
      const name = cleanName(raw, nameMax);
      if (!name) return no('invalid');
      m.name = name;
      return ok;
    },

    setClass(playerId, classId) {
      const m = find(playerId);
      if (!m) return no('invalid');
      if (m.slot !== null) return no('phase');
      m.classId = classId;
      return ok;
    },

    setReady(playerId, ready) {
      const m = find(playerId);
      if (!m) return no('invalid');
      if (stage !== 'lobby') return no('phase');
      if (ready && (!m.name || m.classId === null)) return no('invalid');
      m.ready = ready;
      return ok;
    },

    remove(by, target) {
      if (stage !== 'lobby') return no('phase');
      if (by !== null && by !== leaderId) return no('notLeader');
      const i = members.findIndex((m) => m.playerId === target);
      if (i < 0 || target === by) return no('invalid');
      const [removed] = members.splice(i, 1);
      updateLeader();
      return { ok: true, removed: removed! };
    },

    canAutoStart() {
      if (stage !== 'lobby') return false;
      const on = members.filter((m) => m.connected);
      return on.length >= minPlayers && on.every((m) => m.ready);
    },

    canForceStart(playerId) {
      if (stage !== 'lobby') return no('phase');
      if (playerId !== leaderId) return no('notLeader');
      const ready = members.filter((m) => m.connected && m.ready).length;
      return ready >= minPlayers ? ok : no('invalid');
    },

    startRun() {
      if (stage !== 'lobby') return no('phase');
      const slots: PartySlot<Color, Cls>[] = [];
      for (const m of members) {
        if (!m.name || m.classId === null) continue;
        m.slot = slots.length;
        slots.push(slotOf(m));
      }
      stage = 'combat';
      return { ok: true, slots };
    },

    setStage(next) {
      if (stage !== 'lobby') stage = next;
    },

    waiting: () => (stage === 'lobby' ? [] : members.filter((m) => m.slot === null)),

    joinLate(playerId) {
      const m = find(playerId);
      if (!m) return no('invalid');
      if (stage !== 'build') return no('phase');
      if (m.slot !== null || !m.name || m.classId === null) return no('invalid');
      m.slot = members.reduce((hi, x) => Math.max(hi, x.slot ?? -1), -1) + 1;
      return { ok: true, slot: slotOf(m) };
    },

    screen(playerId) {
      const m = find(playerId);
      if (!m) return null;
      if (m.slot !== null) return 'run';
      if (stage === 'combat') return 'waiting';
      return m.name ? 'lobby' : 'name';
    },

    endRun() {
      stage = 'lobby';
      for (const m of members) {
        m.slot = null;
        m.ready = false;
      }
    },
  };
  return party;
}
