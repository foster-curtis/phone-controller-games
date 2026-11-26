// Map v1 (SPEC §3.1, §15.2): 36 × 24 tiles, an open field. Citadel cols 16–19, rows 0–1. Six portals,
// every one live from wave 1: bottom-w (cols 9–10, row 23), bottom-e (cols 25–26, row 23), left-n
// (col 0, rows 11–12), left-s (col 0, rows 18–19), right-n (col 35, rows 11–12), right-s (col 35,
// rows 18–19). Enemies spawn just outside the edge and walk in. A starting layout to tune (§14).
import type { MapDef } from './types';

const OPEN = '....................................';
const SIDE = 'P..................................P';

export const mapV1 = {
  id: 'v1',
  cols: 36,
  rows: 24,
  tiles: [
    '................CCCC................',
    '................CCCC................',
    OPEN,
    OPEN,
    OPEN,
    OPEN,
    OPEN,
    OPEN,
    OPEN,
    OPEN,
    OPEN,
    SIDE,
    SIDE,
    OPEN,
    OPEN,
    OPEN,
    OPEN,
    OPEN,
    SIDE,
    SIDE,
    OPEN,
    OPEN,
    OPEN,
    '.........PP..............PP.........',
  ],
  legend: {
    '.': 'open',
    '#': 'blocked',
    C: 'citadel',
    P: 'portal',
  },
  portals: {
    'bottom-w': {
      side: 'bottom',
      entry: [
        [9, 23],
        [10, 23],
      ],
      spawn: { x: 10, y: 24.6 },
    },
    'bottom-e': {
      side: 'bottom',
      entry: [
        [25, 23],
        [26, 23],
      ],
      spawn: { x: 26, y: 24.6 },
    },
    'left-n': {
      side: 'left',
      entry: [
        [0, 11],
        [0, 12],
      ],
      spawn: { x: -0.6, y: 12 },
    },
    'left-s': {
      side: 'left',
      entry: [
        [0, 18],
        [0, 19],
      ],
      spawn: { x: -0.6, y: 19 },
    },
    'right-n': {
      side: 'right',
      entry: [
        [35, 11],
        [35, 12],
      ],
      spawn: { x: 36.6, y: 12 },
    },
    'right-s': {
      side: 'right',
      entry: [
        [35, 18],
        [35, 19],
      ],
      spawn: { x: 36.6, y: 19 },
    },
  },
} satisfies MapDef;
