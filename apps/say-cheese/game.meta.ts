// Say Cheese!'s catalog entry (@pcg/catalog; PLATFORM decision #9). The single source for its title
// and player range: game code imports the named constants (so phones don't bundle the
// descriptions), the gallery reads the default export. Checked at build by `catalogCheck()`.
import type { GameMeta } from '@pcg/catalog';

export const title = 'Say Cheese!';
/** SPEC §6.1: 3–8 players (people, not phones: several can share one, §6.3.1). */
export const minPlayers = 3;
export const maxPlayers = 8;

export default {
  id: 'say-cheese',
  title,
  // DRAFT copy, pending Foster's review.
  shortDescription:
    "One player snaps photos with their eyes closed while everyone else scrambles to stay out of the shot. Get caught and it'll cost you.",
  // DRAFT copy, pending Foster's review.
  longDescription: `Each round, one player is the photographer. Eyes closed, they spin around the room snapping photos with their phone while everyone else ducks, dives and slips behind each other to stay out of frame. When time runs out, the photos go up on the TV and the whole room reviews them together, while the photographer tags everyone they can spot. Yes, an elbow counts.

Everyone gets one turn behind the camera, and the lowest score wins. No phone? Players can share one, so kids can join in too. Photos stay on the TV for the match and are never uploaded or saved.`,
  image: 'catalog/card.svg',
  minPlayers,
  maxPlayers,
  status: 'live',
} satisfies GameMeta;
