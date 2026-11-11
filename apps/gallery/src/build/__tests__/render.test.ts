// @vitest-environment jsdom
// Card markup tests (SPEC: Game cards, Status handling, Device and input). jsdom only parses the
// rendered strings; render.ts itself uses no DOM.
import { gameUrl, type GameMeta } from '@pcg/catalog';
import { describe, expect, it } from 'vitest';
import { escapeHtml, paragraphs, playerRange, renderCard, renderGrid } from '../render.ts';

const game = (over: Partial<GameMeta> = {}): GameMeta => ({
  id: 'test-game',
  title: 'Test Game',
  shortDescription: 'Short.',
  longDescription: 'Long.',
  image: 'catalog/card.jpg',
  shareImage: 'catalog/share.webp',
  minPlayers: 2,
  maxPlayers: 8,
  status: 'live',
  ...over,
});

const imageSrc = (g: GameMeta) => `/art/${g.id}.jpg`;

function parse(html: string): Document {
  return new DOMParser().parseFromString(`<ul>${html}</ul>`, 'text/html');
}

const card = (g: GameMeta, eager = false) =>
  parse(renderCard(g, { href: gameUrl(g.id), imageSrc: imageSrc(g), eager })).querySelector(
    'article',
  )!;

describe('escapeHtml', () => {
  it('escapes <, >, &, double and single quotes', () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;',
    );
  });
});

describe('paragraphs', () => {
  it('splits on blank lines into escaped <p>s', () => {
    expect(paragraphs('One.\n\nTwo & <three>.')).toBe('<p>One.</p><p>Two &amp; &lt;three&gt;.</p>');
  });

  it('handles \\r\\n, whitespace-only blank lines and leading/trailing blanks', () => {
    expect(paragraphs('\r\n  One.\r\n \t\r\nTwo.\n\n\n\nThree.  \n\n')).toBe(
      '<p>One.</p><p>Two.</p><p>Three.</p>',
    );
  });

  it('keeps single line breaks inside a paragraph', () => {
    expect(paragraphs('Line a\nline b')).toBe('<p>Line a\nline b</p>');
  });
});

describe('playerRange', () => {
  it('uses an en dash for a range', () => {
    expect(playerRange(2, 8)).toBe('2–8 players');
  });

  it('has one number when min = max', () => {
    expect(playerRange(4, 4)).toBe('4 players');
    expect(playerRange(1, 1)).toBe('1 player');
  });
});

