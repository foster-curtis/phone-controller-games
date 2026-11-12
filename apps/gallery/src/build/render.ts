// Card markup (SPEC: Game cards, Status handling, Device and input): the brand kit's game card
// (brand/preview.html, "Game grid") as an HTML string, rendered at build time by the prerender
// plugin. Pure TS with no Node or DOM APIs, so it unit-tests directly and the Vite config can load
// it through Node's type stripping (hence the explicit `.ts` imports and erasable TS only).
import { FEEDBACK_FORM_URL, gameUrl, listedGames, type GameMeta } from '@pcg/catalog';

const ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Safe for text and for double- or single-quoted attribute values. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ENTITIES[c]!);
}

/** Plain-text longDescription → one escaped `<p>` per blank-line-separated paragraph (catalog README). */
export function paragraphs(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join('');
}

/** "2–8 players" (en dash), "4 players", "1 player". */
export function playerRange(min: number, max: number): string {
  if (min === max) return `${min} ${min === 1 ? 'player' : 'players'}`;
  return `${min}–${max} players`;
}

export interface CardOptions {
  /** The game's launch URL: always `gameUrl(id)`. */
  href: string;
  /** Card art URL, as the page should load it. */
  imageSrc: string;
  /** The first card's image loads eagerly with high priority; the rest are lazy. */
  eager: boolean;
}

/**
 * One card. The image and title links are out of the tab order (one keyboard stop per game for the
 * game itself, BUILD_PLAN §8), so each card has two stops: Read more and Play. No `target`: games
 * open in the same tab (SPEC: Game cards).
 */
export function renderCard(game: GameMeta, { href, imageSrc, eager }: CardOptions): string {
  const title = escapeHtml(game.title);
  const url = escapeHtml(href);
  const loading = eager ? 'loading="eager" fetchpriority="high"' : 'loading="lazy"';
  const pill = game.status === 'beta' ? '<span class="pill">Playtest</span>' : '';
  return `<article class="game-card" data-game="${escapeHtml(game.id)}">
<a class="game-card-image" href="${url}" tabindex="-1" aria-hidden="true"><img src="${escapeHtml(imageSrc)}" alt="${title} card art" width="1200" height="630" decoding="async" ${loading}></a>
<div class="game-card-body">
<h3 class="game-card-title"><a href="${url}" tabindex="-1">${title}</a></h3>
<div class="game-card-meta"><span class="eyebrow">${playerRange(game.minPlayers, game.maxPlayers)}</span>${pill}</div>
<p class="game-card-description">${escapeHtml(game.shortDescription)}</p>
<div class="game-card-actions">
<details class="read-more"><summary>Read more<span class="visually-hidden"> about ${title}</span></summary><div class="long-description">${paragraphs(game.longDescription)}</div></details>
<a class="button" href="${url}" aria-label="Play ${title}">Play<span aria-hidden="true">→</span></a>
</div>
</div>
</article>`;
}

/** The feedback banner's button (SPEC decision #6; PLATFORM decision #11): the plain form, no game pre-filled. */
export function renderFeedbackLink(): string {
  return `<a class="button" href="${escapeHtml(FEEDBACK_FORM_URL)}">Give feedback here!<span aria-hidden="true">→</span></a>`;
}

export interface GridOptions {
  /** Card art URL for a game (build: a path Vite hashes; dev: a `/@fs/` URL). */
  imageSrc: (game: GameMeta) => string;
}

/** The grid's `<li>`s: every listed game in catalog order. Filters with `listedGames()` itself, so a hidden entry can't slip through. */
export function renderGrid(games: readonly GameMeta[], { imageSrc }: GridOptions): string {
  return listedGames(games)
    .map(
      (game, i) =>
        `<li>${renderCard(game, { href: gameUrl(game.id), imageSrc: imageSrc(game), eager: i === 0 })}</li>`,
    )
    .join('\n');
}
