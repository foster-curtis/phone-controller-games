// Roster: player records, profiles (name/color), player-key lookup, standings.
import { PLAYER_COLOR_IDS, type PlayerColorId, type Standing } from '../../shared/messages';
import { NAME_MAX } from './config';

export interface PlayerRecord {
  /** Current relay player id (changes on a late rejoin). */
  id: string;
  playerKey: string;
  name: string;
  color: PlayerColorId | null;
  score: number;
  connected: boolean;
  left: boolean;
  spectating: boolean;
  selfPaused: boolean;
  /** Knocked out this round (eliminated or ghost). */
  eliminated: boolean;
  ghost: boolean;
  /** ms until the ghost spawns while eliminated (display only; the sim owns the delay). */
  respawnMs: number;
  joinIndex: number;
}

export function defaultName(joinIndex: number): string {
  return `Egg ${joinIndex + 1}`;
}

/** Trim, cap at NAME_MAX characters (code points); empty → "Egg N". */
export function sanitizeName(raw: string, joinIndex: number): string {
  const name = Array.from(raw.trim()).slice(0, NAME_MAX).join('').trim();
  return name === '' ? defaultName(joinIndex) : name;
}

export class Roster {
  /** Every player in this match, in join order (left players included). */
  readonly players: PlayerRecord[] = [];
  /** Current and former ids → record (old ids keep owning eggs left on the pan). */
  private readonly byId = new Map<string, PlayerRecord>();
  nextJoinIndex = 0;

  get(id: string): PlayerRecord | undefined {
    return this.byId.get(id);
  }

  /** The record whose *current* id is `id`. */
  current(id: string): PlayerRecord | undefined {
    const p = this.byId.get(id);
    return p && p.id === id ? p : undefined;
  }

  byKey(playerKey: string): PlayerRecord | undefined {
    return this.players.find((p) => p.playerKey === playerKey);
  }

  add(id: string, playerKey: string, opts: Partial<PlayerRecord> = {}): PlayerRecord {
    const joinIndex = opts.joinIndex ?? this.nextJoinIndex;
    this.nextJoinIndex = Math.max(this.nextJoinIndex, joinIndex + 1);
    const p: PlayerRecord = {
      id,
      playerKey,
      name: defaultName(joinIndex),
      color: null,
      score: 0,
      connected: true,
      left: false,
      spectating: false,
      selfPaused: false,
      eliminated: false,
      ghost: false,
      respawnMs: 0,
      ...opts,
      joinIndex,
    };
    if (!opts.color) p.color = this.firstFreeColor();
    this.players.push(p);
    this.players.sort((a, b) => a.joinIndex - b.joinIndex);
    this.byId.set(id, p);
    return p;
  }

  /** Point a record at a new relay id; the old id still resolves to it. */
  reassign(p: PlayerRecord, newId: string): void {
    p.id = newId;
    this.byId.set(newId, p);
  }

  remove(p: PlayerRecord): void {
    const i = this.players.indexOf(p);
    if (i >= 0) this.players.splice(i, 1);
    for (const [id, rec] of this.byId) if (rec === p) this.byId.delete(id);
  }

  /** Colors held by players other than `except` (left players keep theirs for the match). */
  takenColors(except?: PlayerRecord): PlayerColorId[] {
    const taken = new Set<PlayerColorId>();
    for (const p of this.players) if (p !== except && p.color) taken.add(p.color);
    return PLAYER_COLOR_IDS.filter((c) => taken.has(c));
  }

  firstFreeColor(): PlayerColorId | null {
    const taken = this.takenColors();
    return PLAYER_COLOR_IDS.find((c) => !taken.includes(c)) ?? null;
  }

  /** Applies the name; the color only if no one else holds it. Returns whether the color was taken. */
  setProfile(p: PlayerRecord, name: string, color: PlayerColorId): { colorAccepted: boolean } {
    p.name = sanitizeName(name, p.joinIndex);
    if (p.color === color) return { colorAccepted: true };
    if (this.takenColors(p).includes(color)) return { colorAccepted: false };
    p.color = color;
    return { colorAccepted: true };
  }

  /** Connected, not left: who counts toward Start and gets an egg. */
  eligible(): PlayerRecord[] {
    return this.players.filter((p) => p.connected && !p.left);
  }
}

/** Highest score first; ties by join order. */
export function standings(players: readonly PlayerRecord[]): Standing[] {
  return [...players]
    .sort((a, b) => b.score - a.score || a.joinIndex - b.joinIndex)
    .map((p) => ({
      playerId: p.id,
      name: p.name,
      color: p.color ?? PLAYER_COLOR_IDS[0],
      score: p.score,
      connected: p.connected,
      left: p.left,
    }));
}
