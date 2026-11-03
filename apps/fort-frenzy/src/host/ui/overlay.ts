// The TV's DOM overlay (SPEC §15.2): a 1920 × 1080 root scaled to the window with a CSS transform
// (FIT, like the canvas), re-rendered from a `TvView`. Also reads the keyboard and the Gamepad API for
// the home screen (§11.1) and the lobby's remove keys. No Phaser here.
import './ui.css';
import { ICON_SPRITE } from './art';
import { CANVAS, fitScale } from './layout';
import {
  createPadNav,
  keyToNav,
  stepHome,
  type HomeIntent,
  type NavKey,
  type PadLike,
} from './homeNav';
import { createRemoveArm, ARM_MS } from './removeArm';
import { sectionsFor } from './render';
import { MAX_SLOTS } from './screens/lobby';
import type { TvView } from './types';

export interface OverlayHandlers {
  /** Home focus moved, a ◂ ▸ row changed, or a row was chosen. The host updates `TvView.home`. */
  onHome?(intent: HomeIntent): void;
  /** The TV confirmed removing a lobby player (armed, then pressed again). */
  onRemovePlayer?(playerId: string): void;
}

export interface TvOverlay {
  readonly root: HTMLElement;
  update(view: TvView): void;
  /** Feed a nav press (tests and the dev page; the overlay already listens to keys and pads). */
  nav(key: NavKey): void;
  destroy(): void;
}

const HIT_FLASH_MS = 320;

export function createTvOverlay(host: HTMLElement, handlers: OverlayHandlers = {}): TvOverlay {
  const root = document.createElement('div');
  root.id = 'tv-ui';
  root.style.width = `${CANVAS.w}px`;
  root.style.height = `${CANVAS.h}px`;
  root.insertAdjacentHTML('afterbegin', ICON_SPRITE);
  const layer = document.createElement('div');
  layer.className = 'layer';
  root.append(layer);
  host.append(root);

  const fit = () => {
    const { scale, x, y } = fitScale(window.innerWidth, window.innerHeight);
    root.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
  };
  fit();
  window.addEventListener('resize', fit);

  const sections = new Map<string, { el: HTMLElement; html: string }>();
  const arm = createRemoveArm();
  let view: TvView | null = null;
  let prevHp: number | null = null;
  let hitUntil = 0;
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const render = () => {
    if (!view) return;
    const now = performance.now();
    const next = sectionsFor(view, { hit: now < hitUntil, armedSlot: arm.armed(now) });
    const live = new Set<string>();
    for (const s of next) {
      live.add(s.name);
      let cur = sections.get(s.name);
      if (!cur) {
        const el = document.createElement('div');
        el.className = 'sec';
        el.dataset.s = s.name;
        layer.append(el);
        cur = { el, html: '' };
        sections.set(s.name, cur);
      }
      if (cur.html !== s.html) {
        cur.el.innerHTML = s.html;
        cur.html = s.html;
        // mask URLs can be data URIs, so they're set as properties rather than inside style attributes
        for (const m of cur.el.querySelectorAll<HTMLElement>('[data-mask]')) {
          const v = `url(${JSON.stringify(m.dataset.mask)})`;
          m.style.maskImage = v;
          m.style.setProperty('-webkit-mask-image', v);
        }
      }
    }
    for (const [name, cur] of sections) {
      if (!live.has(name)) {
        cur.el.remove();
        sections.delete(name);
      }
    }
  };
  /** Re-render later (hit flash ends, arm times out). */
  const later = (ms: number) => {
    timers.add(
      setTimeout(() => {
        render();
      }, ms + 20),
    );
  };

  const nav = (key: NavKey) => {
    if (view?.screen !== 'home' || !view.home) return;
    const intent = stepHome(view.home.rows, view.home.focus, key);
    if (intent) handlers.onHome?.(intent);
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (view?.screen === 'home') {
      const k = keyToNav(e.key);
      if (k) {
        e.preventDefault();
        nav(k);
      }
      return;
    }
    if (view?.screen === 'lobby' && view.team) {
      if (e.key === 'Escape') {
        arm.clear();
        render();
        return;
      }
      const n = /^[1-9]$/.test(e.key) ? Number(e.key) - 1 : -1;
      const target = n >= 0 && n < MAX_SLOTS ? view.team.roster[n] : undefined;
      if (!target) return;
      if (arm.press(n, performance.now()) === 'confirmed') {
        handlers.onRemovePlayer?.(target.playerId);
        render();
      } else {
        render();
        later(ARM_MS);
      }
    }
  };
  window.addEventListener('keydown', onKey);

  // Gamepad API: polled while the home screen is up. Unavailable → the keyboard still drives it.
  const padNav = createPadNav();
  let raf = 0;
  const poll = () => {
    raf = requestAnimationFrame(poll);
    if (view?.screen !== 'home' || typeof navigator.getGamepads !== 'function') return;
    for (const k of padNav(navigator.getGamepads() as readonly (PadLike | null)[])) nav(k);
  };
  raf = requestAnimationFrame(poll);

  return {
    root,
    nav,
    update(v) {
      const hp = v.team?.baseHp ?? null;
      if (hp !== null && prevHp !== null && hp < prevHp) {
        hitUntil = performance.now() + HIT_FLASH_MS;
        later(HIT_FLASH_MS);
      }
      prevHp = hp;
      if (v.screen !== 'lobby') arm.clear();
      view = v;
      render();
    },
    destroy() {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      window.removeEventListener('resize', fit);
      window.removeEventListener('keydown', onKey);
      root.remove();
    },
  };
}
