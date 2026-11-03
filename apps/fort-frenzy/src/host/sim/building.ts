// Building (SPEC §7, §10.1 row 5 and the build arc, §10.2 ghost): placement validity and placing a
// structure at a player's feet for crates.
import type { Tile } from '../../content/types';
import type { AckReason } from '../../shared/messages';
import type { StructureId } from '../../shared/ids';
import { circleTouchesTile } from './geometry';
import type { FullState } from './state';
import type { PlayerEnt, World } from './types';

/** The tile under a point. */
export function tileAt(x: number, y: number): Tile {
  return [Math.floor(x), Math.floor(y)];
}

/**
 * §7 placement validity: on the map, buildable (open: not a lane entry, the Citadel, the repair zone
 * or the Armory pad), free of other structures; walls and towers (not snares) also need the tile free
 * of enemies and players. The builder's own body doesn't count: they build at their feet and get
 * pushed off (BUILD_PLAN §8, FF6). Flyers pass over structures, so they don't block either.
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

/** Builds `kind` at the player's feet if they carry enough crates and the tile is valid. */
export function buildAtFeet(s: FullState, p: PlayerEnt, kind: StructureId): AckReason | null {
  const def = s.cat.structure(kind);
  if (!s.cat.character(p.classId).build.includes(kind)) return 'invalid';
  if (p.crates < def.cost) return 'crates';
  const tile = tileAt(p.x, p.y);
  if (!placementValid(s.world, kind, tile, p.slot)) return 'invalid';
  const st = s.placeStructure(kind, tile[0], tile[1], p.slot);
  p.crates -= def.cost;
  p.lastBuilt = kind;
  p.run.structuresBuilt++;
  s.emit({ e: 'built', id: st.id, structure: kind, tile, slot: p.slot });
  return null;
}
