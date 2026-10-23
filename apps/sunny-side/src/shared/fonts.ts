// Waits for the brand web fonts (Google Fonts, linked in each page's <head>) before Phaser draws text.
// Frozen at F0.
import { theme } from './theme';

/** CSS `font` shorthands for every family/weight pair the type scale uses. */
export const BRAND_FONT_FACES: readonly string[] = [
  ...new Set(Object.values(theme.type).map((s) => `${s.weight} 1em ${s.family.split(',')[0]}`)),
];

/**
 * Resolves `true` once every brand face has loaded, or `false` on timeout, on a load error, or when
 * `document.fonts` is unavailable (fallback stacks are used). Never rejects.
 */
export function loadBrandFonts(
  timeoutMs = 3000,
  fonts: FontFaceSet | undefined = globalThis.document?.fonts,
): Promise<boolean> {
  if (!fonts || typeof fonts.load !== 'function') return Promise.resolve(false);
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => resolve(false), timeoutMs);
    let loads: Promise<FontFace[]>[];
    try {
      loads = BRAND_FONT_FACES.map((face) => fonts.load(face));
    } catch {
      clearTimeout(timer);
      resolve(false);
      return;
    }
    Promise.all(loads).then(
      (results) => {
        clearTimeout(timer);
        resolve(results.every((faces) => faces.length > 0));
      },
      () => {
        clearTimeout(timer);
        resolve(false);
      },
    );
  });
}
