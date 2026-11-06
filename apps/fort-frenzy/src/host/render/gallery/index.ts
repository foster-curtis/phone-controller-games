// The art gallery (BUILD_PLAN FF3): `index.html?gallery=1` in dev or with `?debug=1`. One Phaser
// scene per page, rebuilt on every control change; `&stress=1` runs the SPEC §15.2 peak load with a
// timing overlay instead. `window.__pcgGallery` reports readiness and fallback shapes for e2e.
import * as Phaser from 'phaser';
import { manifest } from '../../../../generated/manifest';
import { content } from '../../../content';
import { groundBody } from '../../sim/body';
import { LANE_IDS, PLAYER_COLOR_IDS } from '../../../shared/ids';
import { theme } from '../../../shared/theme';
import { neonKnightsHost } from '../../../themes/neon-knights/host';
import type { ThemeAssets } from '../../../themes/types';
import { pickAtlasScale, preloadAtlases } from '../atlas';
import { CANVAS_H, CANVAS_W } from '../camera';
import { RenderWorld } from '../world';
import { PAGE_BUILDERS, type PageKit, type Unit } from './pages';
import { CLIP_NAMES, PAGES, readState, writeState, type GalleryState } from './state';
import { runStress } from './stress';

export interface GalleryProbe {
  ready: boolean;
  page: string;
  fallbacks: number;
  missing: string[];
  atlasScale: 1 | 2;
  /** Live pooled effects (bursts, tracers, rings…). */
  effects?: number;
}

declare global {
  interface Window {
    __pcgGallery?: GalleryProbe;
  }
}

const assets = manifest.themes['neon-knights'] as ThemeAssets;
/** Content's enemy body hitboxes by rig id (C4), drawn with the hitbox toggle. */
const ENEMY_BODIES = new Map(
  content.enemies.flatMap((e) =>
    e.body ? [[neonKnightsHost.rigFor.enemy[e.id], groundBody(e.body)] as const] : [],
  ),
);
const scale = pickAtlasScale();
const stress = new URLSearchParams(location.search).get('stress') === '1';

class GalleryScene extends Phaser.Scene {
  private world!: RenderWorld;
  private units: Unit[] = [];
  private ticks: ((dt: number, t: number) => void)[] = [];
  private t = 0;
  private hitboxes: PageKit['hitboxes'] = [];
  private state!: GalleryState;

  constructor() {
    super('gallery');
  }

  preload() {
    const fresh = neonKnightsHost.atlases.filter((a) => !this.textures.exists(a.key));
    preloadAtlases(this, fresh, scale);
  }

  create() {
    this.state = readState();
    this.units = [];
    this.ticks = [];
    this.hitboxes = [];
    this.t = 0;
    this.world = new RenderWorld(this, neonKnightsHost, assets, scale, { bloom: true });
    if (stress) {
      const s = runStress(this.world);
      this.ticks.push(s.tick);
      this.units = s.units;
    } else {
      this.world.bloom?.setEnabled(this.state.bloom);
      const kit: PageKit = {
        world: this.world,
        state: this.state,
        units: this.units,
        hitboxes: this.hitboxes,
        label: (text, sx, sy, size = 12) => {
          const t = this.add
            .text(sx, sy, text, {
              fontFamily: theme.font.sans,
              fontSize: `${size}px`,
              color: theme.color.muted.hex,
              align: 'center',
            })
            .setOrigin(0.5, 0);
          this.world.layers.worldUi.add(t);
        },
        tick: (fn) => this.ticks.push(fn),
      };
      PAGE_BUILDERS[this.state.page](kit);
    }
    this.world.update(0);
    window.__pcgGallery = {
      ready: true,
      page: stress ? 'stress' : this.state.page,
      fallbacks: this.world.lib.fallbacks,
      missing: [...this.world.lib.missing],
      atlasScale: scale,
    };
  }

