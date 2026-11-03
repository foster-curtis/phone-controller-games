// localStorage helpers that never throw (private mode, blocked storage, quota).
import type { StorageLike } from '@pcg/net-client';

export function defaultStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function readStored(
  key: string,
  storage: StorageLike | undefined = defaultStorage(),
): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeStored(
  key: string,
  value: string,
  storage: StorageLike | undefined = defaultStorage(),
): void {
  try {
    storage?.setItem(key, value);
  } catch {
    /* private mode / quota */
  }
}
