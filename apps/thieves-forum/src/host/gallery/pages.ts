// Gallery pages (SPEC §6.21, BUILD_PLAN TF1): every rig × view × clip with outfits cycling from the
// shared pool; every stall open and closed in its canopy color with its items; items and map
// pieces; effects; and the stress crowd (SPEC §7: 8 players → 24 NPCs, 4 guards, 10 merchants)
// walking random paths. Each builder lays its page out on the 1920 × 1080 canvas.
import { balance, itemsOf, ITEMS, SHOP_IDS, type Outfit, type ShopId } from '../../content';
import { theme } from '../../shared/theme';
import { placePiece, addPiece } from '../render/atlas';
import { CANVAS_H, CANVAS_W } from '../render/camera';
import { clipNames } from '../render/clips/index';
import type { RigSprite } from '../render/rig';
import { itemFrame } from '../render/stall';
import { guardTints, merchantTints } from '../render/tones';
import { EFFECT_KINDS, type RigId, type ViewId } from '../render/types';
import type { RenderWorld } from '../render/world';

export const PAGES = [
  'citizen',
  'merchant',
  'guard',
  'stalls',
  'items',
  'effects',
  'stress',
] as const;
export type PageId = (typeof PAGES)[number];

export interface PageKit {
  world: RenderWorld;
  label(text: string, x: number, y: number, size?: number): void;
  /** Called every frame with dt and total ms. */
  tick(fn: (dt: number, t: number) => void): void;
}

const pick = <T>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)]!;
const FABRICS = Object.keys(theme.fabric) as (keyof typeof theme.fabric)[];

/** A random outfit from the shared pool (SPEC §6.11). */
export function randomOutfit(): Outfit {
  const pool = balance.outfit;
  return {
    tunic: pick(pool.tunics),
    mantle: pick(pool.mantles),
    hair: Math.floor(Math.random() * pool.hairTones),
    skin: Math.floor(Math.random() * pool.skinTones),
  };
}

export function randomLook(rig: RigId) {
  if (rig === 'merchant')
    return merchantTints({
      tunic: pick(FABRICS),
      wrap: pick(FABRICS),
      hair: Math.floor(Math.random() * balance.outfit.hairTones),
      skin: Math.floor(Math.random() * balance.outfit.skinTones),
    });
  return guardTints(Math.floor(Math.random() * balance.outfit.skinTones));
}

const VIEWS: { view: ViewId; mirror: boolean; label: string }[] = [
  { view: 'front', mirror: false, label: 'front' },
  { view: 'side', mirror: false, label: 'side' },
  { view: 'side', mirror: true, label: 'side ←' },
  { view: 'back', mirror: false, label: 'back' },
];

/** Restarts one-shot clips after a short rest so every pose stays visible. */
function keepPlaying(kit: PageKit, rig: RigSprite, clip: string) {
  let rest = 0;
  kit.tick((dt) => {
    if (!rig.clipDone) return;
    rest += dt;
    if (rest > 500) {
      rest = 0;
      rig.play(clip, { restart: true, fadeMs: 0 });
    }
  });
}

function rigPage(rigId: RigId) {
  return (kit: PageKit) => {
    const clips = clipNames(rigId);
    const cols = 5;
    const rows = Math.ceil(clips.length / cols);
    const cellW = CANVAS_W / cols;
    const cellH = (CANVAS_H - 60) / rows;
    const rigs: RigSprite[] = [];
    clips.forEach((clip, i) => {
      const cx = (i % cols) * cellW;
      const cy = 60 + Math.floor(i / cols) * cellH;
      const y = cy + cellH / 2 + 80;
      kit.label(clip, cx + cellW / 2, y - 160, 18);
      VIEWS.forEach((v, j) => {
        const x = cx + 52 + j * 92;
        const r = kit.world.rig(rigId, {
          view: v.view,
          mirror: v.mirror,
          ...(rigId === 'citizen' ? { outfit: randomOutfit() } : { tints: randomLook(rigId) }),
          clip,
        });
        r.setPosition(x, y);
        if (i === 0) kit.label(v.label, x, y + 8, 12);
        keepPlaying(kit, r, clip);
        rigs.push(r);
      });
    });
    // Outfit cycling: the same rig and clips serve any outfit (SPEC §6.11).
    let t = 0;
    kit.tick((dt) => {
      t += dt;
      if (t < 1500) return;
      t = 0;
      for (const r of rigs) {
        if (rigId === 'citizen') r.setOutfit(randomOutfit());
        else for (const [slot, c] of Object.entries(randomLook(rigId))) r.setTint(slot as never, c);
      }
    });
  };
}

/** A shop's stock split by default placement (counter / back shelf), 4 spots each. */
function stockOf(shop: ShopId): { counter: (string | null)[]; shelf: (string | null)[] } {
  const items = itemsOf(shop);
  return {
    counter: items
      .filter((i) => i.placement === 'counter')
      .map((i) => i.id)
      .slice(0, 4),
    shelf: items
      .filter((i) => i.placement === 'shelf')
      .map((i) => i.id)
      .slice(0, 4),
  };
}

