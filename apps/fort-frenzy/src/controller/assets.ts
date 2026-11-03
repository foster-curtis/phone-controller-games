// Theme assets the phone loads as files (SPEC §15.7): the icon sprite (inlined into the page so
// `<use href="#icon-…">` works) and the class portraits. They are `generated/` outputs of `pnpm assets`
// and load outside the JS budget (Vite only inlines the small ones).
import spriteUrl from '../../generated/neon-knights/icons.svg?url';

const portraits = import.meta.glob('../../generated/neon-knights/portraits/*.svg', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>;

/** URL of a portrait layer: `<rig>-body.svg` (color parts white) or `<rig>-mask.svg` (for the tint). */
export function portraitUrl(rig: string, layer: 'body' | 'mask'): string {
  const hit = Object.entries(portraits).find(([path]) => path.endsWith(`/${rig}-${layer}.svg`));
  return hit ? hit[1] : '';
}

/** Fetches the sprite and mounts it hidden in the body. Safe to fail (icons just stay blank). */
export async function loadIconSprite(doc: Document = document): Promise<void> {
  try {
    const res = await fetch(spriteUrl);
    if (!res.ok) return;
    const holder = doc.createElement('div');
    holder.id = 'icon-sprite';
    holder.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
    holder.innerHTML = await res.text();
    doc.body.prepend(holder);
  } catch {
    /* offline: the app works without glyphs */
  }
}
