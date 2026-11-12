// @pcg/catalog public API (PLATFORM §4, decision #9): the game catalog, its schema and launch URLs.
// Browser-safe: nothing here touches the file system. File checks are in `@pcg/catalog/node`, the
// build check in `@pcg/catalog/vite`.

export {
  GAME_STATUSES,
  ID_PATTERN,
  IMAGE_EXTENSIONS,
  IMAGE_FIELDS,
  LONG_DESCRIPTION_MAX,
  SHARE_IMAGE_EXTENSIONS,
  SHORT_DESCRIPTION_MAX,
  type GameMeta,
  type GameStatus,
} from './types.ts';
export { GAMES, gameById, listedGames } from './games.ts';
export { validateGames } from './validate.ts';
export { ROUTING, gameUrl, type Routing } from './url.ts';
export {
  FEEDBACK_ENTRY_IDS,
  FEEDBACK_FORM_URL,
  FEEDBACK_SHORT_URL,
  feedbackUrl,
} from './feedback.ts';
