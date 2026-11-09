// The match state machine (SPEC §6.1–§6.5, §8): lobby → rules → (pass → announce → scatter → shoot
// → upload → review → results)×N → matchEnd → rematch/lobby. Pure and headless: events in, effects
// out; timers are effects and the clock is injected (BUILD_PLAN SC2). Disconnects, late rejoin by
// player key, Leave/Remove and the host-refresh replay follow SPEC §6.3 / §6.3.1 (BUILD_PLAN SC6).
import type { PhoneMsg, Screen } from '../../shared/messages';
import { MAX_SEATS } from '../../shared/messages';
import { nextSeatIndex, type SeatId } from '../../shared/seats';
import { MAX_SHOTS, RULES_CARDS, SCATTER_MS, SHOOT_MS, UPLOAD_GRACE_MS, scaled } from './config';
import { resolveLeader } from './leader';
import { restore, serialize } from './persist';
import { buildQueue, takeNext } from './queue';
import {
  active,
  addPlayer,
  ensurePhone,
  findPlayer,
  mirror,
  phoneSeats,
  removePlayer,
  resetForMatch,
  type Phone,
  type Phones,
} from './roster';
import {
  keepArrived,
  newRound,
  photoUrls,
  recordPhoto,
  recordShootDone,
  recordShot,
  uploadComplete,
} from './round';
import { applyResult, scoreRound } from './scoring';
import { canSkipReview, canStart, photographer, screenFor, tvView, type ViewCtx } from './screens';
import { applyTag, applyUntag, dropTagsOf } from './tags';
import type {
  Effect,
  HostControl,
  MatchEvent,
  MatchState,
  PersistedMatch,
  Phase,
  TimerId,
  TvView,
} from './types';

export interface MatchOptions {
  /** Uniform [0, 1): turn-order shuffles (e.g. game-kit `rngStream(seed, 'queue').next`). */
  rng: () => number;
  /** Monotonic ms (`performance.now()` in the host): countdowns on timed screens. */
  now: () => number;
  /** Host-refresh snapshot (SPEC §6.3): a round in progress is replayed. */
  restored?: PersistedMatch;
}

export interface Match {
  /** Applies one event; returns what the host wiring must do (send screens, timers, persist…). */
  dispatch(event: MatchEvent): Effect[];
  /** Screens and the snapshot not yet sent (after creating or restoring). */
  flush(): Effect[];
  readonly state: MatchState;
  tvView(): TvView;
  screenFor(phoneId: string): Screen;
  /** Every phone the host has heard from, seats or not. */
  phoneIds(): string[];
}

export function emptyState(): MatchState {
  return {
    phase: 'lobby',
    code: null,
    players: [],
    leader: null,
    queue: [],
    turn: 0,
    turns: 0,
    round: null,
    lastResult: null,
    rulesCard: 0,
    rulesSeen: false,
    nextR: 1,
    nextJoin: 0,
    matchNo: 0,
  };
}

/** Phases whose round hasn't scored: the photographer leaving ends it with no score. */
const OPEN_ROUND: readonly Phase[] = ['pass', 'announce', 'scatter', 'shoot', 'upload', 'review'];
/** Before the shoot, a photographer whose phone drops loses the round to the queue end (SPEC §6.3). */
const CANCEL_ON_DROP: readonly Phase[] = ['pass', 'announce', 'scatter'];

