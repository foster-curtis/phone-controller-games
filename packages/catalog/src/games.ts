// The ordered catalog: one entry per game, in gallery order. Each game owns its entry in
// `apps/<id>/game.meta.ts`; this file only lists them. It is the one file in `packages/` allowed to
// import from `apps/` (PLATFORM decision #9; eslint.config.js), and only those meta files.
// Explicit `.ts`: Vite configs load this through Node's type stripping (see `vite.ts`).
import fortFrenzy from '../../../apps/fort-frenzy/game.meta.ts';
import sayCheese from '../../../apps/say-cheese/game.meta.ts';
import sunnySide from '../../../apps/sunny-side/game.meta.ts';
import type { GameMeta } from './types.ts';

export const GAMES: readonly GameMeta[] = [sunnySide, fortFrenzy, sayCheese];

/** Games shown on public surfaces (the gallery): every status but `hidden`, in catalog order. */
export function listedGames(games: readonly GameMeta[] = GAMES): GameMeta[] {
  return games.filter((g) => g.status !== 'hidden');
}

export function gameById(id: string, games: readonly GameMeta[] = GAMES): GameMeta | undefined {
  return games.find((g) => g.id === id);
}
