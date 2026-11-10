// Per-phone `Screen`s (SPEC §6.7, §7.3) and the TV's `TvView` (SPEC §6.6), built from match state.
import {
  MAX_SEATS,
  MIN_PLAYERS,
  type LobbyPlayer,
  type PlayerSummary,
  type RoundBase,
  type Screen,
  type ScreenBase,
} from '../../shared/messages';
import { MAX_SHOTS, RULES_CARDS } from './config';
import { active, findPlayer, phoneSeats, playing, summary, type Phones } from './roster';
import { takeNext } from './queue';
import { expected, received } from './round';
import { caughtView, standings, winners } from './scoring';
import type { MatchState, Player, TvView } from './types';

export interface ViewCtx {
  state: MatchState;
  phones: Phones;
  /** Remaining ms on the running timer (0 when none). */
  endsInMs: () => number;
}

/** Start needs ≥3 seats on connected phones, every connected phone Ready, ≥1 camera (BUILD_PLAN §8). */
export function canStart(s: MatchState): boolean {
  const live = active(s).filter((p) => p.connected);
  return (
    live.length >= MIN_PLAYERS && live.every((p) => p.ready) && live.some((p) => p.camera === 'ok')
  );
}

export function photographer(s: MatchState): Player | undefined {
  return s.round ? s.players.find((p) => p.id === s.round!.photographer) : undefined;
}

/** The photographer's phone is gone mid-review: leader/host may skip (SPEC §6.3). */
export function canSkipReview(s: MatchState): boolean {
  const ph = photographer(s);
  return s.phase === 'review' && (!ph || ph.left || !ph.connected);
}

/** The leader phone's first seat names the leader (SPEC §6.3.1). */
function leaderName(s: MatchState): string | null {
  return s.leader === null ? null : (phoneSeats(s, s.leader)[0]?.name ?? null);
}

function lobbyPlayers(s: MatchState): LobbyPlayer[] {
  return active(s).map((p) => ({
    ...summary(p),
    phoneId: p.phoneId,
    ready: p.ready,
    camera: p.camera,
    connected: p.connected,
  }));
}

/** No one left to photograph (results: the leader's button leads to match end). */
export const isLast = (s: MatchState): boolean =>
  takeNext(s.queue, s.players).photographer === null;

const IN_ROUND = new Set(['pass', 'announce', 'scatter', 'shoot', 'upload', 'review', 'results']);

export function screenFor(ctx: ViewCtx, phoneId: string): Screen {
  const s = ctx.state;
  const phone = ctx.phones.get(phoneId);
  const seats = phoneSeats(s, phoneId);
  const ph = photographer(s);
  const shooting = !!ph && ph.phoneId === phoneId;
  const base: ScreenBase = {
    leaderName: leaderName(s),
    isLeader: s.leader === phoneId,
    seats: seats.map((p) => ({ seat: p.seat, name: p.name, color: p.color })),
    canEmoji: (s.phase === 'review' || s.phase === 'results') && !shooting,
  };
  if (phone?.left) return { ...base, kind: 'left' };

  if (s.phase === 'lobby') {
    return {
      ...base,
      kind: 'lobby',
      players: lobbyPlayers(s),
      ready: phone?.ready ?? false,
      camera: phone?.camera ?? 'unknown',
      canStart: canStart(s),
      canAddSeat: active(s).length < MAX_SEATS,
    };
  }
  if (s.phase === 'rules') return { ...base, kind: 'rules', card: s.rulesCard, cards: RULES_CARDS };

  const inMatch = seats.some((p) => !p.spectator);
  if (s.phase === 'matchEnd') {
    return {
      ...base,
      kind: 'matchEnd',
      standings: standings(s.players),
      winners: winners(s.players),
    };
  }
  // Seatless and spectator-only phones watch rounds; they see results so a spectating leader can
  // still press Next photographer.
  if (!inMatch && s.phase !== 'results') return { ...base, kind: 'spectating' };
  if (!s.round || !ph || !IN_ROUND.has(s.phase)) return { ...base, kind: 'spectating' };

  if (s.phase === 'pass' && shooting) {
    return { ...base, kind: 'pass', seat: ph.seat, name: ph.name };
  }
  const round: RoundBase = {
    r: s.round.r,
    round: s.turn,
    rounds: s.turns,
    role: shooting ? 'photographer' : 'dodger',
    photographer: summary(ph),
    ...(shooting ? { seat: ph.seat } : {}),
  };
  switch (s.phase) {
    case 'pass':
    case 'announce':
      return { ...base, ...round, kind: 'announce' };
    case 'scatter':
      return { ...base, ...round, kind: 'scatter', endsInMs: ctx.endsInMs() };
    case 'shoot':
      return {
        ...base,
        ...round,
        kind: 'shoot',
        endsInMs: ctx.endsInMs(),
        shots: s.round.shots,
        maxShots: MAX_SHOTS,
      };
    case 'upload':
      return {
        ...base,
        ...round,
        kind: 'upload',
        received: received(s.round),
        expected: expected(s.round),
      };
    case 'review':
      return {
        ...base,
        ...round,
        kind: 'review',
        photos: s.round.photos.map((p) => ({ index: p.index, aspect: p.aspect })),
        photo: s.round.view,
        tags: s.round.tags.map((t) => ({ ...t })),
        candidates: playing(s)
          .filter((p) => p.id !== ph.id)
          .map(summary),
        canSkipReview: base.isLeader && canSkipReview(s),
      };
    default:
      return {
        ...base,
        ...round,
        kind: 'results',
        caught: caughtView(s.players, s.lastResult),
        photographerDelta: s.lastResult?.photographerDelta ?? 0,
        standings: standings(s.players),
        last: isLast(s),
      };
  }
}

