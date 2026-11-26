// Item icon URLs for the TV reveal cards (SPEC §6.14, §6.21): the delivered `art/forum/items/**` SVGs,
// read as files (never edited), keyed by `ItemDef.icon` ("items/<shop>/<id>.svg").
import { item as itemDef } from '../../content';
import type { ItemId } from '../../content/types';

const URLS = import.meta.glob<string>('../../../art/forum/items/*/*.svg', {
  query: '?url',
  import: 'default',
  eager: true,
});

/** The icon URL for an item, or null when the art is missing (the card then shows the name). */
export function itemIconUrl(id: ItemId): string | null {
  const def = itemDef(id);
  return URLS[`../../../art/forum/${def.icon}`] ?? null;
}

export function itemName(id: ItemId): string {
  return itemDef(id).name;
}
