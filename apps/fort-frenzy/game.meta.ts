// Fort Frenzy's catalog entry (@pcg/catalog; PLATFORM decision #9). The single source for its title
// and player range: game code imports the named constants (so phones don't bundle the
// descriptions), the gallery reads the default export. Checked at build by `catalogCheck()`.
import type { GameMeta } from '@pcg/catalog';

export const title = 'Fort Frenzy';
/** SPEC §11.1, §12: 2–6 players. */
export const minPlayers = 2;
export const maxPlayers = 6;

export default {
  id: 'fort-frenzy',
  title,
  // DRAFT copy, pending Foster's review.
  shortDescription:
    'Team up to defend your citadel from 15 waves of a robot army. Pick a knight, build turrets and walls, and bring down the giant Colossus.',
  // DRAFT copy, pending Foster's review.
  longDescription: `The Iron Tide is marching on your citadel, and your team is all that stands in its way. Each player picks a knight: the Ranger with a long-range rail-bow, the Warden with a gravity hammer, the Artificer who heals the team and hauls supplies, or the Commander leading a squad of automaton footmen. Between waves you pick upgrade cards, spend the team's coins and build turrets, walls and traps right where you stand. Then the drones, mechs and swarms pour in, and it's all action.

Every class helps and none is required, so any mix of friends can win. Call out threats, run power cells back to patch up the walls, and survive three fights with the Colossus to win the run, which takes about 25 minutes.`,
  image: 'catalog/card.svg',
  minPlayers,
  maxPlayers,
  status: 'live',
} satisfies GameMeta;
