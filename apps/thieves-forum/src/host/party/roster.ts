// Lobby roster (SPEC §6.18): phones that sent their name, in join order. A phone inside its reconnect
// window keeps its spot; `left` (or a kick) removes it. Moved from `host/roster.ts` (TF10).
// Extraction-ready (party/ lint): no game or relay imports, so the name cleaner is a parameter.

export interface RosterPlayer {
  id: string;
  name: string;
}

/** A relay peer change, structurally the same as net-client's `PeerChange`. */
export interface RosterPeerChange {
  event: 'joined' | 'left' | 'rejoined';
  playerId: string;
}

export interface Roster {
  /** A phone's join message; returns the cleaned name, or null if it was empty. */
  join(id: string, rawName: string): string | null;
  peer(change: RosterPeerChange): void;
  players(): RosterPlayer[];
}

/** Trims and collapses whitespace (the game passes its own capped cleaner). */
const defaultClean = (raw: string): string => raw.replace(/\s+/g, ' ').trim();

export function createRoster(clean: (raw: string) => string = defaultClean): Roster {
  const byId = new Map<string, RosterPlayer>();
  return {
    join(id, rawName) {
      const name = clean(rawName);
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
