// Seats: several players on one phone (SPEC §6.3.1). The relay sees one connection per phone; the
// host splits it into seats. No game imports: extraction-ready for `controller-kit` (BUILD_PLAN §8).
// Frozen at SC0 (BUILD_PLAN §3): additive changes only.

/** Host-side player id: the relay `playerId` plus the phone-local seat index, e.g. `p3#1`. */
export type SeatId = `${string}#${number}`;

/** One player on a phone. Seat 0 is the phone's first player; its key is the relay `playerKey`. */
export interface Seat {
  /** Phone-local index, 0-based. */
  seat: number;
  name: string;
  /** Player color id, assigned by the host. */
  color: string;
  /** Stable per-seat key for late rejoin (SPEC §6.3); kept in `localStorage`. */
  seatKey: string;
}

/** `localStorage` key for a phone's seat keys in one room; `<code>` is the room code. */
export const SEAT_KEYS_STORAGE = 'say-cheese:seats:<code>';

export function seatKeysStorageKey(code: string): string {
  return SEAT_KEYS_STORAGE.replace('<code>', code);
}

export function seatId(playerId: string, seat: number): SeatId {
  return `${playerId}#${seat}`;
}

/** Splits `p3#1` into its relay player id and seat; null if malformed. */
export function parseSeatId(id: string): { playerId: string; seat: number } | null {
  const at = id.lastIndexOf('#');
  if (at <= 0) return null;
  const seat = Number(id.slice(at + 1));
  if (!Number.isInteger(seat) || seat < 0 || id.slice(at + 1) === '') return null;
  return { playerId: id.slice(0, at), seat };
}
