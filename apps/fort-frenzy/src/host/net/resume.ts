// Resume snapshot storage (SPEC §11.5, §15.8): `localStorage` key `fort-frenzy:run`, so a snapshot
// survives a browser crash. The sim builds and parses snapshots (`sim/snapshot.ts`); this is only the
// I/O, with storage failures swallowed (private mode, quota): a lost snapshot only costs a resume.
import type { StorageLike } from '@pcg/net-client';
import { parseSnapshot, SNAPSHOT_KEY, type RunSnapshot } from '../sim';

/** Build-phase changes are saved at most this often (§15.8 debounce). */
export const SAVE_DEBOUNCE_MS = 250;

export interface SnapshotStore {
  /** The stored snapshot, or null (missing, another version, older than 12 h: then it's removed). */
  load(now: number): RunSnapshot | null;
  save(snap: RunSnapshot): void;
  clear(): void;
}

function defaultStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function localSnapshotStore(
  storage: StorageLike | undefined = defaultStorage(),
): SnapshotStore {
  const store: SnapshotStore = {
    load(now) {
      let raw: string | null;
      try {
        raw = storage?.getItem(SNAPSHOT_KEY) ?? null;
      } catch {
        return null;
      }
      const snap = parseSnapshot(raw, now);
      if (raw !== null && !snap) store.clear();
      return snap;
    },
    save(snap) {
      try {
        storage?.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
      } catch {
        /* quota or private mode */
      }
    },
    clear() {
      try {
        storage?.removeItem(SNAPSHOT_KEY);
      } catch {
        /* private mode */
      }
    },
  };
  return store;
}

/** In-memory store (tests, and the TV when storage is off). */
export function memorySnapshotStore(initial: string | null = null): SnapshotStore & {
  raw(): string | null;
} {
  let raw = initial;
  const mem: StorageLike = {
    getItem: () => raw,
    setItem: (_k, v) => {
      raw = v;
    },
    removeItem: () => {
      raw = null;
    },
  };
  return { ...localSnapshotStore(mem), raw: () => raw };
}
