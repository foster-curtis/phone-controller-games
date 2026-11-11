// Catalog validation without the file system (safe in a browser bundle). The checks that read files
// (image exists, folder and page titles match) are in `node.ts`. Hand-written guards, as in each
// game's `messages.ts`: the repo has no schema library.
import {
  GAME_STATUSES,
  ID_PATTERN,
  IMAGE_FIELDS,
  LONG_DESCRIPTION_MAX,
  SHORT_DESCRIPTION_MAX,
  type GameStatus,
} from './types.ts';

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Label for messages: the entry's id when it has a usable one, else its position. */
export function entryLabel(entry: unknown, index: number): string {
  return isObject(entry) && typeof entry.id === 'string' && entry.id !== ''
    ? entry.id
    : `entry #${index}`;
}

function text(entry: Record<string, unknown>, key: string, max?: number): string | null {
  const v = entry[key];
  if (typeof v !== 'string' || v.trim() === '') return `${key} is missing or empty`;
  if (max !== undefined && v.length > max) return `${key} is ${v.length} characters (max ${max})`;
  return null;
}

/** Problems with one entry, without the label. */
function entryErrors(entry: unknown): string[] {
  if (!isObject(entry)) return ['not an object'];
  const errors: string[] = [];
  const push = (e: string | null) => {
    if (e) errors.push(e);
  };

  push(text(entry, 'id'));
  if (typeof entry.id === 'string' && entry.id !== '' && !ID_PATTERN.test(entry.id)) {
    errors.push(`id "${entry.id}" is not lowercase kebab-case`);
  }
  push(text(entry, 'title'));
  push(text(entry, 'shortDescription', SHORT_DESCRIPTION_MAX));
  push(text(entry, 'longDescription', LONG_DESCRIPTION_MAX));

  for (const [key, extensions] of Object.entries(IMAGE_FIELDS)) {
    const missing = text(entry, key);
    push(missing);
    if (missing) continue;
    const path = entry[key] as string;
    if (path.startsWith('/') || /^[a-z]+:/i.test(path) || path.split(/[\\/]/).includes('..')) {
      errors.push(`${key} "${path}" must be a path inside the game's folder`);
    }
    const dot = path.lastIndexOf('.');
    const ext = dot === -1 ? '' : path.slice(dot).toLowerCase();
    if (!extensions.includes(ext)) {
      errors.push(`${key} "${path}" must be one of ${extensions.join(', ')}`);
    }
  }

  const { minPlayers: min, maxPlayers: max } = entry;
  const minOk = Number.isInteger(min);
  const maxOk = Number.isInteger(max);
  if (!minOk) errors.push('minPlayers is missing or not a whole number');
  else if ((min as number) < 1) errors.push(`minPlayers is ${String(min)} (must be at least 1)`);
  if (!maxOk) errors.push('maxPlayers is missing or not a whole number');
  if (minOk && maxOk && (min as number) > (max as number)) {
    errors.push(`minPlayers (${String(min)}) is more than maxPlayers (${String(max)})`);
  }

  if (!GAME_STATUSES.includes(entry.status as GameStatus)) {
    errors.push(`status must be one of ${GAME_STATUSES.join(', ')}`);
  }
  return errors;
}

/** Every problem in a list of entries (schema, limits, duplicate ids), as `<id>: <problem>` lines. */
export function validateGames(games: readonly unknown[]): string[] {
  const errors: string[] = [];
  const seen = new Map<string, number>();
  games.forEach((entry, i) => {
    const label = entryLabel(entry, i);
    for (const e of entryErrors(entry)) errors.push(`${label}: ${e}`);
    if (isObject(entry) && typeof entry.id === 'string' && entry.id !== '') {
      const first = seen.get(entry.id);
      if (first === undefined) seen.set(entry.id, i);
      else errors.push(`${label}: duplicate id (entries #${first} and #${i})`);
    }
  });
  return errors;
}
