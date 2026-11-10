// The render world (SPEC §15.2): the six layers, the camera, the art library and factories for
// rigs, structures, effects and ground marks. Layers 1–4 render through the main camera, which
// carries the bloom; layers 5–6 (world UI, HUD) through a second camera with no filters.
import type * as Phaser from 'phaser';
import type { ThemeAssets, ThemeHost } from '../../themes/types';
import { ArtLibrary } from './atlas';
import { addBloom, type Bloom } from './bloom';
import { CANVAS_H, CANVAS_W, FixedCamera, UNIT_PX } from './camera';
import type { RenderContext } from './context';
import { Effects } from './effects';
import { GroundMarks } from './groundMarks';
import { RigSprite } from './rig';
import { rigPartCount } from './rigMath';
import { LAYER_IDS, type LayerId, type RigOptions } from './types';

export class RenderWorld implements RenderContext {
  readonly camera = new FixedCamera();
  readonly layers: Record<LayerId, Phaser.GameObjects.Layer>;
  readonly lib: ArtLibrary;
  readonly unitPx: number;
  readonly fx: Effects;
  readonly marks: GroundMarks;
  readonly bloom: Bloom | null;
  readonly uiCamera: Phaser.Cameras.Scene2D.Camera;
  private readonly rigs = new Set<RigSprite>();

  constructor(
    readonly scene: Phaser.Scene,
    readonly theme: ThemeHost,
    assets: ThemeAssets,
    scale: 1 | 2,
    opts: { bloom?: boolean } = {},
  ) {
    this.unitPx = UNIT_PX * this.camera.scale;
    this.layers = Object.fromEntries(
      LAYER_IDS.map((id) => [id, scene.add.layer().setName(id)]),
    ) as Record<LayerId, Phaser.GameObjects.Layer>;
    this.lib = new ArtLibrary(scene, assets, theme.atlases, scale);
    const main = scene.cameras.main;
    this.uiCamera = scene.cameras.add(0, 0, CANVAS_W, CANVAS_H, false, 'ui');
    main.ignore([this.layers.worldUi, this.layers.hud]);
    this.uiCamera.ignore([
      this.layers.ground,
      this.layers.groundOverlay,
      this.layers.world,
      this.layers.effects,
    ]);
    this.bloom = opts.bloom === false ? null : addBloom(main);
    this.fx = new Effects(this);
    this.marks = new GroundMarks(this);
  }

  /** A rig on the world layer (`<rig>/<clip>` clips from the theme). */
  rig(rigId: string, opts: RigOptions = {}): RigSprite {
    const def = this.theme.rigs[rigId];
    if (!def) throw new Error(`render: unknown rig ${rigId}`);
    const rig = new RigSprite(
      this.lib,
      this.layers.world,
      def,
      this.theme.clips,
      this.unitPx,
      opts,
    );
    this.rigs.add(rig);
    const destroy = rig.destroy.bind(rig);
    rig.destroy = () => {
      this.rigs.delete(rig);
      destroy();
    };
    return rig;
  }

  get rigCount(): number {
    return this.rigs.size;
  }

  /** Rig parts alive (the stress overlay). */
  get partCount(): number {
    let n = 0;
    // Not every child of a rig root is a part set: the extras graphics has no list (FF15-fix-1).
    for (const r of this.rigs) n += rigPartCount(r.root);
    return n;
  }

  update(dtMs: number) {
    for (const r of this.rigs) r.update(dtMs);
    this.fx.update(dtMs);
  }
}
