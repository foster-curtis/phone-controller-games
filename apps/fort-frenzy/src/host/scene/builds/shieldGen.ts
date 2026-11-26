// The Warden's shield generator on the TV (SPEC §7.4, §7.5, §15.2; RD5): the generic life cycle
// (render/buildKit.ts) with its `shield-base` footprint under it and the `shield-shimmer-1…3` dome
// cycling at about 6 fps over it, and the faint dotted amber ellipse of its field.
import { LifecycleBuild } from '../../render/buildKit';
import { BUILD_FRAMES, SHIELD_BASE, SHIELD_SHIMMER } from '../../render/keys';
import type { BuildViewFactory } from '../../render/types';

export const view: BuildViewFactory = {
  id: 'shield_gen',
  create: (ctx) =>
    new LifecycleBuild(ctx, {
      frames: BUILD_FRAMES.shield_gen,
      base: SHIELD_BASE,
      cycle: { frames: SHIELD_SHIMMER, fps: 6 },
      shadow: [34, 20],
      barPx: 44,
      radiusRing: true,
    }),
};
