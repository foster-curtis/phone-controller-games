import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  GAMES,
  SHORT_DESCRIPTION_MAX,
  gameById,
  gameUrl,
  listedGames,
  validateGames,
  type GameMeta,
} from '../src/index.ts';
import { checkCatalog } from '../src/node.ts';

const good: GameMeta = {
  id: 'egg-toss',
  title: 'Egg Toss',
  shortDescription: 'Throw eggs.',
  longDescription: 'One paragraph.\n\nAnother paragraph.',
  image: 'catalog/card.svg',
  minPlayers: 2,
  maxPlayers: 8,
  status: 'live',
};
const errorsFor = (patch: Record<string, unknown>) => validateGames([{ ...good, ...patch }]);

describe('the real catalog', () => {
  it('passes every check, files included', () => {
    expect(checkCatalog()).toEqual([]);
  });

  it('lists every game in order', () => {
    expect(GAMES.map((g) => g.id)).toEqual(['sunny-side', 'fort-frenzy', 'say-cheese']);
    expect(gameById('say-cheese')?.title).toBe('Say Cheese!');
  });
});

describe('validateGames', () => {
  it('accepts a good entry', () => {
    expect(validateGames([good])).toEqual([]);
  });

  it('rejects missing required fields', () => {
    const { title: _t, image: _i, ...rest } = good;
    const errors = validateGames([rest]);
    expect(errors).toContain('egg-toss: title is missing or empty');
    expect(errors).toContain('egg-toss: image is missing or empty');
    expect(validateGames([{ ...good, id: undefined }])[0]).toMatch(/^entry #0: id is missing/);
    expect(validateGames([null])).toEqual(['entry #0: not an object']);
  });

  it('rejects bad player counts', () => {
    expect(errorsFor({ minPlayers: 0 })).toEqual([
      'egg-toss: minPlayers is 0 (must be at least 1)',
    ]);
    expect(errorsFor({ minPlayers: 5, maxPlayers: 4 })).toEqual([
      'egg-toss: minPlayers (5) is more than maxPlayers (4)',
    ]);
    expect(errorsFor({ maxPlayers: 2.5 })).toEqual([
      'egg-toss: maxPlayers is missing or not a whole number',
    ]);
  });

  it('rejects a short description over the limit', () => {
    expect(errorsFor({ shortDescription: 'x'.repeat(SHORT_DESCRIPTION_MAX) })).toEqual([]);
    expect(errorsFor({ shortDescription: 'x'.repeat(SHORT_DESCRIPTION_MAX + 1) })).toEqual([
      `egg-toss: shortDescription is ${SHORT_DESCRIPTION_MAX + 1} characters (max ${SHORT_DESCRIPTION_MAX})`,
    ]);
  });

  it('rejects duplicate ids', () => {
    expect(validateGames([good, { ...good, title: 'Again' }])).toEqual([
      'egg-toss: duplicate id (entries #0 and #1)',
    ]);
  });

  it('rejects bad ids, statuses and image paths', () => {
    expect(errorsFor({ id: 'Egg Toss' })).toEqual([
      'Egg Toss: id "Egg Toss" is not lowercase kebab-case',
    ]);
    expect(errorsFor({ status: 'soon' })).toEqual([
      'egg-toss: status must be one of live, beta, hidden',
    ]);
    expect(errorsFor({ image: '../other/card.png' })[0]).toMatch(/inside the game's folder/);
    expect(errorsFor({ image: '/card.png' })[0]).toMatch(/inside the game's folder/);
    expect(errorsFor({ image: 'catalog/card.gif' })[0]).toMatch(/must be one of/);
  });
});

describe('checkCatalog (files)', () => {
  let root: string;
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function makeApp(opts: { image?: boolean; htmlTitle?: string; meta?: boolean } = {}) {
    root = mkdtempSync(join(tmpdir(), 'pcg-catalog-'));
    const dir = join(root, 'apps', good.id);
    mkdirSync(join(dir, 'catalog'), { recursive: true });
    if (opts.meta !== false) writeFileSync(join(dir, 'game.meta.ts'), '');
    if (opts.image !== false) writeFileSync(join(dir, 'catalog', 'card.svg'), '<svg/>');
    if (opts.htmlTitle !== undefined) {
      writeFileSync(join(dir, 'index.html'), `<title>${opts.htmlTitle}</title>`);
    }
  }

  it('passes when the files agree', () => {
    makeApp({ htmlTitle: 'Egg Toss' });
    expect(checkCatalog([good], root)).toEqual([]);
  });

  it('fails when the image does not exist', () => {
    makeApp({ image: false });
    expect(checkCatalog([good], root)).toEqual([
      'egg-toss: image apps/egg-toss/catalog/card.svg does not exist',
    ]);
  });

  it('fails when the id is not an app folder', () => {
    makeApp({ meta: false });
    expect(checkCatalog([good], root)[0]).toMatch(/the id must be the app folder name/);
  });

  it('fails when a page title disagrees', () => {
    makeApp({ htmlTitle: 'Egg Toss Deluxe' });
    expect(checkCatalog([good], root)).toEqual([
      'egg-toss: index.html <title> is "Egg Toss Deluxe", not the catalog title',
    ]);
  });
});

describe('listedGames', () => {
  it('leaves out hidden games and keeps the order', () => {
    const games: GameMeta[] = [
      { ...good, id: 'a' },
      { ...good, id: 'b', status: 'hidden' },
      { ...good, id: 'c', status: 'beta' },
    ];
    expect(listedGames(games).map((g) => g.id)).toEqual(['a', 'c']);
  });
});

describe('gameUrl', () => {
  it('builds subdomain URLs by default', () => {
    expect(gameUrl('sunny-side')).toBe('https://sunny-side.fostercurtis.dev/');
  });

  it('builds single-domain path URLs from the routing config', () => {
    const routing = { kind: 'path', origin: 'https://games.example/', prefix: 'play/' } as const;
    expect(gameUrl('say-cheese', routing)).toBe('https://games.example/play/say-cheese/');
    expect(gameUrl('say-cheese', { ...routing, prefix: '' })).toBe(
      'https://games.example/say-cheese/',
    );
  });

  it('refuses an invalid id', () => {
    expect(() => gameUrl('Not An Id')).toThrow(/not a valid game id/);
  });
});
