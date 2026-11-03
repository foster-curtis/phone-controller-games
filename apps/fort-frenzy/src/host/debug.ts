// Developer tools on the TV (SPEC §9.5, §15.9), dev or `?debug=1` only: the debug panel (jump to a
// wave, spawn any enemy in any lane, invincible, add coins, 2× speed, show / set the seed, hitbox /
// range / flow-field overlays, download a replay; an uncaught error offers the download), and the
// `window.__pcg` hooks the e2e suite drives. Never shown to players.
import { installDebug } from '@pcg/game-kit';
import { ENEMY_IDS, LANE_IDS, type ClassId, type PlayerColorId } from '../shared/ids';
import type { TeamView } from '../shared/messages';
import type { Runtime } from './game';
import type { Phase, SimCommand } from './sim/types';
import type { TvScreen, TvView } from './ui/types';

export interface FfDebugPlayer {
  playerId: string;
  slot: number | null;
  name: string;
  color: PlayerColorId;
  classId: ClassId | null;
  connected: boolean;
  /** In the run: alive, hp, crates; null in the lobby. */
  hp: number | null;
  alive: boolean | null;
  crates: number | null;
  /** The knight is dazed (its phone is away, §11.3); null in the lobby. */
  dazed: boolean | null;
  /** Holding an aimed main attack (the TV aim line). */
  aiming: boolean;
}

export interface FfDebugApi {
  code(): string | null;
  joinUrl(): string | null;
  screen(): TvScreen;
  /** The sim phase, or `lobby` / `home` outside a run. */
  phase(): Phase | 'lobby' | 'home';
  wave(): number;
  team(): TeamView | null;
  tv(): TvView;
  players(): FfDebugPlayer[];
  stats(): {
    tick: number;
    coins: number;
    enemies: number;
    enemyDeaths: number;
    shots: number;
    structures: number;
    baseHp: number;
    paused: boolean;
  };
  /** Creates the room (the home screen's Create row). */
  create(): Promise<void>;
  /** Sim speed multiplier (1–8). */
  speed(n: number): void;
  /** A TV-side debug command (`c: 'debug'`, slot −1), logged in the replay. */
  command(cmd: SimCommand): void;
  seed(): number | null;
  replay(): unknown;
  /** Canvas and overlay boxes in CSS px (they must match: one shared fit). */
  boxes(): { canvas: DOMRect | null; overlay: DOMRect | null };
  fallbacks(): number;
}

declare global {
  interface Window {
    __pcg?: FfDebugApi;
  }
}

export function installFfDebug(rt: Runtime, fallbacks: () => number): void {
  installDebug<FfDebugApi>({
    code: () => rt.code,
    joinUrl: () => rt.tvView().room?.joinUrl ?? null,
    screen: () => rt.tvView().screen,
    phase: () => rt.world?.phase ?? (rt.code ? 'lobby' : 'home'),
    wave: () => rt.world?.wave ?? 0,
    team: () => rt.tvView().team,
    tv: () => rt.tvView(),
    players: () =>
      rt.session.party.members.map((m) => {
        const p = m.slot === null ? null : rt.world?.players.find((x) => x.slot === m.slot);
        return {
          playerId: m.playerId,
          slot: m.slot,
          name: m.name,
          color: m.color,
          classId: m.classId,
          connected: m.connected,
          hp: p ? p.hp : null,
          alive: p ? p.respawnAt === null : null,
          crates: p ? p.crates : null,
          dazed: p ? !p.connected : null,
          aiming: !!p?.mainAim,
        };
      }),
    stats: () => {
      const w = rt.world;
      return {
        tick: w?.tick ?? 0,
        coins: w?.team.coins ?? 0,
        enemies: w?.enemies.length ?? 0,
        enemyDeaths: rt.stats.enemyDeaths,
        shots: rt.stats.shots,
        structures: w?.structures.length ?? 0,
        baseHp: w?.base.hp ?? 0,
        paused: rt.pausedAll,
      };
    },
    create: () => rt.createRoom(),
    speed: (n) => {
      rt.speed = Math.max(0.25, Math.min(8, n));
    },
    command: (cmd) => rt.session.command(cmd),
    seed: () => rt.session.start?.seed ?? rt.nextSeed,
    replay: () => rt.session.recorder?.recording() ?? null,
    boxes: () => ({
      canvas: document.querySelector('#tv canvas')?.getBoundingClientRect() ?? null,
      overlay: document.getElementById('tv-ui')?.getBoundingClientRect() ?? null,
    }),
    fallbacks,
  });
}

