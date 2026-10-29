// Art the overlay draws as DOM: the icon sprite, class portraits (color mask) and enemy portraits
// stacked from a rig's side-view parts. Vite resolves the files; this is the only Vite-specific module.
import iconSprite from '../../../generated/neon-knights/icons.svg?raw';
import type { ClassId, EnemyId } from '../../shared/ids';
import { CLASS_RIG, ENEMY_RIG } from './labels';

const urls = (g: Record<string, unknown>) => g as Record<string, string>;

const portraitUrls = urls(
  import.meta.glob('../../../generated/neon-knights/portraits/*.svg', {
    query: '?url',
    import: 'default',
    eager: true,
  }),
);
const partUrls = urls(
  import.meta.glob('../../../art/neon-knights/enemies/*/side/*.svg', {
    query: '?url',
    import: 'default',
    eager: true,
  }),
);
const rigDefs = import.meta.glob('../../../art/neon-knights/rigs/*.json', {
  import: 'default',
  eager: true,
}) as Record<
  string,
  {
    viewBox: [number, number, number, number];
    views: { side?: { order: string[] } };
    optional?: Record<string, string[]>;
  }
>;

export const ICON_SPRITE: string = iconSprite;

/** Front-view portrait files for a class: white-body image and the player-color mask. */
export function portraitFiles(classId: ClassId): { body: string; mask: string } {
  const rig = CLASS_RIG[classId];
  return {
    body: portraitUrls[`../../../generated/neon-knights/portraits/${rig}-body.svg`] ?? '',
    mask: portraitUrls[`../../../generated/neon-knights/portraits/${rig}-mask.svg`] ?? '',
  };
}

/** Side-view part images of an enemy's base form, back to front. All parts share the rig viewBox. */
export function enemyParts(enemy: EnemyId): { urls: string[]; ratio: number } {
  const rig = ENEMY_RIG[enemy];
  const def = rigDefs[`../../../art/neon-knights/rigs/${rig}.json`];
  if (!def?.views.side) return { urls: [], ratio: 1 };
  const hidden = new Set(Object.values(def.optional ?? {}).flat());
  const list = def.views.side.order
    .filter((p) => !hidden.has(p))
    .map((p) => partUrls[`../../../art/neon-knights/enemies/${rig}/side/${p}.svg`])
    .filter((u): u is string => !!u);
  return { urls: list, ratio: def.viewBox[2] / def.viewBox[3] };
}
