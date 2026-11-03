// Map v1 (SPEC §3.1, §15.2): 36 × 24 tiles. Citadel cols 16–19, rows 0–1; repair zone cols 17–18,
// row 2; Armory pad col 22, row 1. Lanes: bottom (cols 17–18, row 23; wave 1), left (col 0, rows 11–12;
// wave 3), right (col 35, rows 11–12; wave 8). Enemies spawn just outside the edge and walk in.
// A starting layout to tune (§14).
import type { MapDef } from './types';

const OPEN = '....................................';

export const mapV1 = {
  id: 'v1',
  cols: 36,
  rows: 24,
  tiles: [
    '................CCCC................',
    '................CCCC..A.............',
    '.................RR.................',
    OPEN,
    OPEN,
    OPEN,
    OPEN,
    OPEN,
    OPEN,
    OPEN,
    OPEN,
    'L..................................L',
    'L..................................L',
    OPEN,
    OPEN,
    OPEN,
    OPEN,
    OPEN,
    OPEN,
    OPEN,
    OPEN,
    OPEN,
    OPEN,
    '.................LL.................',
  ],
  legend: {
    '.': 'open',
    '#': 'blocked',
    C: 'citadel',
    R: 'repair',
    A: 'armory',
    L: 'lane',
  },
  lanes: {
    bottom: {
      entry: [
        [17, 23],
        [18, 23],
      ],
      spawn: { x: 18, y: 24.6 },
    },
    left: {
      entry: [
        [0, 11],
        [0, 12],
      ],
      spawn: { x: -0.6, y: 12 },
    },
    right: {
      entry: [
        [35, 11],
        [35, 12],
      ],
      spawn: { x: 36.6, y: 12 },
    },
  },
} satisfies MapDef;
