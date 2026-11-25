// Lobby roster (SPEC §6.18): phones that sent their name, in join order. A phone inside its reconnect
// window keeps its spot; `left` (or a kick) removes it. Plain TS, no DOM or relay imports.
import type { PeerChange } from '@pcg/net-client';
import { cleanName } from '../shared/messages';

export interface RosterPlayer {
  id: string;
  name: string;
}

export interface Roster {
  /** A phone's join message; returns the cleaned name, or null if it was empty. */
  join(id: string, rawName: string): string | null;
  peer(change: Pick<PeerChange, 'event' | 'playerId'>): void;
  players(): RosterPlayer[];
}

export function createRoster(): Roster {
  const byId = new Map<string, RosterPlayer>();
  return {
    join(id, rawName) {
      const name = cleanName(rawName);
      if (!name) return null;
      const existing = byId.get(id);
      if (existing) existing.name = name;
      else byId.set(id, { id, name });
      return name;
    },
    peer({ event, playerId }) {
      if (event === 'left') byId.delete(playerId);
    },
    players: () => [...byId.values()].map((p) => ({ ...p })),
  };
}
