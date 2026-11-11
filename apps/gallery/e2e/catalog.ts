// The e2e expectations, read from @pcg/catalog (SPEC: Game cards; BUILD_PLAN G1 risk "Playwright and
// the catalog"). The catalog is TS with explicit `.ts` imports, so it is loaded by a child `node`
// (type stripping) rather than by Playwright's own loader, and handed back as JSON.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { GameMeta } from '@pcg/catalog';

export interface ListedGame extends GameMeta {
  /** `gameUrl(id)`. */
  url: string;
}

const SCRIPT = `
const { listedGames, gameUrl } = await import('@pcg/catalog');
process.stdout.write(JSON.stringify(listedGames().map((g) => ({ ...g, url: gameUrl(g.id) }))));
`;

/** `listedGames()` in catalog order, each with its launch URL. */
export const LISTED: ListedGame[] = JSON.parse(
  execFileSync(process.execPath, ['--input-type=module', '-e', SCRIPT], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    encoding: 'utf8',
    // Playwright's own loader hooks must not leak into the child.
    env: { ...process.env, NODE_OPTIONS: '' },
  }),
);

/** The card's player range, as the SPEC words it: "2–8 players", "4 players", "1 player". */
export function playerRange({ minPlayers: min, maxPlayers: max }: GameMeta): string {
  if (min === max) return `${min} ${min === 1 ? 'player' : 'players'}`;
  return `${min}–${max} players`;
}

/** longDescription's paragraph count (blank-line separated, catalog README). */
export function paragraphCount(text: string): number {
  return text.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length;
}
