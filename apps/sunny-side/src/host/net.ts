// HostClient ↔ match wiring: relay peers/messages/room → match; match screens/kicks → relay.
// The net layer also stamps `leaderName` on every screen (SPEC §6.5 "Waiting for {leader}…").
import type { HostClient, HostRoom, Unsubscribe } from '@pcg/net-client';
import type { HostMsg, Screen } from '../shared/messages';
import type { Match, MatchDeps } from './match';

/** The slice of HostClient the wiring uses (tests pass a fake). */
export type HostClientLike = Pick<
  HostClient,
  'send' | 'kick' | 'onMessage' | 'onPeer' | 'onRoom' | 'onStatus' | 'code' | 'status'
>;

/** Screens whose non-leader phones show "Waiting for {leader}…"; resent when the leader changes. */
const WAITING_KINDS: ReadonlySet<Screen['kind']> = new Set(['lobby', 'results', 'matchEnd']);
const BROADCAST = '*';

export interface HostNet {
  /** `MatchDeps.send` / `MatchDeps.kick`. */
  readonly deps: Pick<MatchDeps, 'send' | 'kick'>;
  /**
   * Wires the client to the match. `onNewRoom` fires when the relay gave us a *new* room after we
   * already had one (the old room expired while the host was away).
   */
  attach(match: Match, onNewRoom?: (room: HostRoom) => void): Unsubscribe;
}

export function createHostNet(client: HostClientLike): HostNet {
  let leaderName: () => string | null = () => null;
  /** Last screen sent per phone (or broadcast), so a leader change can refresh "Waiting for". */
  const lastScreen = new Map<string, Screen>();

  const sendScreen = (screen: Screen, to?: string) => {
    const msg: HostMsg = { t: 'screen', screen };
    client.send(msg, to);
  };

  const deps: HostNet['deps'] = {
    send(msg, to) {
      if (msg.t !== 'screen') {
        client.send(msg, to);
        return;
      }
      const screen: Screen = { ...msg.screen, leaderName: leaderName() };
      if (to === undefined) lastScreen.clear();
      lastScreen.set(to ?? BROADCAST, screen);
      sendScreen(screen, to);
    },
    kick(playerId) {
      lastScreen.delete(playerId);
      client.kick(playerId);
    },
  };

  // Deferred so the match's own screen sync for the same change goes out first (and wins).
  let refreshQueued = false;
  const queueRefresh = () => {
    if (refreshQueued) return;
    refreshQueued = true;
    queueMicrotask(() => {
      refreshQueued = false;
      refreshLeaderName();
    });
  };

  const refreshLeaderName = () => {
    const name = leaderName();
    for (const [to, screen] of lastScreen) {
      if (!WAITING_KINDS.has(screen.kind) || (screen.leaderName ?? null) === name) continue;
      const next: Screen = { ...screen, leaderName: name };
      lastScreen.set(to, next);
      sendScreen(next, to === BROADCAST ? undefined : to);
    }
  };

  return {
    deps,
    attach(match, onNewRoom) {
      leaderName = () => {
        const view = match.view();
        return view.players.find((p) => p.id === view.leaderId)?.name ?? null;
      };
      let hadRoom = false;
      const offs: Unsubscribe[] = [
        client.onRoom((room) => {
          if (room.reclaimed) match.restore(room.roster);
          else if (hadRoom) onNewRoom?.(room);
          hadRoom = true;
        }),
        client.onPeer((c) => {
          if (c.event === 'joined') match.playerJoined(c.playerId, c.playerKey);
          else if (c.event === 'rejoined') match.playerRejoined(c.playerId, c.playerKey);
          else {
            lastScreen.delete(c.playerId);
            match.playerLeft(c.playerId);
          }
        }),
        client.onMessage((from, data) => match.handleMessage(from, data)),
        match.onEvent((e) => {
          if (e.type === 'leader' || e.type === 'roster') queueRefresh();
        }),
      ];
      return () => {
        for (const off of offs) off();
        leaderName = () => null;
      };
    },
  };
}
