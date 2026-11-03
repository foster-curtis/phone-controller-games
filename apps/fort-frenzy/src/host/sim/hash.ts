// State hash (SPEC §15.3): FNV-1a over a canonical serialization of `World`, for determinism tests and
// replays. Canonical = keys in insertion order (the sim always builds objects the same way), numbers
// as their shortest round-trip text, functions skipped. Derived or transient parts are left out: the
// spatial hash (rebuilt each step), the flow fields (rebuilt from the structures), the tile kinds
// (constant) and the step's events.
import { fnv1a } from '@pcg/game-kit';
import type { World } from './types';

const SKIP_WORLD = new Set(['spatial', 'fields', 'events']);
const FNV_OFFSET = 0x811c9dc5;

function feed(h: number, v: unknown): number {
  switch (typeof v) {
    case 'number':
      return fnv1a(String(v) + ',', h);
    case 'string':
      return fnv1a(JSON.stringify(v) + ',', h);
    case 'boolean':
      return fnv1a(v ? 't,' : 'f,', h);
    case 'undefined':
      return fnv1a('u,', h);
    case 'function':
      return h;
    case 'object': {
      if (v === null) return fnv1a('n,', h);
      if (ArrayBuffer.isView(v)) {
        const a = v as unknown as ArrayLike<number>;
        h = fnv1a('[', h);
        for (let i = 0; i < a.length; i++) h = fnv1a(String(a[i]) + ',', h);
        return fnv1a(']', h);
      }
      if (Array.isArray(v)) {
        h = fnv1a('[', h);
        for (const x of v) h = feed(h, x);
        return fnv1a(']', h);
      }
      h = fnv1a('{', h);
      const o = v as Record<string, unknown>;
      for (const k of Object.keys(o)) {
        const x = o[k];
        if (typeof x === 'function') continue;
        h = feed(fnv1a(k + ':', h), x);
      }
      return fnv1a('}', h);
    }
    default:
      return fnv1a(String(v), h);
  }
}

/** 32-bit FNV-1a of the world's run state. */
export function stateHash(world: World): number {
  let h = FNV_OFFSET;
  for (const k of Object.keys(world) as (keyof World)[]) {
    if (SKIP_WORLD.has(k)) continue;
    if (k === 'grid') {
      h = feed(fnv1a('grid:', h), world.grid.occupant);
      continue;
    }
    h = feed(fnv1a(k + ':', h), world[k]);
  }
  return h >>> 0;
}
