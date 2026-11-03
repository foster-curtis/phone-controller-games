// Turn queue (SPEC §6.1, §6.3): every seat photographs once in a shuffled order; no-camera phones'
// seats are skipped; a disconnected photographer's turn goes to the next connected seat and they move
// to the end; anyone still gone when the queue runs out is skipped.
import type { SeatId } from '../../shared/seats';
import type { Player } from './types';

/** Fisher–Yates with an injected uniform [0, 1) source. */
export function shuffle<T>(xs: readonly T[], rng: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** A seat that can still take its turn: in the match and its phone has a working camera. */
function eligible(p: Player | undefined): p is Player {
  return !!p && !p.left && !p.spectator && p.camera === 'ok';
}

/** Match start: the playing seats with a camera, shuffled. */
export function buildQueue(players: readonly Player[], rng: () => number): SeatId[] {
  return shuffle(
    players.filter(eligible).map((p) => p.id),
    rng,
  );
}

/**
 * Next photographer and the queue left after them. Seats that left or lost the camera drop out;
 * disconnected seats ahead of the first connected one move to the end; if nobody is connected the
 * rest are skipped (photographer null, queue empty).
 */
export function takeNext(
  queue: readonly SeatId[],
  players: readonly Player[],
): { photographer: SeatId | null; queue: SeatId[] } {
  const byId = new Map(players.filter((p) => !p.left).map((p) => [p.id, p]));
  const live = queue.filter((id) => eligible(byId.get(id)));
  const at = live.findIndex((id) => byId.get(id)!.connected);
  if (at < 0) return { photographer: null, queue: [] };
  return { photographer: live[at]!, queue: [...live.slice(at + 1), ...live.slice(0, at)] };
}
