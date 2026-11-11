// @pcg/catalog/node: the catalog checks that read files (Node only, never bundled into a page).
// On top of `validateGames`: the id names the app folder, the image exists, and the game's page
// titles and web manifest name agree with `title`, so the catalog and the game can't drift apart.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// Explicit `.ts`: Vite configs load this through Node's type stripping (see `vite.ts`).
import { GAMES } from './games.ts';
import type { GameMeta } from './types.ts';
import { entryLabel, validateGames } from './validate.ts';

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

/** `apps/<id>`, absolute. */
export function gameDir(id: string, root: string = REPO_ROOT): string {
  return join(root, 'apps', id);
}

/** The card art's absolute path (for builds that copy or import it). */
export function imageFile(game: GameMeta, root: string = REPO_ROOT): string {
  return join(gameDir(game.id, root), game.image);
}

const decode = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

function htmlTitle(file: string): string | null {
  const m = /<title>([\s\S]*?)<\/title>/i.exec(readFileSync(file, 'utf8'));
  return m ? decode(m[1]!.trim()) : null;
}

function fileErrors(game: GameMeta, root: string): string[] {
  const dir = gameDir(game.id, root);
  if (!existsSync(join(dir, 'game.meta.ts'))) {
    return [`no apps/${game.id}/game.meta.ts (the id must be the app folder name)`];
  }
  const errors: string[] = [];
  if (typeof game.image === 'string' && !existsSync(imageFile(game, root))) {
    errors.push(`image apps/${game.id}/${game.image} does not exist`);
  }
  for (const page of ['index.html', 'play.html']) {
    const file = join(dir, page);
    if (!existsSync(file)) continue;
    const title = htmlTitle(file);
    if (title !== game.title) {
      errors.push(`${page} <title> is ${JSON.stringify(title)}, not the catalog title`);
    }
  }
  const manifest = join(dir, 'public', 'site.webmanifest');
  if (existsSync(manifest)) {
    const name: unknown = JSON.parse(readFileSync(manifest, 'utf8')).name;
    if (name !== game.title) {
      errors.push(`public/site.webmanifest name is ${JSON.stringify(name)}, not the catalog title`);
    }
  }
  return errors;
}

/** Every catalog problem: `validateGames` plus the file checks. Empty when the catalog is good. */
export function checkCatalog(
  games: readonly unknown[] = GAMES,
  root: string = REPO_ROOT,
): string[] {
  const errors = validateGames(games);
  // File paths come from the id and image, so files are only checked once the schema is clean.
  if (errors.length > 0) return errors;
  games.forEach((entry, i) => {
    for (const e of fileErrors(entry as GameMeta, root))
      errors.push(`${entryLabel(entry, i)}: ${e}`);
  });
  return errors;
}

/** Throws one error listing every catalog problem. */
export function assertCatalog(games: readonly unknown[] = GAMES, root: string = REPO_ROOT): void {
  const errors = checkCatalog(games, root);
  if (errors.length > 0) {
    throw new Error(`The game catalog is invalid:\n  - ${errors.join('\n  - ')}`);
  }
}
