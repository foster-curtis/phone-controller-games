// Thieves' Forum's catalog entry (@pcg/catalog; PLATFORM decision #9). The single source for its title
// and player range: game code imports the named constants (so phones don't bundle the
// descriptions), the gallery reads the default export. Checked at build by `catalogCheck()`.
import type { GameMeta } from '@pcg/catalog';

export const title = "Thieves' Forum";
/** SPEC §6.1: 2–8 players, no bots. */
export const minPlayers = 2;
export const maxPlayers = 8;

export default {
  id: 'thieves-forum',
  title,
  // DRAFT copy, pending Foster's review.
  shortDescription:
    "Blend into a busy Roman market, swipe gold from stalls and purses, and catch the other thieves in the act. Just don't get caught yourself.",
  // DRAFT copy, pending Foster's review.
  longDescription: `Everyone is a shopper in a crowded Roman forum, and nobody else knows which one is you. Your phone shows your outfit; the TV shows the whole market, packed with shoppers, merchants and a guard on patrol.

Swipe goods from a counter while the merchant's back is turned, lift coins from a passing purse, toss a coin to send a merchant off to fetch it, or just buy low and sell high. But every sneaky move might give you away, so keep one eye on the TV. Spot another thief mid-swipe and grab them for their purse, or quietly tip off the guard and stay hidden. After three rounds, the richest thief wins.`,
  image: 'catalog/card.jpg',
  shareImage: 'catalog/share.webp',
  minPlayers,
  maxPlayers,
  status: 'hidden',
} satisfies GameMeta;
