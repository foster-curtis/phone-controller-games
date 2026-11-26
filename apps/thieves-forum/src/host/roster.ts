// Shim (TF10, SPEC §6.18): the roster moved to `party/roster.ts`. `host/main.ts` (TF7's file this wave)
// still imports it from here; TF12 rewires main.ts and deletes this file (BUILD_PLAN §8).
import { cleanName } from '../shared/messages';
import { createRoster as createPartyRoster, type Roster } from './party';

export type { Roster, RosterPlayer } from './party';

export const createRoster = (): Roster => createPartyRoster(cleanName);
