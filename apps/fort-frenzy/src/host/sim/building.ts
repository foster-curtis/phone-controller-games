// Building (SPEC §7, §10.1 row 5 and the build arc, §10.2 ghost): placement validity and placing a
// structure at a player's feet for crates. Fortify (§8) isn't a tile of its own: it attaches to the
// tower beside the builder (a flag on the tower plus a damage-reduction modifier).
import type { Tile } from '../../content/types';
import type { AckReason } from '../../shared/messages';
import type { StructureId } from '../../shared/ids';
import { circleTouchesTile, rectDist, tileRect } from './geometry';
import type { FullState } from './state';
import { refreshStats } from './stats';
import { effects as effectDefs } from './registry';
import type { PlayerEnt, StructureEnt, World } from './types';

/** The tile under a point. */
export function tileAt(x: number, y: number): Tile {
  return [Math.floor(x), Math.floor(y)];
}

/** Kinds Fortify attaches to: the towers (content `fortify.attachesTo`; content.test keeps them equal). */
export const FORTIFIABLE: readonly StructureId[] = ['arrow_tower', 'bomb_tower'];
const attachable = (kind: StructureId) => FORTIFIABLE.includes(kind);

function structureOn(world: World, tile: Tile): StructureEnt | null {
  const [col, row] = tile;
  const { cols, rows, occupant } = world.grid;
  if (col < 0 || row < 0 || col >= cols || row >= rows) return null;
  const id = occupant[row * cols + col]!;
  if (id === 0) return null;
  return world.structures.find((s) => s.id === id) ?? null;
}

/**
 * Where `kind` would go for this player: the tile at their feet, or for Fortify the nearest tower in
 * reach that it can attach to (an unfortified tower first; the feet when there is none, invalid).
 */
export function buildTile(
  world: World,
  kind: StructureId,
  p: PlayerEnt,
  fortifyReach: number,
): Tile {
  const feet = tileAt(p.x, p.y);
  if (kind !== 'fortify') return feet;
  let best: Tile | null = null;
  let bestD = Infinity;
  for (const st of world.structures) {
    if (!attachable(st.kind) || st.fortified || st.hp <= 0) continue;
    const d = rectDist(p.x, p.y, tileRect(st.tile[0], st.tile[1]));
    if (d <= fortifyReach && d < bestD) {
      best = st.tile;
      bestD = d;
    }
  }
  return best ?? feet;
}

/**
 * §7 placement validity: on the map, buildable (open: not a lane entry, the Citadel, the repair zone
 * or the Armory pad), free of other structures; walls and towers (not snares) also need the tile free
 * of enemies and players. The builder's own body doesn't count: they build at their feet and get
 * pushed off (BUILD_PLAN §8, FF6). Flyers pass over structures, so they don't block either.
 * Fortify is valid only on a tile holding a tower that isn't fortified yet (§8).
 */
export function placementValid(
  world: World,
  kind: StructureId,
  tile: Tile,
  builderSlot: number | null,
): boolean {
  const [col, row] = tile;
  const { cols, rows } = world.grid;
  if (col < 0 || row < 0 || col >= cols || row >= rows) return false;
  if (kind === 'fortify') {
    const st = structureOn(world, tile);
    return st !== null && attachable(st.kind) && !st.fortified && st.hp > 0;
  }
  const t = row * cols + col;
  if (world.grid.kinds[t] !== 'open' || world.grid.occupant[t] !== 0) return false;
  if (kind === 'snare') return true;
  for (const e of world.enemies) {
    if (!e.flying && e.hp > 0 && circleTouchesTile(e.x, e.y, e.r, col, row)) return false;
  }
  for (const p of world.players) {
    if (p.slot === builderSlot || p.respawnAt !== null) continue;
    if (circleTouchesTile(p.x, p.y, p.r, col, row)) return false;
  }
  return true;
}

/** Attaches Fortify to the tower on `tile`: the flag and its damage reduction. */
function attachFortify(s: FullState, tile: Tile): StructureEnt {
  const st = structureOn(s.world, tile)!;
  const def = s.cat.structure('fortify');
  st.fortified = true;
  st.mods.push({ id: 'fortify', stats: [{ stat: 'damageReduction', add: def.defense ?? 0 }] });
  refreshStats(st, s.baseStats.get(st.id)!, effectDefs, s.caps);
  return st;
}

/** Builds `kind` at the player's feet (Fortify: on the tower beside them) for crates. */
export function buildAtFeet(s: FullState, p: PlayerEnt, kind: StructureId): AckReason | null {
  const def = s.cat.structure(kind);
  if (!s.cat.character(p.classId).build.includes(kind)) return 'invalid';
  if (p.crates < def.cost) return 'crates';
  const tile = buildTile(s.world, kind, p, s.cat.rules.fortifyReach);
  if (!placementValid(s.world, kind, tile, p.slot)) return 'invalid';
  const st = kind === 'fortify' ? attachFortify(s, tile) : s.placeStructure(kind, ...tile, p.slot);
  p.crates -= def.cost;
  p.lastBuilt = kind;
  p.run.structuresBuilt++;
  s.emit({ e: 'built', id: st.id, structure: kind, tile, slot: p.slot });
  return null;
}
