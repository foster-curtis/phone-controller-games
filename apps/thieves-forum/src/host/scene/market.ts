// The market scene (SPEC §6.3, §6.6, §6.11–§6.13, §6.16, §12.2): Phaser renders only. Floor tiles on the
// ground layer with the guards' view cones (cut at stalls, red while chasing); on the y-sorted world
// layer the ten stalls (open or closed by the match's open set), the top gate, the stocks (an occupant
// is drawn into them, with a countdown above), every citizen on the shared rig with its outfit, the
// merchants inside their stalls (the glance staged as wind-up → look → point or settle, TF1-fix-2) and
// the guards; on the overlay the effects the TV events call for: the glance swoosh, "THIEF!" bubbles,
// the guard's "!", the catch starburst with the pot's coin flight, and the grab flourish.
// Disguise (SPEC §6.11): everything comes from `WorldView` and `tv` events (no player state is
// imported; scene/__tests__/disguise.test.ts). A merchant's routine glance looks along his own counter;
// only a glance that caught a theft (`shoutingAt`) turns to the thief (BUILD_PLAN §8 [C1]).
// Later milestones fill the scene modules (`coinToss`, `reveal`, `podium`, `transition`, `effects/`).
// The dev overlay is injected by main.ts behind `?debug=1`.
import * as Phaser from 'phaser';
import { CONTENT } from '../../content';
import type { FabricId, Vec2 } from '../../content/types';
import { theme } from '../../shared/theme';
import { ATLASES } from '../render/assets';
import { addPiece, pickAtlasScale, placePiece, preloadAtlases } from '../render/atlas';
import { CANVAS_H, CANVAS_W, MAP_UNIT_PX } from '../render/camera';
import { planGlance, playGlanceStep, resolveGlance } from '../render/glance';
import type { RigSprite } from '../render/rig';
import type { StallSprite } from '../render/stall';
import type { StocksSprite } from '../render/stocks';
import { guardTints, merchantTints } from '../render/tones';
import type { GlancePlan } from '../render/types';
import { RenderWorld } from '../render/world';
import type {
  CharacterView,
  GuardView,
  MerchantView,
  TvEvent,
  WorldView,
} from '../sim/snapshot';
import coinToss from './coinToss';
import { conePolygon } from './cone';
import effects from './effects/index';
import type { SceneKit, SceneModule } from './modules';
import { camera, floorTiles, frontAnchor, stallBox, type StallBox } from './placement';
import podium from './podium';
import reveal from './reveal';
import transition from './transition';
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

/** Screen px from a foot point up to just above the head (108 px characters, SPEC §12.2). */
const HEAD_PX = 118;
/** The merchant behind his counter stands this much higher on screen than his ground point. */
const MERCHANT_HEAD_PX = 96;
/** Cone fill alpha (translucent, SPEC §6.12) and the alert cone's. */
const CONE_ALPHA = 0.16;
const CONE_ALERT_ALPHA = 0.26;
/** "THIEF!" stays up as long as the merchant shouts (MERCHANT_TUNING.shoutMs). */
const SHOUT_BUBBLE_MS = 2500;
/** The pot's coin flight from thief to catcher, ms. */
const COIN_FLIGHT_MS = 650;

export interface MarketSceneOptions {
  /** Dev overlay factory (debug only, main.ts). */
  overlay?: (scene: Phaser.Scene) => SceneOverlay;
  /** Called once the atlases are loaded and the market is built. */
  onReady?: (scene: MarketScene) => void;
}

interface CharSprite {
  rig: RigSprite;
  look: string;
  /** The facing the rig's view was last picked from (view hysteresis). */
  facing: number;
}

/**
 * A rig's view changes only once the facing has turned this far (radians) from the facing it was
 * picked from: steering wobble near a view boundary would otherwise rebuild the rig every frame
 * (BUILD_PLAN §8 [TF7] perf).
 */
const FACE_HYSTERESIS = 0.35;

