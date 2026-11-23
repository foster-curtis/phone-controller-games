// The TV's aim preview geometry (SPEC §10.1, §15.2; C3): a player's attack hit shape from the same
// effective stats the sim fires with (`attackStat` with the registry's effects and the run's stat
// caps), so content tuning and cards move the preview with the hit area. Pure on the player.
// RD3: the thrown-build preview (§7.3): the landing point the sim would use (builds/landing.ts, one
// source for both), the build's effect radius and the knight's throw range.
import type { Content } from '../../content';
import type { BuildDef, KnightDef, MapDef, RulesDef, Vec2 } from '../../content/types';
import type { BuildId } from '../../shared/ids';
import { throwLanding, type LandingArea } from './builds/landing';
import { hitShape, type HitShape } from './classes/hitShape';
import { cleanVec } from './geometry';
import { effects } from './registry';
import { attackStat, type Caps } from './stats';
import type { PlayerEnt } from './types';

export function aimPreview(
  p: PlayerEnt,
  def: KnightDef,
  slot: 'main' | 'super',
  rules: Pick<RulesDef, 'statCaps'> | null,
): HitShape {
  const caps = (rules?.statCaps ?? {}) as Caps;
  return hitShape(def[slot], (b, st) => attackStat(p, b, st, slot, effects, caps));
}

/** A build's effect radius through its owner's cards (a mine's blast on the TV, RD7). */
export function buildEffectRadius(
  owner: PlayerEnt | undefined,
  def: BuildDef,
  content: Pick<Content, 'rules'>,
): number {
  if (!owner) return def.radius;
  const caps = (content.rules?.statCaps ?? {}) as Caps;
  return attackStat(owner, def.radius, 'buildRadius', 'build', effects, caps);
}

/** The Field Medic circle's radius with his cards (Wide Aura); null when he doesn't own the card. */
export function fieldMedicRadius(p: PlayerEnt, content: Content): number | null {
  if ((p.cards.field_medic ?? 0) <= 0 || !content.rules) return null;
  const base = content.cards.find((c) => c.id === 'field_medic')?.module?.params?.radius;
  if (typeof base !== 'number') return null;
  return attackStat(p, base, 'auraRadius', undefined, effects, content.rules.statCaps as Caps);
}

/** A thrown build's aim preview (§7.3, §10.1): drawn as 0.6 ground ellipses on the TV. */
export interface BuildPreview {
  kind: BuildId;
  /** The knight's feet (tiles). */
  from: Vec2;
  /** Where the build would land on release: within `range`, on the field, outside the Citadel. */
  landing: Vec2;
  /** The build's effect radius (`buildRadius`): the field, heal area or flag ring. */
  radius: number;
  /** The knight's maximum throw range (`throwRange`), around `from`. */
  range: number;
}

const areas = new WeakMap<MapDef, LandingArea>();

/** The playfield and the Citadel's footprint, from the map's tiles (as the sim builds it). */
function areaOf(map: MapDef): LandingArea {
  const hit = areas.get(map);
  if (hit) return hit;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (let r = 0; r < map.rows; r++) {
    for (let c = 0; c < map.cols; c++) {
      if (map.legend[map.tiles[r]![c]!] !== 'citadel') continue;
      x0 = Math.min(x0, c);
      y0 = Math.min(y0, r);
      x1 = Math.max(x1, c + 1);
      y1 = Math.max(y1, r + 1);
    }
  }
  const area = { cols: map.cols, rows: map.rows, citadel: { x0, y0, x1, y1 } };
  areas.set(map, area);
  return area;
}

/**
 * The preview for `p`'s thrown build while it aims (`aim`, default the live `p.buildAim`); null when
 * not aiming, or when the knight's build isn't thrown (at-feet builds go down where he stands).
 */
export function buildPreview(
  p: PlayerEnt,
  content: Content,
  aim: Vec2 | null = p.buildAim,
): BuildPreview | null {
  if (aim === null || !content.map || !content.rules) return null;
  const knight = content.knights.find((k) => k.id === p.classId);
  const def = knight ? content.builds.find((b) => b.id === knight.build) : undefined;
  if (!def || def.input !== 'aimed' || !def.throw) return null;
  const caps = content.rules.statCaps as Caps;
  const stat = (base: number, st: 'throwRange' | 'buildRadius') =>
    attackStat(p, base, st, 'build', effects, caps);
  const from = { x: p.x, y: p.y };
  const range = stat(def.throw.range, 'throwRange');
  const landing = throwLanding(
    from,
    cleanVec(aim.x, aim.y),
    range,
    def.bodyRadius,
    areaOf(content.map),
  );
  return { kind: def.id, from, landing, radius: stat(def.radius, 'buildRadius'), range };
}
