// Art lookups for the phone (SPEC §6.17): item icons by item id and the merchant face, as plain URLs
// (`?no-inline`, so the 40-odd SVGs never land in play.html's JS; check:bundle). The files are inputs
// and are never edited (BUILD_PLAN §4). A missing icon gets a dev-only text fallback in ui.ts.
import merchantFace from '../../art/forum/ui/merchant-face.svg?no-inline';

const icons = import.meta.glob<string>('../../art/forum/items/*/*.svg', {
  query: '?no-inline',
  import: 'default',
  eager: true,
});

const byId = new Map<string, string>(
  Object.entries(icons).map(([path, url]) => [path.slice(path.lastIndexOf('/') + 1, -4), url]),
);

/** URL of an item's icon, or undefined when the art is missing. */
export function itemIconUrl(id: string): string | undefined {
  return byId.get(id);
}

export const MERCHANT_FACE_URL: string = merchantFace;
