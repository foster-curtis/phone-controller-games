// Gallery state, read from and written to the URL so every view is linkable and e2e can open pages.
import { LANE_IDS, PLAYER_COLOR_IDS, type LaneId, type PlayerColorId } from '../../../shared/ids';
import type { LaneState, TowerTier } from '../types';

export const PAGES = [
  'rigs',
  'turrets',
  'citadel',
  'autotiles',
  'effects',
  'icons',
  'map',
] as const;
export type PageId = (typeof PAGES)[number];

export const CLIP_NAMES = ['idle', 'walk', 'hit', 'down', 'respawn'] as const;

export interface GalleryState {
  page: PageId;
  color: PlayerColorId;
  unlit: boolean;
  clip: string;
  hitbox: boolean;
  bloom: boolean;
  banner: boolean;
  /** Artificer gauge: crates carried, 0–8. */
  gauge: number;
  /** Colossus: 1 Mk I, 2 Mk II, 3 Mk III, 4 final phase. */
  colossus: 1 | 2 | 3 | 4;
  /** Mortar and turret tier for the rigs page; the turrets page shows every tier. */
  tier: TowerTier;
  /** Cells carried (pips under the knights). */
  carry: number;
  lanes: Record<LaneId, LaneState>;
}

const clampInt = (v: string | null, lo: number, hi: number, d: number) => {
  const n = v === null ? NaN : Number(v);
  return Number.isInteger(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

export function readState(search = location.search): GalleryState {
  const q = new URLSearchParams(search);
  const page = q.get('page');
  const color = q.get('color');
  const lanes = {} as Record<LaneId, LaneState>;
  for (const l of LANE_IDS)
    lanes[l] =
      (q.get(`lane-${l}`) ?? (l === 'right' ? 'sealed' : 'open')) === 'sealed' ? 'sealed' : 'open';
  return {
    page: (PAGES as readonly string[]).includes(page ?? '') ? (page as PageId) : 'rigs',
    color: (PLAYER_COLOR_IDS as readonly string[]).includes(color ?? '')
      ? (color as PlayerColorId)
      : 'cobalt',
    unlit: q.get('unlit') === '1',
    clip: q.get('clip') ?? 'idle',
    hitbox: q.get('hitbox') === '1',
    bloom: q.get('bloom') !== '0',
    banner: q.get('banner') !== '0',
    gauge: clampInt(q.get('gauge'), 0, 8, 3),
    colossus: clampInt(q.get('colossus'), 1, 4, 1) as GalleryState['colossus'],
    tier: clampInt(q.get('tier'), 0, 3, 0) as TowerTier,
    carry: clampInt(q.get('carry'), 0, 8, 2),
    lanes,
  };
}

export function writeState(s: GalleryState) {
  const q = new URLSearchParams(location.search);
  q.set('page', s.page);
  q.set('color', s.color);
  q.set('unlit', s.unlit ? '1' : '0');
  q.set('clip', s.clip);
  q.set('hitbox', s.hitbox ? '1' : '0');
  q.set('bloom', s.bloom ? '1' : '0');
  q.set('banner', s.banner ? '1' : '0');
  q.set('gauge', String(s.gauge));
  q.set('colossus', String(s.colossus));
  q.set('tier', String(s.tier));
  q.set('carry', String(s.carry));
  for (const l of LANE_IDS) q.set(`lane-${l}`, s.lanes[l]);
  history.replaceState(null, '', `${location.pathname}?${q.toString()}`);
}

/** Artificer gauge groups for a crate count (art README): cell N full at ≥ 2N, half at 2N − 1. */
export function gaugeGroups(crates: number): string[] {
  const out: string[] = [];
  for (let n = 1; n <= 3; n++) {
    if (crates >= 2 * n) out.push(`core${n}-full`);
    else if (crates === 2 * n - 1) out.push(`core${n}-half`);
  }
  return out;
}

/** Colossus groups, cumulative (art README). */
export function colossusGroups(tier: 1 | 2 | 3 | 4): string[] {
  return [
    ...(tier >= 2 ? ['mk2'] : []),
    ...(tier >= 3 ? ['mk3'] : []),
    ...(tier >= 4 ? ['final'] : []),
  ];
}
