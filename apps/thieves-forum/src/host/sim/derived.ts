// Per-world derived state the sim rebuilds or re-derives from inputs (SPEC §12.3): the spatial hash
// (rebuilt every step from positions) and each player's previous input sample (for rising and falling
// edges). Kept beside `World`, not in it, so the state hash and the frozen `World` shape stay as they
// are; none of it is needed to replay a round from its inputs.
import { createSpatialHash, type SpatialHash } from './spatial';
import type { PlayerId, PlayerInput, World } from './types';

/** Rising/falling edges of a player's buttons this step (SPEC §12.3 step 1). */
export interface InputEdges {
  holdRose: boolean;
  holdFell: boolean;
  catchRose: boolean;
}

interface Derived {
  spatial: SpatialHash;
  prev: Map<PlayerId, PlayerInput>;
  edges: Map<PlayerId, InputEdges>;
}

const derivedOf = new WeakMap<World, Derived>();

function get(world: World): Derived {
  let d = derivedOf.get(world);
  if (!d) {
    // 40 × 37.5 tiles today; sized from the layout by createWorld through `initDerived`.
    d = { spatial: createSpatialHash(64, 64, 1), prev: new Map(), edges: new Map() };
    derivedOf.set(world, d);
  }
  return d;
}

/** Sizes the spatial hash to the map (called once by `createWorld`). */
export function initDerived(world: World, w: number, h: number): void {
  derivedOf.set(world, {
    spatial: createSpatialHash(Math.ceil(w), Math.ceil(h), 1, 4),
    prev: new Map(),
    edges: new Map(),
  });
}

export const spatialOf = (world: World): SpatialHash => get(world).spatial;
export const prevInputs = (world: World): Map<PlayerId, PlayerInput> => get(world).prev;

const NO_EDGES: InputEdges = { holdRose: false, holdFell: false, catchRose: false };

/** This step's button edges for a player (holds, TF3; catches, TF9). */
export const inputEdges = (world: World, player: PlayerId): InputEdges =>
  get(world).edges.get(player) ?? NO_EDGES;

export const edgesOf = (world: World): Map<PlayerId, InputEdges> => get(world).edges;