describe('renderCard', () => {
  const nasty = `<b>"Tom" & 'Jerry'</b>`;
  const evil = game({
    title: nasty,
    shortDescription: nasty,
    longDescription: `${nasty}\n\n${nasty}`,
  });

  it('escapes every text field', () => {
    const html = renderCard(evil, {
      href: gameUrl(evil.id),
      imageSrc: imageSrc(evil),
      eager: false,
    });
    expect(html).not.toContain('<b>');
    expect(html).not.toContain(`"Tom"`);
    expect(html).not.toContain(`'Jerry'`);
    const el = card(evil);
    expect(el.querySelector('.game-card-title')!.textContent).toBe(nasty);
    expect(el.querySelector('.game-card-description')!.textContent).toBe(nasty);
    expect(el.querySelectorAll('.long-description p')).toHaveLength(2);
    expect(el.querySelector('.long-description p')!.textContent).toBe(nasty);
    expect(el.querySelector('img')!.getAttribute('alt')).toBe(`${nasty} card art`);
    expect(el.querySelector('a.button')!.getAttribute('aria-label')).toBe(`Play ${nasty}`);
    expect(el.querySelector('summary')!.textContent).toBe(`Read more about ${nasty}`);
  });

  it('uses the kit card markup', () => {
    const el = card(game());
    expect(el.className).toBe('game-card');
    expect(el.dataset.game).toBe('test-game');
    expect(el.querySelector(':scope > a.game-card-image > img')).not.toBeNull();
    expect(el.querySelector(':scope > .game-card-body > h3.game-card-title > a')).not.toBeNull();
    expect(el.querySelector('.game-card-meta > .eyebrow')!.textContent).toBe('2–8 players');
    expect(
      el.querySelector('.game-card-actions > details.read-more > summary + .long-description'),
    ).not.toBeNull();
    expect(el.querySelector('.game-card-actions > a.button')!.textContent).toBe('Play→');
    expect(el.querySelector('a.button > span')!.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('summary .visually-hidden')!.textContent).toBe(' about Test Game');
  });

  it('shows the Playtest pill for beta only', () => {
    expect(card(game({ status: 'beta' })).querySelector('.pill')!.textContent).toBe('Playtest');
    expect(card(game({ status: 'live' })).querySelector('.pill')).toBeNull();
  });

  it('keeps one keyboard stop per game: image and title links are out of the tab order', () => {
    const el = card(game());
    const image = el.querySelector('a.game-card-image')!;
    expect(image.getAttribute('aria-hidden')).toBe('true');
    expect(image.getAttribute('tabindex')).toBe('-1');
    expect(el.querySelector('.game-card-title a')!.getAttribute('tabindex')).toBe('-1');
    expect(el.querySelector('a.button')!.hasAttribute('tabindex')).toBe(false);
  });

  it('builds the alt text and the Play label from the title', () => {
    const el = card(game({ title: 'Sunny' }));
    expect(el.querySelector('img')!.getAttribute('alt')).toBe('Sunny card art');
    expect(el.querySelector('a.button')!.getAttribute('aria-label')).toBe('Play Sunny');
  });

  it('sizes the image and lazy-loads unless eager', () => {
    const lazy = card(game()).querySelector('img')!;
    expect(lazy.getAttribute('src')).toBe('/art/test-game.jpg');
    expect(lazy.getAttribute('width')).toBe('1200');
    expect(lazy.getAttribute('height')).toBe('630');
    expect(lazy.getAttribute('decoding')).toBe('async');
    expect(lazy.getAttribute('loading')).toBe('lazy');
    expect(lazy.hasAttribute('fetchpriority')).toBe(false);
    const eager = card(game(), true).querySelector('img')!;
    expect(eager.getAttribute('loading')).toBe('eager');
    expect(eager.getAttribute('fetchpriority')).toBe('high');
  });
});

describe('renderGrid', () => {
  const games = [
    game({ id: 'alpha', title: 'Alpha' }),
    game({ id: 'hidden-one', title: 'HIDDEN PROBE', status: 'hidden' }),
    game({ id: 'bravo', title: 'Bravo', status: 'beta' }),
    game({ id: 'charlie', title: 'Charlie' }),
  ];
  const html = renderGrid(games, { imageSrc });
  const doc = parse(html);
  const cards = [...doc.querySelectorAll('ul > li > article.game-card')] as HTMLElement[];

  it('never renders hidden entries and keeps catalog order', () => {
    expect(html).not.toContain('HIDDEN PROBE');
    expect(html).not.toContain('hidden-one');
    expect(cards.map((c) => c.dataset.game)).toEqual(['alpha', 'bravo', 'charlie']);
  });

  it('links every href to gameUrl(id), with no target', () => {
    for (const c of cards) {
      const links = [...c.querySelectorAll('a')];
      expect(links).toHaveLength(3);
      for (const a of links) {
        expect(a.getAttribute('href')).toBe(gameUrl(c.dataset.game!));
        expect(a.hasAttribute('target')).toBe(false);
      }
    }
    expect(html).not.toContain('target=');
  });

  it('makes only the first image eager', () => {
    expect(cards.map((c) => c.querySelector('img')!.getAttribute('loading'))).toEqual([
      'eager',
      'lazy',
      'lazy',
    ]);
    expect(doc.querySelectorAll('img[fetchpriority]')).toHaveLength(1);
  });
});
