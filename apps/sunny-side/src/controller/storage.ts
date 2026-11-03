// localStorage helpers (the last-used name prefills the lobby, SPEC §6.3). Never throws.
import { defaultStorage, readStored, writeStored } from '@pcg/controller-kit';
import type { StorageLike } from '@pcg/net-client';

export const NAME_KEY = 'sunny-side:name';
export const MAX_NAME_LENGTH = 10;

export function loadName(storage: StorageLike | undefined = defaultStorage()): string {
  return readStored(NAME_KEY, storage) ?? '';
}

export function saveName(name: string, storage: StorageLike | undefined = defaultStorage()): void {
  writeStored(NAME_KEY, name, storage);
}
