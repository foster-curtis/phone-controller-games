// The stocks (SPEC §6.13; TF1-fix-1, user C1 note 4): empty, the delivered `stocks` frame; occupied,
// the approved `map/stocks-occupied-reference.svg` drawing (front view only). That thief is a little
// larger than a character, so it isn't a rig pose: its `--tunic`, `--skin` and `--hair` tint runs
// take the occupant's outfit (the reference shows no mantle). One world object, y-sorted at its foot.
import type * as Phaser from 'phaser';
import type { Outfit } from '../../content/types';
import {
  addPiece,
  destroyPiece,
  placePiece,
  setPieceVisible,
  tintPiece,
  type ArtLibrary,
  type ArtPiece,
} from './atlas';
import { MAP_UNIT_PX } from './camera';
import { outfitTints } from './tones';
import type { StocksInstance } from './types';

export class StocksSprite implements StocksInstance {
  private readonly empty: ArtPiece;
  private readonly full: ArtPiece;
  private _occupied = false;
  private visible = true;

  constructor(
    lib: ArtLibrary,
    parent: Phaser.GameObjects.Layer | Phaser.GameObjects.Container,
    private readonly unitPx = MAP_UNIT_PX,
  ) {
    this.empty = lib.piece('stocks');
    this.full = lib.piece('stocks-occupied-reference');
    addPiece(this.empty, parent);
    addPiece(this.full, parent);
    this.setPosition(0, 0);
    this.sync();
  }

  get occupied(): boolean {
    return this._occupied;
  }

  setPosition(sx: number, sy: number) {
    for (const p of [this.empty, this.full]) {
      placePiece(p, sx, sy, this.unitPx);
      for (const l of p.layers) l.img.setDepth(sy);
    }
  }

  setOccupant(outfit: Outfit | null) {
    this._occupied = outfit !== null;
    if (outfit) tintPiece(this.full, outfitTints(outfit));
    this.sync();
  }

  setVisible(visible: boolean) {
    this.visible = visible;
    this.sync();
  }

  destroy() {
    destroyPiece(this.empty);
    destroyPiece(this.full);
  }

  private sync() {
    setPieceVisible(this.empty, this.visible && !this._occupied);
    setPieceVisible(this.full, this.visible && this._occupied);
  }
}
