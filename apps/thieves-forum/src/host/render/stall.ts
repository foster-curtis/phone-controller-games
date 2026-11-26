// A stall (SPEC §6.3, §6.6, §12.2; ART_NOTES "Stalls"): one world object sorted at its counter's
// front edge, drawn in the art's order: back + shelf → shelf items → merchant → counter → counter
// items → closed shade → frame (canopy tinted with the shop's `--canopy-*`). The merchant stands at
// the counter (waist hidden) and rises on screen as he walks back to the shelf. Closed stalls keep
// everything but items and merchant, and add the shade. World placement is TF7's.
import type * as Phaser from 'phaser';
import type { ShopId } from '../../content/types';
import { theme } from '../../shared/theme';
import {
  addPiece,
  destroyPiece,
  placePiece,
  setPieceVisible,
  tintPiece,
  type ArtLibrary,
  type ArtPiece,
} from './atlas';
import type { RigSprite } from './rig';
import type { FrameKey, StallInstance } from './types';

/** Stall box units (viewBox 0 0 104 96). */
export const STALL_W = 104;
export const STALL_H = 96;
/** The y-sort line: the counter's front edge. */
export const STALL_SORT_Y = 87;
/** Item spots (centers, stall units) from the art notes and the open-stall references. */
export const COUNTER_SPOTS: readonly [number, number][] = [
  [16, 64.5],
  [30, 64.5],
  [74, 64.5],
  [88, 64.5],
];
export const SHELF_SPOTS: readonly [number, number][] = [
  [24, 30],
  [80, 30],
  [30, 42],
  [74, 42],
];
const COUNTER_ITEM = 9;
const SHELF_ITEM = 8;
/** Merchant foot (stall units): at the counter (y 40.8 box) and at the shelf (y 34.4 box). */
const MERCHANT_COUNTER_Y = 73.8;
const MERCHANT_SHELF_Y = 67.4;
const MERCHANT_X = 52;

export class StallSprite implements StallInstance {
  readonly root: Phaser.GameObjects.Container;
  private readonly back: ArtPiece;
  private readonly counter: ArtPiece;
  private readonly shade: ArtPiece;
  private readonly frame: ArtPiece;
  private readonly shelfItems: Phaser.GameObjects.Container;
  private readonly counterItems: Phaser.GameObjects.Container;
  private readonly merchantSlot: Phaser.GameObjects.Container;
  private items: ArtPiece[] = [];
  private merchant: RigSprite | null = null;
  private _open = true;
  private counterIds: readonly (string | null)[] = [];
  private shelfIds: readonly (string | null)[] = [];
  private readonly u: number;

  constructor(
    private readonly lib: ArtLibrary,
    layer: Phaser.GameObjects.Layer,
    readonly shop: ShopId,
    /** Screen px per stall unit (3 at the layout's scale). */
    unitPx: number,
  ) {
    this.u = unitPx;
    const make = () => layer.scene.make.container({ x: 0, y: 0 }, false);
    this.root = make();
    layer.add(this.root);
    const piece = (name: FrameKey) => {
      const p = lib.piece(name, [0, 0]);
      placePiece(p, 0, 0, this.u);
      return p;
    };
    this.back = piece('stall-back');
    this.counter = piece('stall-counter');
    this.shade = piece('stall-closed-shade');
    this.frame = piece('stall-frame');
    tintPiece(this.frame, { canopy: theme.canopy[shop].num });
    this.shelfItems = make();
    this.merchantSlot = make();
    this.counterItems = make();
    addPiece(this.back, this.root);
    this.root.add(this.shelfItems);
    this.root.add(this.merchantSlot);
    addPiece(this.counter, this.root);
    this.root.add(this.counterItems);
    addPiece(this.shade, this.root);
    addPiece(this.frame, this.root);
    this.setOpen(true);
  }

  get open(): boolean {
    return this._open;
  }

  setPosition(sx: number, sy: number) {
    this.root.setPosition(sx, sy);
    this.root.setDepth(sy + STALL_SORT_Y * this.u);
  }

  setOpen(open: boolean) {
    this._open = open;
    setPieceVisible(this.shade, !open);
    this.merchantSlot.setVisible(open);
    this.redrawItems();
  }

  setItems(counter: readonly (string | null)[], shelf: readonly (string | null)[]) {
    this.counterIds = counter;
    this.shelfIds = shelf;
    this.redrawItems();
  }

  setMerchant(merchant: RigSprite | null) {
    if (this.merchant && this.merchant !== merchant) this.merchantSlot.remove(this.merchant.root);
    this.merchant = merchant;
    if (merchant) {
      if (merchant.root.parentContainer !== this.merchantSlot) this.merchantSlot.add(merchant.root);
      this.setMerchantDepth(0);
    }
  }

  /** Build the merchant's rig with this as its parent (between shelf items and counter). */
  get merchantParent(): Phaser.GameObjects.Container {
    return this.merchantSlot;
  }

  setMerchantDepth(t: number, xUnits = MERCHANT_X) {
    if (!this.merchant) return;
    const k = Math.max(0, Math.min(1, t));
    const y = MERCHANT_COUNTER_Y + (MERCHANT_SHELF_Y - MERCHANT_COUNTER_Y) * k;
    this.merchant.setPosition(xUnits * this.u, y * this.u);
  }

  update(dtMs: number) {
    this.merchant?.update(dtMs);
  }

  destroy() {
    for (const p of this.items) destroyPiece(p);
    this.merchant?.destroy();
    this.root.destroy();
  }

  private redrawItems() {
    for (const p of this.items) destroyPiece(p);
    this.items = [];
    if (!this._open) return;
    const put = (
      ids: readonly (string | null)[],
      spots: readonly [number, number][],
      size: number,
      into: Phaser.GameObjects.Container,
    ) => {
      ids.forEach((id, i) => {
        const spot = spots[i];
        if (!id || !spot) return;
        const name = itemFrame(this.lib, id);
        const p = this.lib.piece(name);
        const k = (size / 32) * this.u;
        placePiece(p, spot[0] * this.u, spot[1] * this.u, k);
        addPiece(p, into);
        this.items.push(p);
      });
    };
    put(this.shelfIds, SHELF_SPOTS, SHELF_ITEM, this.shelfItems);
    put(this.counterIds, COUNTER_SPOTS, COUNTER_ITEM, this.counterItems);
  }
}

/** The sprites.json name of an item icon: `<shop>/<item-id>`. */
export function itemFrame(lib: ArtLibrary, itemId: string): FrameKey {
  for (const [name, meta] of Object.entries(lib.frames))
    if (meta.category === 'items' && name.endsWith(`/${itemId}`)) return name as FrameKey;
  return `items/${itemId}` as FrameKey;
}
