// Relay wiring (SPEC §12.5, §12.1 `host/net`): the TV's host client under game ID `thieves-forum`,
// and the phone input store. TF12 adds the `handlers/*.ts` and `context/*.ts` registries here.
import { relayUrl } from '@pcg/game-kit';
import { createHostClient, type HostClient } from '@pcg/net-client';
import { GAME_ID, MAX_PLAYERS } from '../../shared/messages';

export { createInputStore, type InputStore } from './inputs';

export function createRelayClient(): HostClient {
  return createHostClient({
    url: relayUrl(import.meta.env.VITE_RELAY_URL),
    game: GAME_ID,
    maxPlayers: MAX_PLAYERS,
  });
}
