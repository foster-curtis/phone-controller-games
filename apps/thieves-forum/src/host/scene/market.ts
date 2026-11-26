// The market scene (SPEC §6.3, §6.11, §6.16, §12.2): Phaser renders only. Floor tiles on the ground
// layer; on the y-sorted world layer the ten stalls (open or closed by the match's open set, canopy in
// the shop's color), the top gate, the stocks, and every citizen on the shared rig with its outfit,
// interpolated between sim steps. Merchants come from `WorldView.merchants`; until the merchants sim
// (TF8) fills them, each open stall shows a placeholder merchant idling at its counter.
// Disguise (SPEC §6.11): characters are built only from `WorldView` (no player state is imported;
// scene/__tests__/disguise.test.ts). The dev overlay is injected by main.ts behind `?debug=1`.
import * as Phaser from 'phaser';
import { CONTENT } from '../../content';
import type { FabricId, Vec2 } from '../../content/types';
import { theme } from '../../shared/theme';
import { ATLASES } from '../render/assets';
import { addPiece, pickAtlasScale, placePiece, preloadAtlases } from '../render/atlas';
import { CANVAS_H, CANVAS_W, MAP_UNIT_PX } from '../render/camera';
import type { RigSprite } from '../render/rig';
import type { StallSprite } from '../render/stall';
import { merchantTints } from '../render/tones';
import { RenderWorld } from '../render/world';
import type { CharacterView, MerchantView, WorldView } from '../sim/snapshot';
import { camera, floorTiles, frontAnchor, stallBox, type StallBox } from './placement';
import type { FrameInput, SceneEntityId, SceneOverlay, SceneSource } from './types';

type Gait = CharacterView['gait'];

/** Clip playback rate per gait, so feet roughly match the ground speed (SPEC §6.10 gaits). */
const GAIT_RATE: Record<Gait, number> = {
  idle: 1,
  shuffle: 0.55,
  walk: 1,
  brisk: 1.25,
  jog: 1.45,
  run: 1.6,
};

export interface MarketSceneOptions {
  /** Dev overlay factory (debug only, main.ts). */
  overlay?: (scene: Phaser.Scene) => SceneOverlay;
  /** Called once the atlases are loaded and the market is built. */
  onReady?: (scene: MarketScene) => void;
}

interface CharSprite {
  rig: RigSprite;
  look: string;
}

interface StallSlot {
  sprite: StallSprite;
  box: StallBox;
  counterY: number;
  shelfY: number;
  items: string;
  merchant: RigSprite | null;
  /** The placeholder merchant (TF8 replaces it with `WorldView.merchants`). */
  placeholder: boolean;
}

const lookKey = (o: { tunic: string; mantle: string; hair: number; skin: number }) =>
  `${o.tunic}|${o.mantle}|${o.hair}|${o.skin}`;

const FABRICS = Object.keys(theme.fabric) as FabricId[];

/** A fixed look per stall for the placeholder merchants (no randomness on the TV). */
function placeholderLook(stall: number) {
  return merchantTints({
    tunic: FABRICS[(stall * 3 + 1) % FABRICS.length]!,
    wrap: FABRICS[(stall * 5 + 2) % FABRICS.length]!,
    hair: stall % 6,
    skin: (stall * 2 + 1) % 6,
  });
}

export class MarketScene extends Phaser.Scene {
  world!: RenderWorld;
  private readonly chars = new Map<SceneEntityId, CharSprite>();
  private readonly stalls = new Map<number, StallSlot>();
  private gateOpen: boolean | null = null;
  private gate: { closed: Phaser.GameObjects.Image[]; open: Phaser.GameObjects.Image[] } | null =
    null;
  private overlay: SceneOverlay | null = null;
  private readonly feet = new Map<SceneEntityId, Vec2>();
  private readonly scale1 = pickAtlasScale();

  constructor(
    private readonly source: SceneSource,
    private readonly opts: MarketSceneOptions = {},
  ) {
    super('market');
  }

  preload() {
    preloadAtlases(this, ATLASES, this.scale1);
  }

  create() {
    this.world = new RenderWorld(this, this.scale1);
    const { layout } = CONTENT;
    for (const t of floorTiles(layout)) {
      const p = this.world.lib.piece('floor-tile');
      placePiece(p, t.x, t.y, 0.6);
      addPiece(p, this.world.layers.ground);
    }
    for (const slot of layout.stalls) {
      const box = stallBox(slot);
      const sprite = this.world.stall(slot.shop, box.unitPx);
      sprite.setPosition(box.x, box.y);
      this.stalls.set(slot.id, {
        sprite,
        box,
        counterY: slot.merchantCounterY,
        shelfY: slot.merchantShelfY,
        items: '',
        merchant: null,
        placeholder: false,
      });
    }
    const g = frontAnchor(layout.gate.rect);
    const piece = (name: 'gate-closed' | 'gate-open') => {
      const p = this.world.lib.piece(name);
      placePiece(p, g.x, g.y, MAP_UNIT_PX);
      for (const l of p.layers) l.img.setDepth(g.y);
      addPiece(p, this.world.layers.world);
      return p.layers.map((l) => l.img);
    };
    this.gate = { closed: piece('gate-closed'), open: piece('gate-open') };
    this.setGate(false);
    const s = frontAnchor(layout.stocks.rect);
    const stocks = this.world.lib.piece('stocks');
    placePiece(stocks, s.x, s.y, MAP_UNIT_PX);
    for (const l of stocks.layers) l.img.setDepth(s.y);
    addPiece(stocks, this.world.layers.world);

    this.setOpenStalls(this.source.openStalls ?? layout.stalls.map((x) => x.id));
    this.overlay = this.opts.overlay?.(this) ?? null;
    this.opts.onReady?.(this);
  }

