// Tag sheet options (SPEC §6.4): everyone who can be tagged plus Unknown; a player already tagged in
// this photo is greyed with a ✓ (one tag per player per photo); Remove only on an existing circle. Pure.
import type { PlayerColorId, PlayerSummary, TagView } from '../../shared/messages';

export interface SheetOption {
  /** null = Unknown. */
  playerId: string | null;
  name: string;
  color: PlayerColorId | null;
  /** Already tagged in this photo by another circle. */
  disabled: boolean;
  /** This is the circle's current choice. */
  selected: boolean;
}

export interface TagSheetModel {
  options: SheetOption[];
  /** Remove is offered only when editing an existing circle. */
  canRemove: boolean;
}

export function tagSheetModel(
  candidates: readonly PlayerSummary[],
  tagsOnPhoto: readonly TagView[],
  editing: TagView | null,
): TagSheetModel {
  const taken = new Set(
    tagsOnPhoto.filter((t) => t.tagId !== editing?.tagId && t.playerId).map((t) => t.playerId),
  );
  const options: SheetOption[] = candidates.map((c) => ({
    playerId: c.playerId,
    name: c.name,
    color: c.color,
    disabled: taken.has(c.playerId),
    selected: editing?.playerId === c.playerId,
  }));
  options.push({
    playerId: null,
    name: 'Unknown',
    color: null,
    disabled: false,
    selected: !!editing && editing.playerId === null,
  });
  return { options, canRemove: editing !== null };
}
