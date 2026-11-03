// Seat model (SPEC §6.3.1): seat ids, per-phone seat lists, the room seat cap, color assignment and
// the controller's seat-key store. No game imports: extraction-ready for `controller-kit`
// (BUILD_PLAN §8). Behavior frozen at SC2 (BUILD_PLAN §3): additive changes only.
import { seatKeysStorageKey } from './types';

export * from './types';

/** Anything the host keeps per seat: which phone holds it, its phone-local index and color. */
export interface SeatHolder {
  phoneId: string;
  seat: number;
  color: string;
  /** Left / removed seats free their slot and color. */
  left?: boolean;
}

const active = <T extends SeatHolder>(list: readonly T[]): T[] => list.filter((s) => !s.left);

/** One phone's active seats, by seat index. */
export function seatsOf<T extends SeatHolder>(list: readonly T[], phoneId: string): T[] {
  return active(list)
    .filter((s) => s.phoneId === phoneId)
    .sort((a, b) => a.seat - b.seat);
}

/** Active seats grouped per phone, in first-appearance order. */
export function seatsByPhone<T extends SeatHolder>(list: readonly T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const s of active(list)) {
    const seats = out.get(s.phoneId);
    if (seats) seats.push(s);
    else out.set(s.phoneId, [s]);
  }
  for (const seats of out.values()) seats.sort((a, b) => a.seat - b.seat);
  return out;
}

/** Lowest seat index this phone isn't using. */
export function nextSeatIndex(list: readonly SeatHolder[], phoneId: string): number {
  const taken = new Set(seatsOf(list, phoneId).map((s) => s.seat));
  let i = 0;
  while (taken.has(i)) i++;
  return i;
}

/** Room below the seat cap (seats count across every phone, SPEC §6.3.1). */
export function hasRoom(list: readonly SeatHolder[], cap: number): boolean {
  return active(list).length < cap;
}

/** Lowest palette color no active seat uses; null when all are taken. */
export function pickColor<C extends string>(
  list: readonly SeatHolder[],
  palette: readonly C[],
): C | null {
  const used = new Set(active(list).map((s) => s.color));
  return palette.find((c) => !used.has(c)) ?? null;
}

// ---- controller side ----

/** Structural `Storage` subset (net-client's `StorageLike`, without importing it). */
export interface SeatStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** One seat a phone remembers for a room (late rejoin restores every seat, SPEC §6.3.1). */
export interface StoredSeat {
  seat: number;
  seatKey: string;
  name: string;
}

export interface SeatKeyStore {
  load(): StoredSeat[];
  save(seats: readonly StoredSeat[]): void;
  /** Adds or replaces the entry for `seat.seat`. */
  add(seat: StoredSeat): void;
  remove(seat: number): void;
}

const isStoredSeat = (v: unknown): v is StoredSeat => {
  if (typeof v !== 'object' || v === null) return false;
  const s = v as Record<string, unknown>;
  return (
    Number.isInteger(s.seat) &&
    (s.seat as number) >= 0 &&
    typeof s.seatKey === 'string' &&
    s.seatKey !== '' &&
    typeof s.name === 'string'
  );
};

/** Seat keys for one room in `localStorage`; never throws (private mode, quota, junk). */
export function createSeatKeyStore(storage: SeatStorage | undefined, code: string): SeatKeyStore {
  const key = seatKeysStorageKey(code);
  const load = (): StoredSeat[] => {
    try {
      const raw = storage?.getItem(key);
      const v: unknown = raw ? JSON.parse(raw) : [];
      return Array.isArray(v) ? v.filter(isStoredSeat).sort((a, b) => a.seat - b.seat) : [];
    } catch {
      return [];
    }
  };
  const save = (seats: readonly StoredSeat[]): void => {
    try {
      if (seats.length === 0) storage?.removeItem(key);
      else storage?.setItem(key, JSON.stringify(seats));
    } catch {
      // Storage blocked: late rejoin just won't restore extra seats.
    }
  };
  return {
    load,
    save,
    add(seat) {
      save([...load().filter((s) => s.seat !== seat.seat), seat].sort((a, b) => a.seat - b.seat));
    },
    remove(seat) {
      save(load().filter((s) => s.seat !== seat));
    },
  };
}