export function createMatch(opts: MatchOptions): Match {
  const { rng, now } = opts;
  const s: MatchState = opts.restored ? restore(opts.restored) : emptyState();
  const phones: Phones = new Map();
  let timer: { id: TimerId; deadline: number } | null = null;
  /** Where the rules overview leads: the first match, or back to the lobby (How to play). */
  let rulesThen: 'play' | 'lobby' = 'play';
  const sent = new Map<string, string>();
  let persisted = '';
  let out: Effect[] = [];

  const ctx: ViewCtx = {
    state: s,
    phones,
    endsInMs: () => (timer ? Math.max(0, Math.round(timer.deadline - now())) : 0),
  };

  // ---- timers and photos ----

  function startTimer(id: TimerId, ms: number): void {
    stopTimer();
    const t = scaled(ms);
    timer = { id, deadline: now() + t };
    out.push({ type: 'startTimer', timer: id, ms: t });
  }

  function stopTimer(): void {
    if (timer) out.push({ type: 'clearTimer', timer: timer.id });
    timer = null;
  }

  function release(urls: string[]): void {
    if (urls.length > 0) out.push({ type: 'releasePhotos', urls });
  }

  function dropRound(): void {
    release(photoUrls(s.round));
    s.round = null;
  }

  // ---- phase transitions ----

  function toLobby(): void {
    stopTimer();
    dropRound();
    resetForMatch(s);
    s.queue = [];
    s.turn = 0;
    s.turns = 0;
    s.lastResult = null;
    s.phase = 'lobby';
  }

  function startRules(then: 'play' | 'lobby'): void {
    rulesThen = then;
    s.rulesCard = 0;
    s.phase = 'rules';
    if (then === 'play') s.rulesSeen = true;
  }

  function finishRules(): void {
    if (rulesThen === 'play') beginMatch();
    else s.phase = 'lobby';
  }

  /** Start and Rematch: fresh scores, a new shuffle (SPEC §6.1). */
  function beginMatch(): void {
    stopTimer();
    dropRound();
    resetForMatch(s);
    s.matchNo++;
    s.queue = buildQueue(s.players, rng);
    s.turns = s.queue.length;
    s.turn = 0;
    s.lastResult = null;
    nextTurn();
  }

  function nextTurn(): void {
    stopTimer();
    dropRound();
    const next = takeNext(s.queue, s.players);
    s.queue = next.queue;
    const ph = next.photographer === null ? undefined : findPlayer(s, next.photographer);
    if (!ph) {
      s.phase = 'matchEnd';
      return;
    }
    s.turn++;
    s.round = newRound(s.nextR++, ph.id);
    // Pass screen only when the photographer shares a phone (SPEC §6.3.1).
    s.phase = phoneSeats(s, ph.phoneId).length >= 2 ? 'pass' : 'announce';
  }

  function endShoot(): void {
    stopTimer();
    s.phase = 'upload';
    if (uploadComplete(s.round!)) finishUpload();
    else startTimer('upload', UPLOAD_GRACE_MS);
  }

  function finishUpload(): void {
    stopTimer();
    const round = s.round!;
    keepArrived(round);
    if (round.photos.length === 0) {
      // Nothing arrived: the round scores nothing (SPEC §6.2.4).
      s.lastResult = scoreRound(round.r, round.photographer, []);
      s.phase = 'results';
    } else {
      s.phase = 'review';
    }
  }

  function finishReview(): void {
    const round = s.round!;
    s.lastResult = scoreRound(round.r, round.photographer, round.tags);
    applyResult(s.players, s.lastResult);
    s.phase = 'results';
  }

  /** Photographer gone before the shoot: no score, back of the queue, next turn (SPEC §6.3). */
  function cancelRound(): void {
    const ph = s.round!.photographer;
    s.queue = [...s.queue.filter((q) => q !== ph), ph];
    s.turn--; // the turn wasn't taken; nextTurn counts the next one
    nextTurn();
  }

  /**
   * Late rejoin (SPEC §6.3, §6.3.1): the active seat holding `key` on another phone moves to `phone`
   * as its seat `seat`, keeping its id (so queue, tags and scores still point at it). The old phone,
   * once seatless, is forgotten; its camera carries over so the seat keeps its turn.
   */
  function reclaimSeat(phone: Phone, key: string, seat: number): boolean {
    if (!key) return false;
    const p = active(s).find((q) => q.playerKey === key && q.phoneId !== phone.id);
    if (!p || phoneSeats(s, phone.id).some((q) => q.seat === seat)) return false;
    const old = phones.get(p.phoneId);
    p.phoneId = phone.id;
    p.seat = seat;
    if (old) {
      if (phone.camera === 'unknown') phone.camera = old.camera;
      phone.ready ||= old.ready;
      if (phoneSeats(s, old.id).length === 0) {
        // Still leader only if nobody else was connected to hand off to (no snap-back otherwise).
        if (s.leader === old.id) s.leader = phone.id;
        phones.delete(old.id);
        sent.delete(old.id);
      }
    }
    mirror(s, phone);
    return true;
  }

  /** Leave rules (SPEC §6.3) for one seat. */
  function removeSeat(id: SeatId): void {
    const p = removePlayer(s, id);
    if (!p) return;
    s.queue = s.queue.filter((q) => q !== id);
    if (!s.round) return;
    dropTagsOf(s.round, id);
    if (s.round.photographer === id && OPEN_ROUND.includes(s.phase)) nextTurn();
  }

  // ---- inputs ----

  function control(c: HostControl): void {
    switch (c.action) {
      case 'start':
        if (s.phase !== 'lobby' || !canStart(s)) return;
        if (s.rulesSeen) beginMatch();
        else startRules('play');
        return;
      case 'howToPlay':
        if (s.phase === 'lobby') startRules('lobby');
        return;
      case 'next':
        if (s.phase === 'rules') {
          if (s.rulesCard + 1 >= RULES_CARDS) finishRules();
          else s.rulesCard++;
        } else if (s.phase === 'results') {
          nextTurn();
        }
        return;
      case 'skip':
        if (s.phase === 'rules') finishRules();
        return;
      case 'skipReview':
        if (canSkipReview(s)) finishReview();
        return;
      case 'rematch':
        if (s.phase === 'matchEnd') beginMatch();
        return;
      case 'lobby':
        if (s.phase === 'matchEnd') toLobby();
        return;
      case 'remove': {
        // Same as Leave, plus a relay kick once the phone has no seats left (Sunny Side C3).
        const p = findPlayer(s, c.playerId);
        if (!p) return;
        removeSeat(p.id);
        if (phoneSeats(s, p.phoneId).length === 0 && phones.has(p.phoneId)) {
          out.push({ type: 'kick', to: p.phoneId });
          phones.delete(p.phoneId);
          sent.delete(p.phoneId);
        }
        return;
      }
    }
  }

  function onMsg(from: string, msg: PhoneMsg): void {
    const phone = ensurePhone(phones, from);
    const seats = phoneSeats(s, from);
    const ph = photographer(s);
    const fromPhotographer = !!ph && ph.phoneId === from && !!s.round;
    const round = s.round;
    switch (msg.t) {
      case 'hello':
        // Seats already here stay; the rest are reclaimed by key (late rejoin) or added.
        for (const seat of msg.seats) {
          if (phoneSeats(s, from).some((p) => p.seat === seat.seat)) continue;
          if (!reclaimSeat(phone, seat.seatKey, seat.seat)) {
            addPlayer(s, phone, seat.seat, seat.name, seat.seatKey);
          }
        }
        return;
      case 'profile': {
        const p = seats.find((q) => q.seat === msg.seat);
        if (p) {
          if (s.phase === 'lobby') p.name = msg.name.trim();
        } else if (msg.seat === 0) {
          addPlayer(s, phone, 0, msg.name, phone.playerKey);
        }
        return;
      }
      case 'addSeat': {
        if (s.phase !== 'lobby') return;
        const seat = nextSeatIndex(s.players, from);
        if (seat < MAX_SEATS) addPlayer(s, phone, seat, msg.name, msg.seatKey);
        return;
      }
      case 'removeSeat': {
        const p = seats.find((q) => q.seat === msg.seat);
        if (p) removeSeat(p.id);
        return;
      }
      case 'seatConfirm':
        if (s.phase === 'pass' && fromPhotographer && msg.seat === ph.seat) s.phase = 'announce';
        return;
      case 'camera':
        phone.camera = msg.ok ? 'ok' : 'denied';
        mirror(s, phone);
        return;
      case 'ready':
        if (s.phase !== 'lobby') return;
        phone.ready = msg.ready;
        mirror(s, phone);
        return;
      case 'leader':
        if (s.leader !== from) return;
        // The leader leaves its own seats with Leave / Remove a player instead (SPEC §6.5).
        if (msg.action === 'remove' && findPlayer(s, msg.playerId)?.phoneId === from) return;
        control(msg.action === 'remove' ? msg : { action: msg.action });
        return;
      case 'shootReady':
        if (s.phase === 'announce' && fromPhotographer) {
          s.phase = 'scatter';
          startTimer('scatter', SCATTER_MS);
        }
        return;
      case 'shot':
        if (!fromPhotographer || msg.r !== round!.r) return;
        if (s.phase !== 'shoot' && s.phase !== 'upload') return;
        recordShot(round!, msg.photo, msg.aspect);
        if (s.phase === 'shoot' && round!.shots >= MAX_SHOTS) endShoot();
        return;
      case 'shootDone':
        if (!fromPhotographer || msg.r !== round!.r) return;
        if (s.phase !== 'shoot' && s.phase !== 'upload') return;
        recordShootDone(round!, msg.count);
        if (s.phase === 'shoot') endShoot();
        else if (uploadComplete(round!)) finishUpload();
        return;
      case 'view':
        if (s.phase === 'review' && fromPhotographer) {
          if (round!.photos.some((p) => p.index === msg.photo)) round!.view = msg.photo;
        }
        return;
      case 'tag':
        if (s.phase === 'review' && fromPhotographer) applyTag(round!, s.players, msg);
        return;
      case 'untag':
        if (s.phase === 'review' && fromPhotographer) applyUntag(round!, msg.photo, msg.tagId);
        return;
      case 'finishReview':
        if (s.phase === 'review' && fromPhotographer) finishReview();
        return;
      case 'leave':
        for (const p of seats) removeSeat(p.id);
        phone.left = true;
        phone.ready = false;
        return;
      case 'chunk': // the blob receiver's (SC5 wiring)
      case 'emoji': // SC10
        return;
    }
  }

  function onTimer(id: TimerId): void {
    if (!timer || timer.id !== id) return; // stale: cleared or replaced
    timer = null;
    if (id === 'scatter' && s.phase === 'scatter') {
      s.phase = 'shoot';
      startTimer('shoot', SHOOT_MS);
    } else if (id === 'shoot' && s.phase === 'shoot') {
      endShoot();
    } else if (id === 'upload' && s.phase === 'upload') {
      finishUpload();
    }
  }

  function onPhoto(r: number, photo: number, url: string): void {
    const round = s.round;
    const open = s.phase === 'shoot' || s.phase === 'upload';
    if (!round || round.r !== r || !open || !recordPhoto(round, photo, url)) {
      release([url]);
      return;
    }
    if (s.phase === 'upload' && uploadComplete(round)) finishUpload();
  }

  function apply(e: MatchEvent): void {
    switch (e.type) {
      case 'msg':
        onMsg(e.from, e.msg);
        break;
      case 'peer': {
        const phone = ensurePhone(phones, e.playerId);
        phone.connected = e.event !== 'left';
        if (e.playerKey) phone.playerKey = e.playerKey;
        // A new relay id with a known key: the tab was killed or the relay window ran out.
        if (phone.connected && phoneSeats(s, phone.id).length === 0) {
          reclaimSeat(phone, phone.playerKey, 0);
        }
        mirror(s, phone);
        sent.delete(e.playerId); // a (re)connected phone gets its screen again
        break;
      }
      case 'timer':
        onTimer(e.timer);
        break;
      case 'control':
        control(e.control);
        break;
      case 'photo':
        onPhoto(e.r, e.photo, e.url);
        break;
      case 'room':
        s.code = e.code;
        break;
    }
  }

  /** The round's photographer is connected (null: no open round). */
  function photographerLive(): { r: number; live: boolean } | null {
    const ph = photographer(s);
    return s.round && ph && !ph.left ? { r: s.round.r, live: ph.connected } : null;
  }

  /**
   * Photographer drop / return within one round (SPEC §6.3): gone before the shoot cancels the round;
   * back during upload restarts the grace so unacked photos can still come in (SPEC §7.4 Retry).
   */
  function photographerChanged(before: { r: number; live: boolean } | null): void {
    const after = photographerLive();
    if (!before || !after || before.r !== after.r || before.live === after.live) return;
    if (!after.live && CANCEL_ON_DROP.includes(s.phase)) cancelRound();
    else if (after.live && s.phase === 'upload') startTimer('upload', UPLOAD_GRACE_MS);
  }

  /** Screens that changed (countdowns aside) for connected phones, then the snapshot if it changed. */
  function sync(): void {
    s.leader = resolveLeader(s.leader, s.players);
    for (const phone of phones.values()) {
      if (!phone.connected) continue;
      const screen = screenFor(ctx, phone.id);
      const key = JSON.stringify({ ...screen, endsInMs: 0 });
      if (sent.get(phone.id) === key) continue;
      sent.set(phone.id, key);
      out.push({ type: 'screen', to: phone.id, screen });
    }
    const data = serialize(s);
    const json = JSON.stringify(data);
    if (json !== persisted) {
      persisted = json;
      out.push({ type: 'persist', data });
    }
  }

  function take(): Effect[] {
    sync();
    const effects = out;
    out = [];
    return effects;
  }

  if (opts.restored) {
    for (const p of s.players) {
      if (p.left) continue;
      const phone = ensurePhone(phones, p.phoneId);
      Object.assign(phone, { connected: p.connected, camera: p.camera, ready: p.ready });
      if (p.seat === 0) phone.playerKey = p.playerKey;
    }
    // A replayed round (or the turn after restored results) starts now.
    if (s.phase === 'results') nextTurn();
  }

  return {
    dispatch(event) {
      const before = photographerLive();
      apply(event);
      photographerChanged(before);
      return take();
    },
    flush: take,
    get state() {
      return s;
    },
    tvView: () => tvView(ctx),
    screenFor: (phoneId) => screenFor(ctx, phoneId),
    phoneIds: () => [...phones.keys()],
  };
}
