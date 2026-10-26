// Player key (relay SPEC §3): random, kept in localStorage, scoped to (game, room code).
import type { StorageLike } from './api';
import type { RoomCode } from './protocol';

/** Used when storage is missing or throws, so the key stays stable for this page's lifetime. */
const memoryKeys = new Map<string, string>();

export function playerKeyStorageKey(code: RoomCode, game?: string): string {
  return game === undefined ? `pcg:playerKey:${code}` : `pcg:playerKey:${game}:${code}`;
}

export function getPlayerKeyImpl(code: RoomCode, storage?: StorageLike, game?: string): string {
  const key = playerKeyStorageKey(code, game);
  const store = storage ?? defaultStorage('localStorage');
  const stored = safeGet(store, key);
  if (stored) return stored;
  const fresh = memoryKeys.get(key) ?? randomId();
  memoryKeys.set(key, fresh);
  safeSet(store, key, fresh);
  return fresh;
}

/** 128-bit hex id. `crypto.getRandomValues` works on insecure (LAN http) origins, unlike `randomUUID`. */
export function randomId(): string {
  const bytes = new Uint8Array(16);
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// ---- storage helpers (storage can be missing or throw, e.g. Safari private mode) ----

export function defaultStorage(name: 'localStorage' | 'sessionStorage'): StorageLike | undefined {
  try {
    return (globalThis as Partial<Record<typeof name, StorageLike>>)[name];
  } catch {
    return undefined;
  }
}

export function safeGet(storage: StorageLike | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function safeSet(storage: StorageLike | undefined, key: string, value: string): void {
  try {
    storage?.setItem(key, value);
  } catch {
    // ignore: the value just won't survive a reload
  }
}

export function safeRemove(storage: StorageLike | undefined, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // ignore
  }
}