function stallsPage(kit: PageKit) {
  const u = 1.7;
  const w = 104 * u;
  const gap = (CANVAS_W - w * 10) / 11;
  [true, false].forEach((open, row) => {
    const y = 90 + row * 470;
    kit.label(open ? 'open (merchant walks counter ↔ shelf)' : 'closed', CANVAS_W / 2, y - 40, 20);
    SHOP_IDS.forEach((shop, i) => {
      const x = gap + i * (w + gap);
      const s = kit.world.stall(shop, u);
      s.setPosition(x, y);
      const stock = stockOf(shop);
      s.setItems(stock.counter, stock.shelf);
      s.setOpen(open);
      kit.label(shop, x + w / 2, y + 96 * u + 8, 14);
      if (!open) return;
      const m = kit.world.rig(
        'merchant',
        { tints: randomLook('merchant'), scale: u / 3 },
        s.merchantParent,
      );
      s.setMerchant(m);
      let t = i * 400;
      kit.tick((dt) => {
        t += dt;
        const phase = (t % 6000) / 6000;
        const depth =
          phase < 0.4
            ? 0
            : phase < 0.5
              ? (phase - 0.4) * 10
              : phase < 0.9
                ? 1
                : 1 - (phase - 0.9) * 10;
        s.setMerchantDepth(depth);
        const moving = (phase >= 0.4 && phase < 0.5) || phase >= 0.9;
        m.setView(depth > 0.5 || (phase >= 0.4 && phase < 0.5) ? 'back' : 'front');
        m.play(moving ? 'walk' : depth >= 1 ? 'fetch' : 'idle');
      });
    });
  });
}

function itemsPage(kit: PageKit) {
  const cols = 12;
  const cell = 130;
  ITEMS.forEach((item, i) => {
    const x = 120 + (i % cols) * (cell + 18);
    const y = 110 + Math.floor(i / cols) * 170;
    const p = kit.world.lib.piece(itemFrame(kit.world.lib, item.id));
    placePiece(p, x, y, 2.5);
    addPiece(p, kit.world.layers.world);
    kit.label(`${item.name} · ${item.value} d`, x, y + 48, 12);
  });
  // Map pieces: paving, the gate both ways, the stocks with a thief in them.
  const mapY = 640;
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 4; j++) {
      const p = kit.world.lib.piece('floor-tile');
      placePiece(p, 80 + i * 48, mapY + j * 28.8, 0.6);
      addPiece(p, kit.world.layers.ground);
    }
  }
  kit.label('floor-tile', 224, mapY + 130, 14);
  (['gate-closed', 'gate-open'] as const).forEach((name, i) => {
    const p = kit.world.lib.piece(name);
    const x = 520 + i * 140;
    placePiece(p, x, mapY + 280, 3);
    addPiece(p, kit.world.layers.world);
    kit.label(name, x, mapY + 290, 14);
  });
  const stocksX = 1000;
  const stocksY = mapY + 260;
  const thief = kit.world.rig('citizen', { outfit: randomOutfit(), clip: 'stocks' });
  thief.setPosition(stocksX, stocksY - 6, stocksY - 1);
  const st = kit.world.lib.piece('stocks');
  placePiece(st, stocksX, stocksY, 3);
  st.layers.forEach((l) => l.img.setDepth(stocksY));
  addPiece(st, kit.world.layers.world);
  kit.label('stocks + citizen stocks clip', stocksX, stocksY + 14, 14);
  (['view-cone', 'view-cone-alert'] as const).forEach((name, i) => {
    const p = kit.world.lib.piece(name);
    placePiece(p, 1300, mapY + 40 + i * 140, 2);
    addPiece(p, kit.world.layers.ground);
    kit.label(name, 1440, mapY + 110 + i * 140, 14);
  });
  for (const [i, name] of (['podium', 'merchant-face'] as const).entries()) {
    const p = kit.world.lib.piece(name);
    placePiece(p, 1700, mapY + 120 + i * 200, i === 0 ? 0.9 : 3);
    addPiece(p, kit.world.layers.world);
  }
}

function effectsPage(kit: PageKit) {
  const kinds = EFFECT_KINDS;
  const cols = 7;
  kinds.forEach((kind, i) => {
    const x = 140 + (i % cols) * 260;
    const y = 220 + Math.floor(i / cols) * 300;
    kit.label(kind, x, y + 90, 16);
    const fire = () =>
      kit.world.fx.spawn(
        kind,
        { x, y },
        kind === 'playerRing' ? { tint: theme.players.cobalt.fill.num } : {},
      );
    fire();
    let t = 0;
    kit.tick((dt) => {
      t += dt;
      if (t > 2200) {
        t = 0;
        fire();
      }
    });
  });
  // The coin toss: a citizen throws, the coin arcs, lands flat and glints (ART_NOTES).
  const thrower = kit.world.rig('citizen', { view: 'side', outfit: randomOutfit(), clip: 'throw' });
  const tx = 200;
  const ty = 960;
  thrower.setPosition(tx, ty);
  kit.label('coin toss', tx + 200, ty + 10, 16);
  let t = 0;
  let thrown = false;
  kit.tick((dt) => {
    t += dt;
    if (!thrown && t > 380) {
      thrown = true;
      const hand = thrower.attach('hand') ?? { x: tx, y: ty - 60 };
      kit.world.fx.coinArc(hand, { x: tx + 380, y: ty - 4 });
    }
    if (t > 2600) {
      t = 0;
      thrown = false;
      thrower.play('throw', { restart: true, fadeMs: 0 });
    }
  });
}

export const PAGE_BUILDERS: Record<Exclude<PageId, 'stress'>, (kit: PageKit) => void> = {
  citizen: rigPage('citizen'),
  merchant: rigPage('merchant'),
  guard: rigPage('guard'),
  stalls: stallsPage,
  items: itemsPage,
  effects: effectsPage,
};
