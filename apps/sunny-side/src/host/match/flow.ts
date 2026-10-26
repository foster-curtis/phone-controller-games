// Match state machine (SPEC §6.3, §6.5, §6.7): lobby → countdown → playing → results/matchEnd.
// Clock-free: `tick(dtMs)` is the only source of time.
import {
  isDifficulty,
  isInput,
  isPlayerColorId,
  type Difficulty,
  type RoundBreakdown,
} from '../../shared/messages';
import { RoundTally } from './breakdown';
import type { SimEvent } from '../sim/types';
import {
  COUNTDOWN_MS,
  DEFAULT_DIFFICULTY,
  EMOJI_COOLDOWN_MS,
  KNOCKOUT_POINTS,
  MIN_PLAYERS,
  SURVIVOR_POINTS,
  TIME_EPSILON_MS,
} from './config';
import { EmojiLimiter, isEmojiIndex } from './emoji';
import { resolveLeader } from './leader';
import { loadPersisted, savePersisted, type PersistedMatch } from './persist';
import { Roster, sanitizeName, standings, type PlayerRecord } from './roster';
import { findWinner, knockoutCredit, roundOutcome, targetScoreFor } from './scoring';
import { screenFor, type ScreenContext } from './screens';
import type {
  HostAction,
  Match,
  MatchDeps,
  MatchEvent,
  MatchPhase,
  MatchView,
  PlayerView,
  RelayPeer,
} from './types';