  override update(_time: number, delta: number) {
    const dt = Math.min(delta, 100);
    this.t += dt;
    for (const fn of this.ticks) fn(dt, this.t);
    this.world.update(dt);
    const m = this.world.marks;
    m.begin();
    const color = theme.players[this.state.color].fill.num;
    for (const u of this.units) {
      const [w, h] = u.info.shadow;
      if (w > 0) m.shadow(u.sx, u.sy, w * 2, h * 2);
      if (u.knight) {
        m.ring(u.sx, u.sy, u.info.ring ?? 0.6, u.color ?? color, u.aim);
        m.carry(
          u.sx,
          u.sy,
          u.info.ring ?? 0.6,
          this.state.carry,
          u.rig.rigId === 'artificer' ? 8 : 4,
        );
      }
      if (this.state.hitbox) {
        m.hitbox(u.sx, u.sy, u.info.hitbox);
        const body = ENEMY_BODIES.get(u.rig.rigId);
        if (body) m.bodyHitbox(u.sx, u.sy, body);
      }
      u.status?.update(dt, u.sx, u.sy - (u.info.fly ?? 0) * 48);
    }
    if (this.state.hitbox) for (const b of this.hitboxes) m.hitbox(b.sx, b.sy, b.r);
    if (window.__pcgGallery) {
      window.__pcgGallery.fallbacks = this.world.lib.fallbacks;
      window.__pcgGallery.effects = this.world.fx.active;
    }
  }
}

function panel(game: Phaser.Game) {
  const s = readState();
  const el = document.createElement('div');
  el.id = 'gallery-panel';
  el.style.cssText =
    'position:fixed;top:4px;left:4px;right:4px;z-index:10;display:flex;flex-wrap:wrap;gap:6px 12px;' +
    'align-items:center;font:12px var(--font-sans, sans-serif);color:var(--foreground,#fff);' +
    'background:rgba(20,22,26,.82);padding:4px 8px;border:1px solid var(--border,#2e333c)';
  const restart = () => {
    writeState(s);
    if (window.__pcgGallery) window.__pcgGallery.ready = false;
    game.scene.getScene('gallery')?.scene.restart();
  };
  const select = <T extends string | number>(
    name: string,
    values: readonly T[],
    get: () => T,
    set: (v: T) => void,
  ) => {
    const label = document.createElement('label');
    label.textContent = `${name} `;
    const sel = document.createElement('select');
    sel.name = name;
    for (const v of values) sel.add(new Option(String(v), String(v), false, v === get()));
    sel.onchange = () => {
      const v = values.find((x) => String(x) === sel.value);
      if (v !== undefined) set(v);
      restart();
    };
    label.append(sel);
    el.append(label);
  };
  const check = (name: string, get: () => boolean, set: (v: boolean) => void) => {
    const label = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.name = name;
    box.checked = get();
    box.onchange = () => {
      set(box.checked);
      restart();
    };
    label.append(box, ` ${name}`);
    el.append(label);
  };
  select(
    'page',
    PAGES,
    () => s.page,
    (v) => (s.page = v),
  );
  select(
    'clip',
    CLIP_NAMES,
    () => s.clip,
    (v) => (s.clip = v),
  );
  select(
    'color',
    PLAYER_COLOR_IDS,
    () => s.color,
    (v) => (s.color = v),
  );
  check(
    'unlit',
    () => s.unlit,
    (v) => (s.unlit = v),
  );
  check(
    'bloom',
    () => s.bloom,
    (v) => (s.bloom = v),
  );
  check(
    'hitbox',
    () => s.hitbox,
    (v) => (s.hitbox = v),
  );
  check(
    'banner',
    () => s.banner,
    (v) => (s.banner = v),
  );
  select(
    'gauge',
    [0, 1, 2, 3, 4, 5, 6, 7, 8],
    () => s.gauge,
    (v) => (s.gauge = v),
  );
  select(
    'carry',
    [0, 1, 2, 3, 4, 5, 6, 7, 8],
    () => s.carry,
    (v) => (s.carry = v),
  );
  select(
    'colossus',
    ['1', '2', '3', 'final'],
    () => (s.colossus === 4 ? 'final' : String(s.colossus)),
    (v) => (s.colossus = v === 'final' ? 4 : (Number(v) as 1 | 2 | 3)),
  );
  select(
    'tier',
    [0, 1, 2, 3],
    () => s.tier,
    (v) => (s.tier = v as 0 | 1 | 2 | 3),
  );
  for (const l of LANE_IDS)
    select(
      `lane ${l}`,
      ['open', 'sealed'],
      () => s.lanes[l],
      (v) => (s.lanes[l] = v as 'open' | 'sealed'),
    );
  document.body.append(el);
}

export function startGallery(parent: HTMLElement) {
  parent.style.cssText = 'position:fixed;inset:0;background:var(--background,#14161a)';
  const game = new Phaser.Game({
    type: Phaser.WEBGL,
    parent,
    width: CANVAS_W,
    height: CANVAS_H,
    backgroundColor: theme.color.background.hex,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    scene: [GalleryScene],
  });
  if (!stress && new URLSearchParams(location.search).get('panel') !== '0') panel(game);
  return game;
}
