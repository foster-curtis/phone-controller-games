// Per-phone screen (SPEC §6.7): what each phone should show, derived from match state.
import type { Screen, ScreenBase, Standing, PlayerColorId } from '../../shared/messages';
import type { MatchPhase } from './types';
import type { PlayerRecord } from './roster';

export interface ScreenContext {
  phase: MatchPhase;
  paused: boolean;
  round: number;
  targetScore: number;
  leaderId: string | null;
  countdownMs: number;
  survivorId: string | null;
  winnerId: string | null;
  standings: Standing[];
  canStart: boolean;
  takenColors(p: PlayerRecord): PlayerColorId[];
  /** Player has an egg on the pan this round (under their current id). */
  hasEgg(p: PlayerRecord): boolean;
}

/** Whole seconds, so the phone shows 3-2-1 / 5…1 and screens only change once per second. */
export function ceilSecondsMs(ms: number): number {
  return Math.max(1, Math.ceil(ms / 1000 - 1e-9)) * 1000;
}

export function screenFor(ctx: ScreenContext, p: PlayerRecord): Screen {
  const base: ScreenBase = {
    isLeader: ctx.leaderId === p.id,
    round: ctx.round,
    targetScore: ctx.targetScore,
    name: p.name,
    color: p.color,
    standings: ctx.standings,
  };
  if (p.left) return { ...base, kind: 'left' };
  if (ctx.paused) return { ...base, kind: 'gamePaused' };
  switch (ctx.phase) {
    case 'lobby':
      return { ...base, kind: 'lobby', takenColors: ctx.takenColors(p), canStart: ctx.canStart };
    case 'countdown':
      if (p.spectating || !ctx.hasEgg(p)) return { ...base, kind: 'spectating' };
      return { ...base, kind: 'countdown', ms: ceilSecondsMs(ctx.countdownMs) };
    case 'playing':
      if (p.spectating) return { ...base, kind: 'spectating' };
      if (ctx.hasEgg(p)) return { ...base, kind: 'playing' };
      if (p.ghost) return { ...base, kind: 'ghost' };
      if (p.eliminated)
        return { ...base, kind: 'eliminated', respawnMs: ceilSecondsMs(p.respawnMs) };
      return { ...base, kind: 'spectating' };
    case 'results':
      return { ...base, kind: 'results', survivorId: ctx.survivorId };
    case 'matchEnd':
      return { ...base, kind: 'matchEnd', winnerId: ctx.winnerId ?? '' };
  }
}