  /** Rigs and stalls alive (stress readout). */
  get counts() {
    return { rigs: this.world.rigs.size, characters: this.chars.size };
  }

  override update(_time: number, delta: number) {
    const dt = Math.min(Math.max(0, delta), 100);
    const f = this.source.frame(dt);
    if (f) this.draw(f);
    else this.clearCharacters();
    this.world.update(dt);
    this.overlay?.update(this.feet);
  }

  private draw(f: FrameInput) {
    const { view, prev, alpha } = f;
    this.syncStalls(view);
    this.setGate(view.gateOpen);
    const seen = new Set<SceneEntityId>();
    this.feet.clear();
    for (const c of view.characters) {
      seen.add(c.id);
      let s = this.chars.get(c.id);
      const look = lookKey(c.outfit);
      if (!s) {
        s = { rig: this.world.rig('citizen', { outfit: c.outfit }), look };
        this.chars.set(c.id, s);
      } else if (s.look !== look) {
        s.rig.setOutfit(c.outfit);
        s.look = look;
      }
      const p = prev.get(c.id);
      const x = p ? p.x + (c.x - p.x) * alpha : c.x;
      const y = p ? p.y + (c.y - p.y) * alpha : c.y;
      const at = camera.toScreen({ x, y });
      // Y-sort by foot point; ties break by entity id (SPEC §12.2).
      s.rig.setPosition(at.x, at.y, at.y + c.id * 1e-6);
      s.rig.face(c.facing);
      s.rig.play(c.pose, { speed: GAIT_RATE[c.gait] });
      this.feet.set(c.id, at);
    }
    for (const [id, s] of this.chars) {
      if (seen.has(id)) continue;
      this.dropRig(s.rig);
      this.chars.delete(id);
    }
  }

  private syncStalls(view: WorldView) {
    const byStall = new Map<number, MerchantView>();
    for (const m of view.merchants) byStall.set(m.stall, m);
    for (const sv of view.stalls) {
      const slot = this.stalls.get(sv.id);
      if (!slot) continue;
      if (slot.sprite.open !== sv.open) slot.sprite.setOpen(sv.open);
      const items = `${sv.counter.join(',')}/${sv.shelf.join(',')}`;
      if (items !== slot.items) {
        slot.items = items;
        slot.sprite.setItems(sv.counter, sv.shelf);
      }
      this.syncMerchant(sv.id, slot, sv.open, byStall.get(sv.id) ?? null, view.merchants.length);
    }
  }

  private syncMerchant(
    id: number,
    slot: StallSlot,
    open: boolean,
    m: MerchantView | null,
    simMerchants: number,
  ) {
    // Placeholders only while the sim has no merchants at all (before TF8).
    const want = open && (m !== null || simMerchants === 0);
    if (!want) {
      if (slot.merchant) {
        slot.sprite.setMerchant(null);
        this.dropRig(slot.merchant);
        slot.merchant = null;
      }
      return;
    }
    if (!slot.merchant) {
      slot.merchant = this.world.rig(
        'merchant',
        { tints: placeholderLook(id), scale: slot.box.unitPx / MAP_UNIT_PX },
        slot.sprite.merchantParent,
      );
      slot.sprite.setMerchant(slot.merchant);
    }
    slot.placeholder = m === null;
    if (!m) {
      slot.merchant.setView('front');
      slot.merchant.play('idle');
      slot.sprite.setMerchantDepth(0);
      return;
    }
    const span = slot.counterY - slot.shelfY;
    const depth = span > 0 ? (slot.counterY - m.y) / span : 0;
    const f = CONTENT.layout.stalls[id]!.footprint;
    slot.sprite.setMerchantDepth(depth, ((m.x - f.x) / f.w) * 104);
    slot.merchant.face(m.facing);
    slot.merchant.play(m.pose, { speed: GAIT_RATE[m.gait] });
  }

  private setOpenStalls(open: readonly number[]) {
    for (const [id, slot] of this.stalls) {
      const isOpen = open.includes(id);
      slot.sprite.setOpen(isOpen);
      this.syncMerchant(id, slot, isOpen, null, 0);
    }
  }

  private setGate(open: boolean) {
    if (open === this.gateOpen || !this.gate) return;
    this.gateOpen = open;
    for (const i of this.gate.closed) i.setVisible(!open);
    for (const i of this.gate.open) i.setVisible(open);
  }

  private clearCharacters() {
    for (const s of this.chars.values()) this.dropRig(s.rig);
    this.chars.clear();
    this.feet.clear();
  }

  private dropRig(rig: RigSprite) {
    rig.destroy();
    this.world.rigs.delete(rig);
  }
}

export function createMarketGame(
  parent: HTMLElement,
  source: SceneSource,
  opts: MarketSceneOptions = {},
): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: CANVAS_W,
    height: CANVAS_H,
    backgroundColor: theme.color.background.hex,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    banner: false,
    scene: [new MarketScene(source, opts)],
  });
}