/** Downloads the run's replay as gzipped JSON (§15.9), plain JSON where gzip isn't available. */
export async function downloadReplay(rt: Runtime): Promise<boolean> {
  const rec = rt.session.recorder?.recording();
  if (!rec) return false;
  const json = JSON.stringify(rec);
  let blob = new Blob([json], { type: 'application/json' });
  let name = `fort-frenzy-replay-${rec.start.seed}-${rec.steps}.json`;
  if (typeof CompressionStream === 'function') {
    const gz = new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'));
    blob = await new Response(gz).blob();
    name += '.gz';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
  return true;
}

const css = `
#ff-debug{position:fixed;right:8px;top:8px;z-index:50;width:260px;font:12px var(--font-sans,sans-serif);
color:var(--foreground,#fff);background:rgba(20,22,26,.9);border:1px solid var(--border,#2e333c);
padding:8px;display:flex;flex-direction:column;gap:6px;pointer-events:auto}
#ff-debug.min>:not(.hd){display:none}
#ff-debug .hd{display:flex;justify-content:space-between;align-items:center;font-weight:600}
#ff-debug .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
#ff-debug input[type=number]{width:72px}
#ff-debug button,#ff-debug select,#ff-debug input{font:inherit}
#ff-debug-offer{position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:60;
background:var(--danger,#e05252);color:#14161a;padding:8px 12px;font:13px var(--font-sans,sans-serif);
display:flex;gap:10px;align-items:center;pointer-events:auto}`;

export interface DebugPanel {
  /** Offers the replay download after an uncaught error (§15.9). */
  offerReplay(reason: string): void;
  destroy(): void;
}

export function mountDebugPanel(rt: Runtime): DebugPanel {
  const style = document.createElement('style');
  style.textContent = css;
  document.head.append(style);
  const el = document.createElement('div');
  el.id = 'ff-debug';
  const h = (tag: string, attrs: Record<string, string> = {}, text = '') => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (text) n.textContent = text;
    return n;
  };
  const row = (...kids: Node[]) => {
    const r = h('div', { class: 'row' });
    r.append(...kids);
    el.append(r);
    return r;
  };
  const button = (label: string, run: () => void, name = label) => {
    const b = h('button', { type: 'button', 'data-debug': name }, label) as HTMLButtonElement;
    b.onclick = run;
    return b;
  };
  const check = (label: string, get: () => boolean, set: (v: boolean) => void) => {
    const l = h('label');
    const box = h('input', { type: 'checkbox', 'data-debug': label }) as HTMLInputElement;
    box.checked = get();
    box.onchange = () => set(box.checked);
    l.append(box, ` ${label}`);
    return l;
  };
  const cmd = (c: SimCommand) => rt.session.command(c);

  const hd = h('div', { class: 'hd' }, 'DEBUG');
  const toggle = button('–', () => el.classList.toggle('min'), 'minimize');
  hd.append(toggle);
  el.append(hd);

  const wave = h('input', { type: 'number', min: '1', value: '1' }) as HTMLInputElement;
  row(
    h('span', {}, 'Wave'),
    wave,
    button('Jump', () =>
      cmd({ c: 'debug', slot: -1, action: 'jumpWave', wave: Number(wave.value) || 1 }),
    ),
  );
  const enemy = h('select') as HTMLSelectElement;
  for (const id of ENEMY_IDS) {
    const ok = rt.session.content.enemies.some((e) => e.id === id);
    enemy.add(new Option(ok ? id : `${id} (n/a)`, id, false, id === 'grunt'));
  }
  const lane = h('select') as HTMLSelectElement;
  for (const l of LANE_IDS) lane.add(new Option(l, l));
  row(
    enemy,
    lane,
    button('Spawn', () => {
      const id = enemy.value as (typeof ENEMY_IDS)[number];
      if (!rt.session.content.enemies.some((e) => e.id === id)) return;
      cmd({ c: 'debug', slot: -1, action: 'spawn', enemy: id, lane: lane.value as never });
    }),
  );
  let invincible = false;
  row(
    check(
      'invincible',
      () => invincible,
      (v) => {
        invincible = v;
        cmd({ c: 'debug', slot: -1, action: 'invincible', on: v });
      },
    ),
    check(
      '2× speed',
      () => rt.speed === 2,
      (v) => (rt.speed = v ? 2 : 1),
    ),
  );
  const coins = h('input', { type: 'number', value: '50' }) as HTMLInputElement;
  row(
    coins,
    button('Add coins', () =>
      cmd({ c: 'debug', slot: -1, action: 'coins', amount: Number(coins.value) || 0 }),
    ),
  );
  const seedShow = h('span', { 'data-debug': 'seed' });
  const seedIn = h('input', { type: 'number', placeholder: 'next seed' }) as HTMLInputElement;
  row(h('span', {}, 'Seed'), seedShow);
  row(
    seedIn,
    button('Set', () => {
      const n = Number(seedIn.value);
      rt.nextSeed = seedIn.value === '' || !Number.isFinite(n) ? null : Math.floor(n);
    }),
  );
  row(
    check(
      'hitboxes',
      () => rt.overlays.hitbox,
      (v) => (rt.overlays.hitbox = v),
    ),
    check(
      'ranges',
      () => rt.overlays.range,
      (v) => (rt.overlays.range = v),
    ),
    check(
      'flow field',
      () => rt.overlays.flow,
      (v) => (rt.overlays.flow = v),
    ),
  );
  row(button('Download replay', () => void downloadReplay(rt), 'replay'));
  document.body.append(el);

  const tick = setInterval(() => {
    const s = rt.session.start?.seed;
    seedShow.textContent = `${s ?? '—'}${rt.nextSeed !== null ? ` (next ${rt.nextSeed})` : ''}`;
  }, 500);

  let offer: HTMLElement | null = null;
  return {
    offerReplay(reason) {
      if (offer || !rt.session.recorder) return;
      offer = h('div', { id: 'ff-debug-offer' });
      offer.append(
        h('span', {}, `Error: ${reason.slice(0, 80)}`),
        button('Download replay', () => void downloadReplay(rt), 'offer-replay'),
        button('×', () => {
          offer?.remove();
          offer = null;
        }),
      );
      document.body.append(offer);
    },
    destroy() {
      clearInterval(tick);
      el.remove();
      style.remove();
      offer?.remove();
    },
  };
}
