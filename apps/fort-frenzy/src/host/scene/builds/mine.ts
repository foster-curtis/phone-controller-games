// The Ranger's mine on the TV (SPEC §7.4, §7.5, §15.2; RD7): the generic life cycle with `mine/armed`
// at full opacity while it arms, 40% once live (translucent to players), and `mine/trigger` at full
// opacity for the delay. The blast (`mine-blast-ring` + `mine-blast`) is `BuildsView`'s, on `mineBurst`.
import { LifecycleBuild } from '../../render/buildKit';
import { BUILD_FRAMES, MINE_TRIGGER } from '../../render/keys';
import type { BuildViewFactory } from '../../render/types';

/** Opacity of a live mine (§7.4). */
export const MINE_LIVE_ALPHA = 0.4;

export const view: BuildViewFactory = {
  id: 'mine',
  create: (ctx) =>
    new LifecycleBuild(ctx, {
      frames: BUILD_FRAMES.mine,
      trigger: MINE_TRIGGER,
      liveAlpha: MINE_LIVE_ALPHA,
      shadow: [26, 15],
      barPx: 0,
      radiusRing: false,
    }),
};
