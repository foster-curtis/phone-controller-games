// The photographer's local photos (SPEC §6.4, §7.4): every shot is kept as an object URL for this
// phone's review screen, which never downloads photos back from the host. Only the latest round is
// kept; an older round's URLs are revoked when a new round id shows up.

export interface PhotoStoreEnv {
  createUrl?: (blob: Blob) => string;
  revokeUrl?: (url: string) => void;
}

export interface PhotoStore {
  /** Stores photo `photo` of round `r` (drops older rounds). */
  put(r: number, photo: number, blob: Blob): void;
  url(r: number, photo: number): string | null;
  /** Forgets every round other than `r`. */
  keepOnly(r: number): void;
  clear(): void;
}

export function createPhotoStore(env: PhotoStoreEnv = {}): PhotoStore {
  const createUrl = env.createUrl ?? ((b: Blob) => URL.createObjectURL(b));
  const revokeUrl = env.revokeUrl ?? ((u: string) => URL.revokeObjectURL(u));
  const rounds = new Map<number, Map<number, string>>();

  function keepOnly(r: number): void {
    for (const [round, photos] of rounds) {
      if (round === r) continue;
      for (const u of photos.values()) revokeUrl(u);
      rounds.delete(round);
    }
  }

  return {
    put(r, photo, blob) {
      keepOnly(r);
      let photos = rounds.get(r);
      if (!photos) rounds.set(r, (photos = new Map()));
      const old = photos.get(photo);
      if (old) revokeUrl(old);
      photos.set(photo, createUrl(blob));
    },
    url: (r, photo) => rounds.get(r)?.get(photo) ?? null,
    keepOnly,
    clear: () => keepOnly(-1),
  };
}