const angleDiff = (a: number, b: number) => {
  const d = Math.abs(a - b) % (Math.PI * 2);
  return d > Math.PI ? Math.PI * 2 - d : d;
};

/** A merchant's glance in progress on his rig (TF1-fix-2 hook). */
interface GlanceRun {
  stage: 'windup' | 'look' | 'point' | 'settle';
  plan: GlancePlan;
  /** Settle: ms left before he resumes the sim's pose. */
  left: number;
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
  glance: GlanceRun | null;
}

const lookKey = (o: { tunic: string; mantle: string; hair: number; skin: number }) =>
  `${o.tunic}|${o.mantle}|${o.hair}|${o.skin}`;

/** Screen px per floor-tile unit (80 units per 48 px tile, BUILD_PLAN §8 [TF1]). */
const FLOOR_UNIT_PX = 0.6;

const FABRICS = Object.keys(theme.fabric) as FabricId[];

/** A fixed look per stall for the merchants (no randomness on the TV). */
function placeholderLook(stall: number) {
  return merchantTints({
    tunic: FABRICS[(stall * 3 + 1) % FABRICS.length]!,
    wrap: FABRICS[(stall * 5 + 2) % FABRICS.length]!,
    hair: stall % 6,
    skin: (stall * 2 + 1) % 6,
  });
}

const SCENE_MODULES: readonly SceneModule[] = [coinToss, reveal, podium, transition, effects];

export class MarketScene extends Phaser.Scene {
  world!: RenderWorld;
  private readonly chars = new Map<SceneEntityId, CharSprite>();
  private readonly guards = new Map<SceneEntityId, CharSprite>();
  private readonly stalls = new Map<number, StallSlot>();
  private gateOpen: boolean | null = null;
  private gate: { closed: Phaser.GameObjects.Image[]; open: Phaser.GameObjects.Image[] } | null =
    null;
  private stocks: StocksSprite | null = null;
  private stocksTexts: Phaser.GameObjects.Text[] = [];
  private cones: Phaser.GameObjects.Graphics | null = null;
  private overlay: SceneOverlay | null = null;
  private readonly feet = new Map<SceneEntityId, Vec2>();
  /** Merchants' and guards' foot points (effects; never handed to the dev overlay). */
  private readonly others = new Map<SceneEntityId, Vec2>();
  private readonly scale1 = pickAtlasScale();
  private kit!: SceneKit;

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
    this.buildFloor();
    this.cones = this.add.graphics();
    this.world.layers.ground.add(this.cones);
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
        glance: null,
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
    this.stocks = this.world.stocks();
    this.stocks.setPosition(s.x, s.y);
    this.stocksTexts = layout.stocks.slots.map((slot) => {
      const at = camera.toScreen(slot);
      const t = this.add
        .text(at.x, at.y - HEAD_PX - 8, '', {
          fontFamily: theme.font.mono,
          fontSize: '26px',
          fontStyle: 'bold',
          color: theme.color.gold.hex,
          stroke: theme.color.background.hex,
          strokeThickness: 5,
        })
        .setOrigin(0.5, 1)
        .setVisible(false);
      this.world.layers.overlay.add(t);
      return t;
    });

