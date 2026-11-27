// When the TV plays each sound (SPEC §6.20, §12.8; BUILD_PLAN TF12): sound effects fire only from `tv`
// sim events, plus the match's own moments (round bell at play and hands up, a pop per reveal card),
// panned by the event's position on the map. There is no grab, pickpocket or tip-payout cue (SPEC
// §6.11): those never reach the TV as events, and `SfxCue` has no name for them.
import type { TvEvent, WorldView } from '../sim/snapshot';
import type { SfxCue } from '../../shared/sfx';
import type { TvView } from '../ui/types';

export interface CuePlay {
  cue: SfxCue;
  /** Entity whose position pans the sound, if any. */
  at?: number;
}

/** The cues one TV event plays. */
export function cuesFor(e: TvEvent): CuePlay[] {
  switch (e.e) {
    case 'glanceWindup':
      return [{ cue: 'glanceSwoosh', at: e.by }];
    case 'shout':
      // "THIEF!" and the alert's whistle (SPEC §6.12: a shout calls the guards).
      return [
        { cue: 'thiefShout', at: e.by },
        { cue: 'guardWhistle', at: e.by },
      ];
    case 'guardSpot':
      return [{ cue: 'guardWhistle', at: e.guard }];
    case 'reinforcement':
      return [{ cue: 'gateCreak', at: e.guard }];
    case 'stocksIn':
      return [{ cue: 'stocksClank', at: e.character }];
    case 'caught':
      return [{ cue: 'coinClink', at: e.to }];
    case 'coinToss':
      return [{ cue: 'coinClink', at: e.by }];
    case 'phase':
      return e.phase === 'play' ? [{ cue: 'roundBell' }] : []; // hands up: `cuesBetween`
    default:
      return [];
  }
}

/** Stereo pan −1..1 from an entity's x on the map (0 when unknown). */
export function panOf(view: WorldView, id: number | undefined, mapW: number): number {
  if (id === undefined) return 0;
  const e =
    view.characters.find((c) => c.id === id) ??
    view.merchants.find((m) => m.id === id) ??
    view.guards.find((g) => g.id === id);
  if (!e) return 0;
  return Math.max(-1, Math.min(1, (e.x / mapW) * 2 - 1));
}

/**
 * The match's own cue moments between two TV views (SPEC §6.20): the round bell at "Hands up!" and a
 * pop per new reveal card.
 */
export function cuesBetween(prev: TvView | null, next: TvView): SfxCue[] {
  if (next.phase === 'handsUp') return prev?.phase === 'handsUp' ? [] : ['roundBell'];
  if (next.phase === 'reveal') {
    const before = prev?.phase === 'reveal' ? prev.step : 0;
    return next.step > before ? ['revealPop'] : [];
  }
  return [];
}
