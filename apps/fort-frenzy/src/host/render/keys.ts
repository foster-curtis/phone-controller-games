// Typed frame keys (SPEC §15.2 frame names). Render code names a frame only through `fk('…')` or
// one of these builders, whose template types are checked against the generated FrameName union;
// asset-keys.test.ts also checks every literal and every builder output against the manifest.
import { ICON_FRAME_PREFIX, type FrameName } from '../../../generated/keys';
import type { FrameKey, IconKey, SentryAim, SentryLoadout } from './types';

export const fk = <K extends FrameName>(k: K): K => k;

export const sentryFrame = (loadout: SentryLoadout, aim: SentryAim): FrameKey =>
  `sentry/${loadout}/${aim}` as const;

type GroundVariant = 1 | 2 | 3 | 4;
export const groundFrame = (v: number): FrameKey =>
  `ground/${Math.min(4, Math.max(1, v)) as GroundVariant}` as const;
export const EDGE_FRAMES = {
  n: fk('edge/n'),
  s: fk('edge/s'),
  e: fk('edge/e'),
  w: fk('edge/w'),
  ne: fk('edge/ne'),
  nw: fk('edge/nw'),
  se: fk('edge/se'),
  sw: fk('edge/sw'),
} as const;
export const DECOR_FRAMES = [
  fk('decor/grate'),
  fk('decor/plate'),
  fk('decor/lines'),
  fk('decor/crack'),
] as const;

export const CITADEL = {
  plate: fk('citadel/plate'),
  body: fk('citadel/body'),
  glow: fk('citadel/glow'),
  core: fk('citadel/core'),
  ramparts: fk('citadel/ramparts'),
  window: fk('citadel/window'),
  cracks: fk('citadel/dmg-cracks'),
  fire: fk('citadel/dmg-fire'),
  smoke: fk('citadel/dmg-smoke'),
  rubble: fk('citadel/rubble'),
} as const;

type ScrapSize = 1 | 2 | 3 | 4 | 5;
export const scrapFrame = (side: 'ours' | 'theirs', size: number): FrameKey =>
  `scrap-${side}-${Math.min(5, Math.max(1, size)) as ScrapSize}` as const;

export const STATUS_FRAMES = {
  burn: [fk('burn-1'), fk('burn-2')],
  poison: [fk('corrosion-1'), fk('corrosion-2')],
  stun: [fk('stun-1'), fk('stun-2'), fk('stun-3'), fk('stun-4')],
  slow: [fk('shock-crawl')],
} as const;

/** An icon's atlas frame (world UI: the build arc, the super-ready badge; §15.4). */
export const iconFrame = (id: IconKey) => `${ICON_FRAME_PREFIX}${id}` as const;
