// The catalog schema (PLATFORM §4, decision #9): the facts that describe and launch a game. Each
// game owns its entry in `apps/<id>/game.meta.ts`; `validate.ts` enforces the limits below.

/** `live`: listed and playable. `beta`: listed, marked unfinished. `hidden`: not listed anywhere. */
export type GameStatus = 'live' | 'beta' | 'hidden';
export const GAME_STATUSES: readonly GameStatus[] = ['live', 'beta', 'hidden'];

export interface GameMeta {
  /** Stable, URL-safe slug: lowercase kebab-case, equal to the app folder name (`apps/<id>`). */
  readonly id: string;
  /** Player-facing name, as on the TV, the phone and the page `<title>`. */
  readonly title: string;
  /** 1–2 sentences for the gallery card; at most `SHORT_DESCRIPTION_MAX` characters. */
  readonly shortDescription: string;
  /** One or two paragraphs behind "read more": plain text, paragraphs separated by a blank line. */
  readonly longDescription: string;
  /** Card art (1200×630), relative to the game's folder, e.g. `catalog/card.jpg`. */
  readonly image: string;
  /** Smaller link-preview image (1200×630 WebP/PNG/JPEG, no SVG), e.g. `catalog/share.webp`. */
  readonly shareImage: string;
  /** Fewest players a game can start with (at least 1). */
  readonly minPlayers: number;
  /** Player cap (people, not phones: spectators and relay headroom are the game's own business). */
  readonly maxPlayers: number;
  readonly status: GameStatus;
}

export const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SHORT_DESCRIPTION_MAX = 160;
export const LONG_DESCRIPTION_MAX = 1200;
export const IMAGE_EXTENSIONS: readonly string[] = ['.svg', '.png', '.jpg', '.jpeg', '.webp'];
/** Link-preview crawlers don't render SVG. */
export const SHARE_IMAGE_EXTENSIONS: readonly string[] = ['.png', '.jpg', '.jpeg', '.webp'];
/** The image fields, each with the extensions it accepts. */
export const IMAGE_FIELDS = {
  image: IMAGE_EXTENSIONS,
  shareImage: SHARE_IMAGE_EXTENSIONS,
} as const satisfies Record<string, readonly string[]>;
