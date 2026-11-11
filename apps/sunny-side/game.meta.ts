// Sunny Side Slam's catalog entry (@pcg/catalog; PLATFORM decision #9). The single source for its
// title and player range: game code imports the named constants (so phones don't bundle the
// descriptions), the gallery reads the default export. Checked at build by `catalogCheck()`.
import type { GameMeta } from '@pcg/catalog';

export const title = 'Sunny Side Slam';
/** SPEC §6.1: 2–8 players (2 is a duel). */
export const minPlayers = 2;
export const maxPlayers = 8;

export default {
  id: 'sunny-side',
  title,
  // DRAFT copy, pending Foster's review.
  shortDescription:
    "You're a fried egg on a skillet that keeps getting hotter. Dash, slam and shove your friends off the pan, and be the last egg standing.",
  // DRAFT copy, pending Foster's review.
  longDescription: `Everyone is a wobbly fried egg on one big skillet, and the edge of the pan is sizzling inward. Steer with your phone, dash into your rivals, or charge up a yolk-first belly flop to send them flying. The last egg on the pan scores big, and every egg you knock off earns you a point too.

Getting knocked out isn't the end. You come back as a puff of steam that drifts over the pan and nudges the survivors toward the edge, so nobody sits out for long. Rounds are quick, the match runs to a target score, and the final showdown, with every ghost in the room meddling, gets loud fast.`,
  image: 'catalog/card.svg',
  minPlayers,
  maxPlayers,
  status: 'live',
} satisfies GameMeta;