/** Live "Caught this round" from the current tags. */
function liveCaught(s: MatchState): ReturnType<typeof caughtView> {
  if (!s.round) return [];
  const counts = new Map<string, number>();
  for (const t of s.round.tags) {
    if (t.playerId !== null) counts.set(t.playerId, (counts.get(t.playerId) ?? 0) + 1);
  }
  return caughtView(s.players, {
    r: s.round.r,
    photographer: s.round.photographer,
    caught: [...counts].map(([id, count]) => ({ playerId: id as Player['id'], count })),
    photographerDelta: 0,
  });
}

/** Every dodger in the match with this round's tag count (0 included), in join order (SC9). */
function liveRoster(s: MatchState): ReturnType<typeof caughtView> {
  if (!s.round) return [];
  const counts = new Map(liveCaught(s).map((c) => [c.playerId, c.count]));
  return playing(s)
    .filter((p) => p.id !== s.round!.photographer)
    .map((p) => ({ ...summary(p), count: counts.get(p.id) ?? 0 }));
}

export function tvView(ctx: ViewCtx): TvView {
  const s = ctx.state;
  const ph = photographer(s);
  const phSummary: PlayerSummary | null = ph ? summary(ph) : null;
  switch (s.phase) {
    case 'lobby':
      return {
        phase: 'lobby',
        code: s.code,
        leaderName: leaderName(s),
        players: lobbyPlayers(s),
        canStart: canStart(s),
      };
    case 'rules':
      return { phase: 'rules', card: s.rulesCard, cards: RULES_CARDS };
    case 'matchEnd':
      return { phase: 'matchEnd', standings: standings(s.players), winners: winners(s.players) };
    default:
      break;
  }
  if (!s.round || !phSummary) {
    return { phase: 'matchEnd', standings: standings(s.players), winners: winners(s.players) };
  }
  switch (s.phase) {
    case 'pass':
      return { phase: 'pass', photographer: phSummary };
    case 'announce':
      return { phase: 'announce', photographer: phSummary, turn: s.turn, turns: s.turns };
    case 'scatter':
      return { phase: 'scatter', photographer: phSummary, endsInMs: ctx.endsInMs() };
    case 'shoot':
      return {
        phase: 'shoot',
        photographer: phSummary,
        endsInMs: ctx.endsInMs(),
        shots: s.round.shots,
        maxShots: MAX_SHOTS,
      };
    case 'upload':
      return {
        phase: 'upload',
        photographer: phSummary,
        received: received(s.round),
        expected: expected(s.round),
      };
    case 'review': {
      const at = s.round.photos.findIndex((p) => p.index === s.round!.view);
      const photo = s.round.photos[at] ?? null;
      return {
        phase: 'review',
        photographer: phSummary,
        photo,
        photoIndex: Math.max(0, at),
        photoCount: s.round.photos.length,
        tags: s.round.tags
          .filter((t) => t.photo === s.round!.view)
          .map((t) => {
            const p = t.playerId === null ? undefined : findPlayer(s, t.playerId);
            return { ...t, player: p ? summary(p) : null };
          }),
        caught: liveCaught(s),
        roster: liveRoster(s),
        canSkipReview: canSkipReview(s),
      };
    }
    default:
      return {
        phase: 'results',
        photographer: phSummary,
        caught: caughtView(s.players, s.lastResult),
        photographerDelta: s.lastResult?.photographerDelta ?? 0,
        standings: standings(s.players),
        last: isLast(s),
      };
  }
}
