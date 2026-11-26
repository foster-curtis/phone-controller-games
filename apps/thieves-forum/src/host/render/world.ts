// The render kit one scene owns (SPEC §12.2): the three layers (ground → world, y-sorted → overlay),
// the art library at the picked atlas scale, the camera, the effect spawner and factories for rigs
// and stalls. The gallery uses it now; the market scene (TF7) builds on it.
import type * as Phaser from 'phaser';
import type { ShopId } from '../../content/types';
import { ATLASES, MANIFEST, RIGS } from './assets';
import { ArtLibrary } from './atlas';
import { CHAR_UNIT_PX, FixedCamera, MAP_UNIT_PX } from './camera';
import { CLIPS } from './clips/index';
import { Effects } from './effects';
import { RigSprite } from './rig';
import { StallSprite } from './stall';
import type { LayerId, RigId, RigOptions } from './types';

export class RenderWorld {
  readonly layers: Record<LayerId, Phaser.GameObjects.Layer>;
  readonly lib: ArtLibrary;
  readonly camera = new FixedCamera();
  readonly fx: Effects;
  readonly rigs = new Set<RigSprite>();
  readonly stalls = new Set<StallSprite>();

  constructor(scene: Phaser.Scene, scale: 1 | 2) {
    this.layers = {
      ground: scene.add.layer().setDepth(0),
      world: scene.add.layer().setDepth(1),
      overlay: scene.add.layer().setDepth(2),
    };
    this.lib = new ArtLibrary(scene, MANIFEST.frames, ATLASES, scale);
    this.fx = new Effects(this.lib, this.layers);
  }

  rig(id: RigId, opts: RigOptions = {}, parent?: Phaser.GameObjects.Container): RigSprite {
    const r = new RigSprite(
      this.lib,
      parent ?? this.layers.world,
      RIGS[id],
      CLIPS,
      CHAR_UNIT_PX,
      opts,
    );
    this.rigs.add(r);
    return r;
  }

  stall(shop: ShopId, unitPx = MAP_UNIT_PX): StallSprite {
    const s = new StallSprite(this.lib, this.layers.world, shop, unitPx);
    this.stalls.add(s);
    return s;
  }

  update(dtMs: number) {
    for (const r of this.rigs) r.update(dtMs);
    this.fx.update(dtMs);
  }
}
