// Gallery state, read from and written to the URL so every view is linkable and e2e can open pages.
import { PLAYER_COLOR_IDS, type PlayerColorId } from '../../../shared/ids';

export const PAGES = ['rigs', 'citadel', 'effects', 'icons', 'map', 'colossus'] as const;
export type PageId = (typeof PAGES)[number];

/**
 * `death` plays on enemies and the Colossus, `down`/`respawn` on knights; `attack` on the Ranger
 * (main shot) and the Drone (slash), `super` and `build` on the Ranger (FF7); `slam`, `throw`,
 * `call` and `stagger` on the Colossus (FF11, which also has its own `colossus` page). A rig without
 * the clip idles.
 */
export const CLIP_NAMES = [
  'idle',
  'walk',
  'hit',
  'down',
  'respawn',
  'death',
  'attack',
  'super',
  'build',
  'slam',
  'throw',
  'call',
  'stagger',
] as const;

export interface GalleryState {
  page: PageId;
  color: PlayerColorId;
  unlit: boolean;
  clip: string;
  hitbox: boolean;
  bloom: boolean;
  banner: boolean;
  /** Artificer gauge steps, 0–8. */
  gauge: number;
  /** Colossus: 1 Mk I, 2 Mk II, 3 Mk III, 4 final phase. */
  colossus: 1 | 2 | 3 | 4;
}

const clampInt = (v: string | null, lo: number, hi: number, d: number) => {
  const n = v === null ? NaN : Number(v);
  return Number.isInteger(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

export function readState(search = location.search): GalleryState {
  const q = new URLSearchParams(search);
  const page = q.get('page');
  const color = q.get('color');
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
  history.replaceState(null, '', `${location.pathname}?${q.toString()}`);
}

/** Artificer gauge groups for a step count: bottom cell first (render/gauge.ts). */
export { gaugeGroups } from '../gauge';

/** Colossus groups, cumulative (art README). */
export function colossusGroups(tier: 1 | 2 | 3 | 4): string[] {
  return [
    ...(tier >= 2 ? ['mk2'] : []),
    ...(tier >= 3 ? ['mk3'] : []),
    ...(tier >= 4 ? ['final'] : []),
  ];
}
