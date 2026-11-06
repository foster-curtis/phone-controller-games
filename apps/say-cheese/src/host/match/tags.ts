// Tag validation (SPEC §6.4, §7.3, decisions #4, #14). The host is authoritative: the photo must
// exist, the target must be a current non-spectator seat other than the photographer, and a player is
// tagged at most once per photo. The caller checks the sender (photographer's phone) and the phase.
import type { SeatId } from '../../shared/seats';
import type { Player, Round } from './types';

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);

/** A seat that can be tagged this round. */
export function taggable(players: readonly Player[], round: Round, id: SeatId): boolean {
  return players.some((p) => p.id === id && !p.left && !p.spectator && p.id !== round.photographer);
}

export interface TagInput {
  photo: number;
  tagId: string;
  x: number;
  y: number;
  playerId: SeatId | null;
}

/** Adds or changes a tag; false (nothing changed) when invalid. */
export function applyTag(round: Round, players: readonly Player[], t: TagInput): boolean {
  if (!round.photos.some((p) => p.index === t.photo && p.url !== undefined)) return false;
  if (t.playerId !== null) {
    if (!taggable(players, round, t.playerId)) return false;
    const dup = round.tags.some(
      (o) => o.photo === t.photo && o.playerId === t.playerId && o.tagId !== t.tagId,
    );
    if (dup) return false;
  }
  const tag = {
    tagId: t.tagId,
    photo: t.photo,
    x: clamp01(t.x),
    y: clamp01(t.y),
    playerId: t.playerId,
  };
  const at = round.tags.findIndex((o) => o.photo === t.photo && o.tagId === t.tagId);
  if (at >= 0) round.tags[at] = tag;
  else round.tags.push(tag);
  return true;
}

export function applyUntag(round: Round, photo: number, tagId: string): boolean {
  const before = round.tags.length;
  round.tags = round.tags.filter((o) => !(o.photo === photo && o.tagId === tagId));
  return round.tags.length !== before;
}

/** A removed player's unscored tags go (SPEC §6.3: scored tags stay in the totals). */
export function dropTagsOf(round: Round, id: SeatId): void {
  round.tags = round.tags.filter((o) => o.playerId !== id);
}