export function createMatch(deps: MatchDeps): Match {
  const { sim } = deps;
  let roster = new Roster();
  const listeners = new Set<(e: MatchEvent) => void>();
  const emoji = new EmojiLimiter(EMOJI_COOLDOWN_MS);

  let phase: MatchPhase = 'lobby';
  let paused = false;
  let round = 0;
  /** Fixed when a match starts; the lobby shows the live value. */
  let matchTarget = targetScoreFor(MIN_PLAYERS);
  let leaderId: string | null = null;
  let difficulty: Difficulty = DEFAULT_DIFFICULTY;
  let countdownMs = 0;
  let survivorId: string | null = null;
  let winnerId: string | null = null;
  /** Breakdown of the last finished round (results / matchEnd); null after restore. */
  let breakdown: RoundBreakdown | null = null;
  const tally = new RoundTally();
  let clockMs = 0;
  /** Sim ids of eggs still on the pan this round (old ids of late rejoiners included). */
  const eggs = new Set<string>();
  /** Last screen JSON sent per player id (sends only on change). */
  const lastSent = new Map<string, string>();
  let lastPersisted = '';

  // ---- helpers ----

  function emit(e: MatchEvent): void {
    for (const cb of [...listeners]) cb(e);
  }

  function setPhase(p: MatchPhase): void {
    phase = p;
    emit({ type: 'phase', phase: p });
  }

  function updateLeader(): void {
    const next = resolveLeader(leaderId, roster.players);
    if (next !== leaderId) {
      leaderId = next;
      emit({ type: 'leader', playerId: next });
    }
  }

  function inRound(): boolean {
    return phase === 'countdown' || phase === 'playing';
  }

  function hasEgg(p: PlayerRecord): boolean {
    return inRound() && eggs.has(p.id);
  }

  /** Lobby Start waits for every connected player but the leader to tap Ready. */
  function canStart(): boolean {
    const eligible = roster.eligible();
    if (eligible.length < MIN_PLAYERS) return false;
    return phase !== 'lobby' || eligible.every((p) => p.ready || p.id === leaderId);
  }

  function targetScore(): number {
    return phase === 'lobby' ? targetScoreFor(roster.eligible().length) : matchTarget;
  }

  /** Stop an egg dead and zero its input (disconnect / self-pause / leave rules, SPEC §6.3). */
  function freezeControl(p: PlayerRecord): void {
    if (!inRound()) return;
    if (eggs.has(p.id)) sim.setFrozen(p.id, true);
    if (eggs.has(p.id) || p.ghost) sim.setInput(p.id, null);
  }

  /** Give control back if the egg should be live right now. */
  function unfreezeIfActive(p: PlayerRecord): void {
    if (phase !== 'playing' || !eggs.has(p.id)) return;
    if (p.connected && !p.left && !p.selfPaused) sim.setFrozen(p.id, false);
  }

  function addScore(p: PlayerRecord, delta: number, reason: 'knockout' | 'survivor'): void {
    p.score += delta;
    emit({ type: 'score', playerId: p.id, delta, reason });
  }

  function screenContext(): ScreenContext {
    return {
      phase,
      paused,
      round,
      targetScore: targetScore(),
      leaderId,
      countdownMs,
      survivorId,
      winnerId,
      breakdown,
      standings: standings(roster.players),
      canStart: canStart(),
      difficulty,
      takenColors: (p) => roster.takenColors(p),
      hasEgg,
    };
  }

  function persisted(): PersistedMatch {
    const keyOf = (id: string | null): string | null =>
      id === null ? null : (roster.current(id)?.playerKey ?? null);
    return {
      v: 1,
      round,
      targetScore: matchTarget,
      leaderKey: keyOf(leaderId),
      winnerKey: phase === 'matchEnd' ? keyOf(winnerId) : null,
      nextJoinIndex: roster.nextJoinIndex,
      difficulty,
      players: roster.players.map((p) => ({
        playerId: p.id,
        playerKey: p.playerKey,
        name: p.name,
        color: p.color,
        score: p.score,
        left: p.left,
        joinIndex: p.joinIndex,
      })),
    };
  }

  /** Push changed screens to every connected phone and persist. Call after every mutation. */
  function sync(): void {
    const ctx = screenContext();
    for (const p of roster.players) {
      if (!p.connected || p.left) continue;
      const screen = screenFor(ctx, p);
      const json = JSON.stringify(screen);
      if (lastSent.get(p.id) === json) continue;
      lastSent.set(p.id, json);
      deps.send({ t: 'screen', screen }, p.id);
    }
    lastPersisted = savePersisted(deps.storage, persisted(), lastPersisted);
  }

  // ---- flow ----

  function startRound(): void {
    round += 1;
    eggs.clear();
    survivorId = null;
    breakdown = null;
    const spawns: { id: string; frozen: boolean }[] = [];
    for (const p of roster.players) {
      p.eliminated = false;
      p.ghost = false;
      p.respawnMs = 0;
      const gets = p.connected && !p.left;
      p.spectating = !gets;
      if (gets) {
        eggs.add(p.id);
        spawns.push({ id: p.id, frozen: true });
      }
    }
    tally.start(roster.players.filter((p) => eggs.has(p.id)));
    sim.startRound(spawns, { difficulty });
    countdownMs = COUNTDOWN_MS;
    setPhase('countdown');
  }

  function beginMatch(): void {
    for (const p of roster.players) {
      p.score = 0;
      p.ready = false;
    }
    round = 0;
    winnerId = null;
    matchTarget = targetScoreFor(roster.eligible().length);
    startRound();
  }

  function dropLeftPlayers(): void {
    for (const p of roster.players.filter((q) => q.left)) roster.remove(p);
    emit({ type: 'roster' });
  }

  function endRoundIfOver(): void {
    if (phase !== 'playing') return;
    const outcome = roundOutcome(roster, eggs);
    if (!outcome.over) return;
    if (outcome.survivor) {
      addScore(outcome.survivor, SURVIVOR_POINTS, 'survivor');
      survivorId = outcome.survivor.id;
      tally.survived(outcome.survivor);
    }
    breakdown = tally.build(round);
    eggs.clear();
    for (const p of roster.players) p.respawnMs = 0;
    const winner = findWinner(roster.players, matchTarget);
    if (winner) {
      winnerId = winner.id;
      setPhase('matchEnd');
    } else {
      setPhase('results');
    }
  }

  function doAction(action: HostAction): void {
    if (paused) return;
    if (typeof action === 'object') {
      if (action.kind === 'difficulty') {
        if (phase === 'lobby' && isDifficulty(action.difficulty)) {
          difficulty = action.difficulty;
          sync();
        }
        return;
      }
      const target = roster.current(action.playerId);
      if (target) removePlayer(target, false);
      return;
    }
    switch (action) {
      case 'start':
        if (phase === 'lobby' && canStart()) beginMatch();
        break;
      case 'next':
        if (phase === 'results' && canStart()) startRound();
        break;
      case 'rematch':
        if (phase === 'matchEnd' && canStart()) {
          dropLeftPlayers();
          beginMatch();
        }
        break;
      case 'lobby':
        if (phase === 'matchEnd') {
          dropLeftPlayers();
          for (const p of roster.players) {
            p.score = 0;
            p.spectating = false;
            p.eliminated = false;
            p.ghost = false;
            p.ready = false;
          }
          round = 0;
          winnerId = null;
          survivorId = null;
          breakdown = null;
          setPhase('lobby');
        }
        break;
    }
    updateLeader();
    sync();
  }

  /**
   * Leave game / host or leader removal (C3 notes): drop the player entirely in any phase. Their
   * score, color and spot are not kept; their egg (and ghost) leave the pan with no points to
   * anyone; a later join with the same key is a brand-new player. `leftScreen`: they chose to
   * leave (their phone shows `left`); a removed phone learns it from the relay kick instead.
   */
  function removePlayer(p: PlayerRecord, leftScreen: boolean): void {
    if (leftScreen && p.connected) {
      const screen = screenFor(screenContext(), { ...p, left: true });
      deps.send({ t: 'screen', screen }, p.id);
    }
    if (inRound()) {
      // Every sim id they own: their egg / ghost, plus a stale egg from before a late rejoin.
      for (const id of roster.idsOf(p)) {
        eggs.delete(id);
        sim.setInput(id, null);
        sim.removeEgg?.(id);
      }
    }
    tally.remove(p);
    if (breakdown) {
      breakdown = { ...breakdown, players: breakdown.players.filter((e) => e.playerId !== p.id) };
    }
    if (survivorId === p.id) survivorId = null;
    if (winnerId === p.id) winnerId = null;
    roster.remove(p);
    lastSent.delete(p.id);
    deps.kick(p.id);
    emit({ type: 'roster' });
    updateLeader();
    endRoundIfOver();
    sync();
  }

  function handleObject(p: PlayerRecord, msg: Record<string, unknown>): void {
    switch (msg.t) {
      case 'profile': {
        if (typeof msg.name !== 'string' || !isPlayerColorId(msg.color)) return;
        // A ready player's name and color are locked until they un-ready.
        if (!p.ready) roster.setProfile(p, msg.name, msg.color);
        emit({ type: 'roster' });
        // Always resync this phone so a rejected color snaps back.
        lastSent.delete(p.id);
        sync();
        return;
      }
      case 'ready': {
        const ready = msg.ready === true;
        if (phase !== 'lobby' || p.ready === ready) return;
        p.ready = ready;
        emit({ type: 'roster' });
        sync();
        return;
      }
      case 'pause':
        if (p.selfPaused) return;
        p.selfPaused = true;
        freezeControl(p);
        sync();
        return;
      case 'resume':
        if (!p.selfPaused) return;
        p.selfPaused = false;
        unfreezeIfActive(p);
        sync();
        return;
      case 'emoji':
        if (!isEmojiIndex(msg.i) || !p.spectating || paused) return;
        if (!emoji.allow(p.playerKey, clockMs)) return;
        emit({ type: 'emoji', playerId: p.id, i: msg.i });
        return;
      case 'leader': {
        if (p.id !== leaderId) return;
        const a = msg.action;
        if (a === 'difficulty') {
          if (isDifficulty(msg.difficulty)) {
            doAction({ kind: 'difficulty', difficulty: msg.difficulty });
          }
          return;
        }
        if (a === 'remove') {
          // The leader can't remove themselves (they can Leave instead).
          if (typeof msg.playerId === 'string' && msg.playerId !== p.id) {
            doAction({ kind: 'remove', playerId: msg.playerId });
          }
          return;
        }
        if (a !== 'start' && a !== 'next' && a !== 'rematch' && a !== 'lobby') return;
        doAction(a);
        return;
      }
      case 'leave':
        removePlayer(p, true);
        return;
    }
  }

  function joinKnown(p: PlayerRecord, id: string): void {
    lastSent.delete(p.id);
    roster.reassign(p, id);
    p.connected = true;
    p.left = false;
    p.selfPaused = false;
    p.eliminated = false;
    p.ghost = false;
    p.respawnMs = 0;
    p.ready = false;
    p.spectating = phase !== 'lobby';
  }

  // ---- public API ----

  const match: Match = {
    playerJoined(playerId, playerKey) {
      if (roster.current(playerId)) {
        match.playerRejoined(playerId, playerKey);
        return;
      }
      const known = roster.byKey(playerKey);
      if (known) joinKnown(known, playerId);
      else roster.add(playerId, playerKey, { spectating: phase !== 'lobby' });
      emit({ type: 'roster' });
      updateLeader();
      sync();
    },

    playerLeft(playerId) {
      const p = roster.current(playerId);
      if (!p || p.left || !p.connected) return;
      p.connected = false;
      freezeControl(p);
      lastSent.delete(p.id);
      emit({ type: 'roster' });
      updateLeader();
      sync();
    },

    playerRejoined(playerId, playerKey) {
      const p = roster.current(playerId);
      if (!p) {
        match.playerJoined(playerId, playerKey);
        return;
      }
      if (p.left) return;
      p.connected = true;
      // Self-pause is a phone overlay; the phone re-sends `pause` if it's still up.
      p.selfPaused = false;
      unfreezeIfActive(p);
      lastSent.delete(p.id);
      emit({ type: 'roster' });
      updateLeader();
      sync();
    },

    handleMessage(from, data) {
      const p = roster.current(from);
      if (!p || p.left) return;
      if (isInput(data)) {
        if (phase !== 'playing' || paused || !p.connected || p.selfPaused) return;
        if (eggs.has(p.id) || p.ghost) sim.setInput(p.id, data);
        return;
      }
      if (data && typeof data === 'object' && !Array.isArray(data)) {
        handleObject(p, data as Record<string, unknown>);
      }
    },

    restore(peers: readonly RelayPeer[]) {
      roster = new Roster();
      eggs.clear();
      lastSent.clear();
      emoji.clear();
      paused = false;
      countdownMs = 0;
      survivorId = null;
      winnerId = null;
      breakdown = null;
      leaderId = null;
      round = 0;
      difficulty = DEFAULT_DIFFICULTY;
      const saved = loadPersisted(deps.storage);
      if (saved) {
        round = saved.round;
        matchTarget = saved.targetScore;
        difficulty = saved.difficulty ?? DEFAULT_DIFFICULTY;
        roster.nextJoinIndex = saved.nextJoinIndex;
        for (const sp of saved.players) {
          const peer = peers.find((q) => q.playerKey === sp.playerKey);
          roster.add(peer?.playerId ?? sp.playerId, sp.playerKey, {
            name: sanitizeName(sp.name, sp.joinIndex),
            color: sp.color,
            score: sp.score,
            left: sp.left,
            connected: !sp.left && !!peer?.connected,
            joinIndex: sp.joinIndex,
          });
        }
        const idOf = (key: string | null): string | null =>
          key === null ? null : (roster.byKey(key)?.id ?? null);
        leaderId = idOf(saved.leaderKey);
        winnerId = idOf(saved.winnerKey);
      }
      for (const peer of peers) {
        if (roster.byKey(peer.playerKey)) continue;
        roster.add(peer.playerId, peer.playerKey, {
          connected: peer.connected,
          spectating: round > 0,
        });
      }
      const next: MatchPhase = round === 0 ? 'lobby' : winnerId ? 'matchEnd' : 'results';
      setPhase(next);
      emit({ type: 'roster' });
      updateLeader();
      sync();
    },

    hostAction(action) {
      doAction(action);
    },

    setHostVisible(visible) {
      if (paused === !visible) return;
      paused = !visible;
      sync();
    },

    handleSimEvents(events: readonly SimEvent[]) {
      if (phase !== 'playing' || events.length === 0) return;
      for (const e of events) {
        if (e.type === 'eliminated') {
          if (!eggs.delete(e.id)) continue;
          const owner = roster.current(e.id);
          if (owner) {
            owner.eliminated = true;
            owner.respawnMs = e.respawnMs;
          }
          const killer = knockoutCredit(roster, e.id, e.by);
          if (killer) addScore(killer, KNOCKOUT_POINTS, 'knockout');
          tally.knockout(roster.get(e.id), killer, e.byGhost ?? false);
        } else if (e.type === 'ghostSpawned') {
          const owner = roster.current(e.id);
          if (owner && owner.eliminated) {
            owner.ghost = true;
            owner.respawnMs = 0;
          }
        }
      }
      endRoundIfOver();
      sync();
    },

    tick(dtMs) {
      if (paused || !(dtMs > 0)) return;
      clockMs += dtMs;
      if (phase === 'countdown') {
        countdownMs -= dtMs;
        if (countdownMs <= TIME_EPSILON_MS) {
          countdownMs = 0;
          setPhase('playing');
          for (const id of eggs) {
            const p = roster.current(id);
            if (p) unfreezeIfActive(p);
          }
          endRoundIfOver();
        }
      } else if (phase === 'playing') {
        for (const p of roster.players) {
          if (p.eliminated && !p.ghost) p.respawnMs = Math.max(0, p.respawnMs - dtMs);
        }
      }
      sync();
    },

    get simRunning() {
      return phase === 'playing' && !paused;
    },

    view(): MatchView {
      const players: PlayerView[] = roster.players.map((p) => ({
        id: p.id,
        playerKey: p.playerKey,
        name: p.name,
        color: p.color,
        score: p.score,
        connected: p.connected,
        left: p.left,
        spectating: p.spectating,
        selfPaused: p.selfPaused,
        isLeader: p.id === leaderId,
        alive: hasEgg(p),
        ghost: p.ghost,
        joinIndex: p.joinIndex,
        ready: p.ready,
      }));
      return {
        phase,
        paused,
        round,
        targetScore: targetScore(),
        leaderId,
        difficulty,
        canStart: canStart(),
        countdownMs: phase === 'countdown' ? countdownMs : 0,
        players,
        survivorId: phase === 'results' || phase === 'matchEnd' ? survivorId : null,
        winnerId: phase === 'matchEnd' ? winnerId : null,
        breakdown: phase === 'results' || phase === 'matchEnd' ? breakdown : null,
      };
    },

    onEvent(cb) {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  };

  return match;
}
