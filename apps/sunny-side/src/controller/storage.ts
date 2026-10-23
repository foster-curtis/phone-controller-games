// localStorage helpers (the last-used name prefills the lobby, SPEC §6.3). Never throws.
import type { StorageLike } from '@pcg/net-client';

export const NAME_KEY = 'sunny-side:name';
export const MAX_NAME_LENGTH = 10;

export function defaultStorage(): StorageLike | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function loadName(storage: StorageLike | undefined = defaultStorage()): string {
  try {
    return storage?.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveName(name: string, storage: StorageLike | undefined = defaultStorage()): void {
  try {
    storage?.setItem(NAME_KEY, name);
  } catch {
    /* private mode / quota */
  }
}
