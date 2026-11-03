// Host networking (SPEC §15.6): the relay host client (`maxPlayers` 8: the game caps at 6 and keeps
// headroom for a rejoin under a new id) feeding the session (party bridge, input, intents, sync).
import { relayUrl } from '@pcg/game-kit';
import { createHostClient, type HostClient } from '@pcg/net-client';
import { GAME_ID } from '../../shared/messages';
import { createSession, type Session, type SessionDeps } from './session';

export { PhoneInputSource, tupleToInput, INPUT_STALE_MS } from './input';
export { createSession, MAX_PARTY, type Session, type SessionDeps } from './session';
export * from './views';

/** Relay room size (§15.6). */
export const RELAY_MAX_PLAYERS = 8;

export function createRelayClient(): HostClient {
  return createHostClient({
    url: relayUrl(import.meta.env.VITE_RELAY_URL as string | undefined),
    game: GAME_ID,
    maxPlayers: RELAY_MAX_PLAYERS,
  });
}

/** Wires a host client to a new session; returns the session and an unsubscribe. */
export function connectSession(
  client: HostClient,
  deps: Omit<SessionDeps, 'send' | 'kick'>,
): { session: Session; off: () => void } {
  const session = createSession({
    ...deps,
    send: (msg, to) => client.send(msg, to),
    kick: (id) => client.kick(id),
  });
  const offs = [
    client.onMessage((from, data) => session.handleMessage(from, data)),
    client.onPeer((c) => session.handlePeer(c)),
  ];
  return { session, off: () => offs.forEach((o) => o()) };
}