    this.kit = {
      scene: this,
      world: this.world,
      toScreen: (p, z) => camera.toScreen(p, z),
      foot: (id) => this.feet.get(id) ?? this.others.get(id) ?? null,
      head: (id) => this.headOf(id),
    };
    this.setOpenStalls(this.source.openStalls ?? layout.stalls.map((x) => x.id));
    this.overlay = this.opts.overlay?.(this) ?? null;
    this.opts.onReady?.(this);
  }

  /**
   * The paving: one tile sprite repeating the floor tile over the market (one draw instead of ~1500
   * images, BUILD_PLAN §8 [TF7] perf), or the per-tile images when the frame fell back to a shape.
   */
  private buildFloor() {
    const { layout } = CONTENT;
    const tile = this.world.lib.piece('floor-tile');
    const img = tile.layers[0]!.img;
    if (tile.layers.length === 1 && this.world.lib.has('floor-tile')) {
      const w = layout.size.w * camera.tilePx;
      const h = layout.size.h * camera.tilePx * camera.groundFactor;
      const ts = this.add
        .tileSprite(0, 0, w, h, img.texture.key, img.frame.name)
        .setOrigin(0, 0)
        .setTileScale(FLOOR_UNIT_PX / tile.ppuX, FLOOR_UNIT_PX / tile.ppuY);
      this.world.layers.ground.add(ts);
      img.destroy();
      return;
    }
    img.destroy();
    for (const t of floorTiles(layout)) {
      const p = this.world.lib.piece('floor-tile');
      placePiece(p, t.x, t.y, FLOOR_UNIT_PX);
      addPiece(p, this.world.layers.ground);
    }
  }

  /** Rigs and stalls alive (stress readout). */
  get counts() {
    return { rigs: this.world.rigs.size, characters: this.chars.size };
  }

  /**
   * Screen points just above these characters' heads (1920 × 1080 px), for the reveal cards
   * (`TvAnchors`, SPEC §6.14). Ids not on screen are left out.
   */
  anchorsFor(ids: readonly SceneEntityId[]): Record<number, Vec2> {
    const out: Record<number, Vec2> = {};
    for (const id of ids) {
      const h = this.headOf(id);
      if (h) out[id] = h;
    }
    return out;
  }

  override update(_time: number, delta: number) {
    const dt = Math.min(Math.max(0, delta), 100);
    const f = this.source.frame(dt);
    if (f) this.draw(f, dt);
    else this.clearRound();
    this.world.update(dt);
    this.overlay?.update(this.feet);
  }

  private headOf(id: SceneEntityId): Vec2 | null {
    const c = this.feet.get(id);
    if (c) return { x: c.x, y: c.y - HEAD_PX };
    const o = this.others.get(id);
    return o ? { x: o.x, y: o.y - HEAD_PX } : null;
  }

  private draw(f: FrameInput, dt: number) {
    const { view, prev, alpha } = f;
    this.others.clear();
    this.syncStalls(view, dt);
    this.setGate(view.gateOpen);
    const inStocks = new Set<SceneEntityId>();
    for (const s of view.stocks) if (s.character !== null) inStocks.add(s.character);
    const seen = new Set<SceneEntityId>();
    this.feet.clear();
    for (const c of view.characters) {
      seen.add(c.id);
      let s = this.chars.get(c.id);
      const look = lookKey(c.outfit);
      if (!s) {
        s = { rig: this.world.rig('citizen', { outfit: c.outfit }), look, facing: c.facing };
        s.rig.face(c.facing);
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
      if (angleDiff(c.facing, s.facing) > FACE_HYSTERESIS) {
        s.facing = c.facing;
        s.rig.face(c.facing);
      }
      s.rig.play(c.pose, { speed: GAIT_RATE[c.gait] });
      // A thief in the stocks is drawn into the stocks themselves (TF1-fix-1 hook).
      s.rig.setVisible(!inStocks.has(c.id));
      this.feet.set(c.id, at);
    }
    for (const [id, s] of this.chars) {
      if (seen.has(id)) continue;
      this.dropRig(s.rig);
      this.chars.delete(id);
    }
    this.syncGuards(view);
    this.drawCones(view);
    this.syncStocks(view);
    for (const e of f.events ?? []) {
      this.onEvent(e, view);
      for (const m of SCENE_MODULES) m.event?.(e, view, this.kit);
    }
    for (const m of SCENE_MODULES) m.frame?.(view, dt, this.kit);
  }

  // ---- TV events (SPEC §6.16 "visible events") ---------------------------------------------------

  private onEvent(e: TvEvent, view: WorldView) {
    const fx = this.world.fx;
    switch (e.e) {
      case 'glanceWindup': {
        const h = this.headOf(e.by);
        if (h) fx.spawn('glanceSwoosh', h);
        return;
      }
      case 'shout': {
        const h = this.headOf(e.by);
        if (h) fx.spawn('thiefBubble', { x: h.x, y: h.y - 18 }, { ms: SHOUT_BUBBLE_MS });
        return;
      }
      case 'guardSpot': {
        const h = this.headOf(e.guard);
        if (h) fx.spawn('alertBang', { x: h.x, y: h.y - 10 });
        return;
      }
      case 'merchantQuestion': {
        const h = this.headOf(e.merchant);
        if (h) fx.spawn('questionBubble', { x: h.x, y: h.y - 10 });
        return;
      }
      case 'grabAttempt': {
        const t = this.headOf(e.at);
        if (t) fx.spawn('speedLines', { x: t.x, y: t.y + 50 });
        return;
      }
      case 'caught': {
        const t = this.headOf(e.thief);
        if (t) fx.spawn('caughtBurst', t);
        const to = this.headOf(e.to);
        if (t && to && e.coins > 0) fx.coinArc(t, to, COIN_FLIGHT_MS);
        return;
      }
      default:
        void view;
        return;
    }
  }

  // ---- guards and cones (SPEC §6.12) -------------------------------------------------------------

  private syncGuards(view: WorldView) {
    const seen = new Set<SceneEntityId>();
    for (const g of view.guards) {
      seen.add(g.id);
      let s = this.guards.get(g.id);
      if (!s) {
        s = {
          rig: this.world.rig('guard', { tints: guardTints(g.id % 6) }),
          look: '',
          facing: g.facing,
        };
        s.rig.face(g.facing);
        this.guards.set(g.id, s);
      }
      const at = camera.toScreen({ x: g.x, y: g.y });
      s.rig.setPosition(at.x, at.y, at.y + g.id * 1e-6);
      if (angleDiff(g.facing, s.facing) > FACE_HYSTERESIS) {
        s.facing = g.facing;
        s.rig.face(g.facing);
      }
      s.rig.play(g.pose, { speed: GAIT_RATE[g.gait] });
      this.others.set(g.id, at);
    }
    for (const [id, s] of this.guards) {
      if (seen.has(id)) continue;
      this.dropRig(s.rig);
      this.guards.delete(id);
    }
  }

  private drawCones(view: WorldView) {
    const gfx = this.cones;
    if (!gfx) return;
    gfx.clear();
    for (const g of view.guards) this.drawCone(gfx, g, view.gateOpen);
  }

  private drawCone(gfx: Phaser.GameObjects.Graphics, g: GuardView, gateOpen: boolean) {
    const poly = conePolygon(g, CONTENT.layout, gateOpen).map((p) => camera.toScreen(p));
    const color = g.cone.alert ? theme.color.coneAlert.num : theme.color.coneIdle.num;
    gfx.fillStyle(color, g.cone.alert ? CONE_ALERT_ALPHA : CONE_ALPHA);
    gfx.beginPath();
    gfx.moveTo(poly[0]!.x, poly[0]!.y);
    for (let i = 1; i < poly.length; i++) gfx.lineTo(poly[i]!.x, poly[i]!.y);
    gfx.closePath();
    gfx.fillPath();
  }

  // ---- stocks (SPEC §6.13) -----------------------------------------------------------------------

  private syncStocks(view: WorldView) {
    let occupant: CharacterView | null = null;
    for (const s of view.stocks) {
      const text = this.stocksTexts[s.slot];
      const c =
        s.character === null ? null : (view.characters.find((x) => x.id === s.character) ?? null);
      if (c && !occupant) occupant = c;
      if (!text) continue;
      text.setVisible(c !== null);
      if (c) text.setText(String(Math.ceil(s.endsInMs / 1000)));
    }
    this.stocks?.setOccupant(occupant ? occupant.outfit : null);
  }

  // ---- stalls and merchants (SPEC §6.6) ----------------------------------------------------------

  private syncStalls(view: WorldView, dt: number) {
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
      const m = byStall.get(sv.id) ?? null;
      this.syncMerchant(sv.id, slot, sv.open, m, view.merchants.length);
      if (m && slot.merchant) {
        this.others.set(m.id, this.merchantFoot(m));
        this.stepGlance(sv.id, slot, slot.merchant, m, view, dt);
      }
    }
  }

  /** Where a merchant's head reads on screen: his ground point, lifted behind the counter. */
  private merchantFoot(m: MerchantView): Vec2 {
    const at = camera.toScreen({ x: m.x, y: m.y });
    return { x: at.x, y: at.y - (MERCHANT_HEAD_PX - HEAD_PX) };
  }

  /**
   * The glance on his rig (TF1-fix-2 hook): wind-up turns the head toward his own counter, the look
   * turns him; after a look that caught a theft he points at the thief, else he settles back.
   */
  private stepGlance(
    id: number,
    slot: StallSlot,
    rig: RigSprite,
    m: MerchantView,
    view: WorldView,
    dt: number,
  ) {
    const run = slot.glance;
    if (m.glance === 'windup' && run?.stage !== 'windup') {
      const counter = CONTENT.layout.stalls[id]!.customer;
      const dir = { x: (counter.x0 + counter.x1) / 2 - m.x, y: 1 };
      const plan = planGlance('merchant', m.facing, dir, { seed: m.id });
      slot.glance = { stage: 'windup', plan, left: 0 };
      playGlanceStep(rig, plan.windup);
      return;
    }
    if (m.glance === 'look' && run && run.stage === 'windup') {
      run.stage = 'look';
      playGlanceStep(rig, run.plan.look);
      return;
    }
    if (m.shoutingAt !== null) {
      if (run?.stage === 'point') return;
      const thief = view.characters.find((c) => c.id === m.shoutingAt);
      const dir = thief ? { x: thief.x - m.x, y: thief.y - m.y } : { x: 0, y: 1 };
      const plan = planGlance('merchant', m.facing, dir, { seed: m.id });
      slot.glance = { stage: 'point', plan, left: 0 };
      playGlanceStep(rig, resolveGlance(plan, 'caught')[0]!);
      return;
    }
    if (!run) return;
    if (m.glance === 'none' && (run.stage === 'look' || run.stage === 'windup')) {
      const settle = resolveGlance(run.plan, 'clear')[0]!;
      run.stage = 'settle';
      run.left = settle.ms ?? 0;
      playGlanceStep(rig, settle);
      return;
    }
    if (run.stage === 'point' || (run.stage === 'settle' && (run.left -= dt) <= 0)) {
      slot.glance = null; // resume the sim's pose next frame
    }
  }

  private syncMerchant(
    id: number,
    slot: StallSlot,
    open: boolean,
    m: MerchantView | null,
    simMerchants: number,
  ) {
    // Placeholders only while the sim has no merchants at all (the lobby backdrop).
    const want = open && (m !== null || simMerchants === 0);
    if (!want) {
      if (slot.merchant) {
        slot.sprite.setMerchant(null);
        this.dropRig(slot.merchant);
        slot.merchant = null;
        slot.glance = null;
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
      slot.glance = null;
      slot.merchant.setView('front');
      slot.merchant.play('idle');
      slot.sprite.setMerchantDepth(0);
      return;
    }
    const span = slot.counterY - slot.shelfY;
    const depth = span > 0 ? (slot.counterY - m.y) / span : 0;
    const f = CONTENT.layout.stalls[id]!.footprint;
    slot.sprite.setMerchantDepth(depth, ((m.x - f.x) / f.w) * 104);
    // While a glance runs, its steps own the rig's view and clip.
    if (slot.glance) return;
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

  /** No round on screen: characters, guards, cones and stocks occupants go. */
  private clearRound() {
    for (const s of this.chars.values()) this.dropRig(s.rig);
    this.chars.clear();
    for (const s of this.guards.values()) this.dropRig(s.rig);
    this.guards.clear();
    this.feet.clear();
    this.others.clear();
    this.cones?.clear();
    this.stocks?.setOccupant(null);
    for (const t of this.stocksTexts) t.setVisible(false);
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
