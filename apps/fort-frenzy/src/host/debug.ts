// Developer tools on the TV (SPEC §9.5, §15.9), dev or `?debug=1` only: the debug panel (jump to a
// wave, spawn any enemy at any portal, invincible, add coins, fill one or every build meter, force a
// hot side, portal activity and the hot side, 2× speed, show / set the seed, hitbox / range /
// flow-field overlays, download a replay, the knights in play and a card give (RD6-fix-2); an uncaught
// error offers the download), and the `window.__pcg` hooks the e2e suite drives (builds, meters, the
// throw preview, portals, cards). Never shown to players.
import { installDebug } from '@pcg/game-kit';
import { presentationShared } from '../presentation/shared';
import {
  ENEMY_IDS,
  PORTAL_IDS,
  SIDE_IDS,
  type BuildId,
  type CardId,
  type ClassId,
  type PlayerColorId,
  type SideId,
} from '../shared/ids';
import type { TeamView } from '../shared/messages';
import {
  cardChoices,
  giveMessage,
  hotLine,
  hotState,
  knightLine,
  knightsInPlay,
  meterStates,
  type CardChoice,
  type HotState,
  type KnightRow,
  type MeterState,
} from './debugInfo';
import type { Runtime } from './game';
import { localSnapshotStore } from './net/resume';
import { buildPreview, type BuildPreview } from './sim/preview';
import type { RunSnapshot } from './sim/snapshot';
import type { BuildEnt, Phase, SimCommand } from './sim/types';
import type { TvScreen, TvView } from './ui/types';

export interface FfDebugPlayer {
  playerId: string;
  slot: number | null;
  name: string;
  color: PlayerColorId;
  classId: ClassId | null;
  connected: boolean;
  /** In the run: alive, hp; null in the lobby. */
  hp: number | null;
  alive: boolean | null;
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
    baseHp: number;
    /** Builds on the map (§7). */
    builds: number;
    /** Every run player disconnected (§11.3). */
    paused: boolean;
    /** Who paused the run from their phone (FF14-fix-1), or null. */
    pausedBy: string | null;
    /** Sim steps the runtime has run this run. */
    steps: number;
  };
  /** Creates the room (the home screen's Create row). */
  create(): Promise<void>;
  /** Sim speed multiplier (0–8; 0 = only `advance` steps the sim). */
  speed(n: number): void;
  /** Runs `steps` sim steps now, then syncs the phones (e2e: sim time without wall time). */
  advance(steps: number): void;
  /** A TV-side debug command (`c: 'debug'`, slot −1), logged in the replay. */
  command(cmd: SimCommand): void;
  seed(): number | null;
  replay(): unknown;
  /** A build at (x, y) for `slot`, outside the rules (e2e resume checks; RD3 places real ones). */
  addBuild(kind: BuildId, x: number, y: number, slot: number): void;
  /** The builds on the map. */
  builds(): {
    id: number;
    kind: BuildId;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    owner: number;
    state: BuildEnt['state'];
  }[];
  /** Each run knight's build meter, aim and builds out (RD6). */
  meters(): MeterState[];
  /** Fills one run slot's build meter, or every knight's (a logged debug command). */
  fillMeter(slot?: number): void;
  /** The TV's throw preview for a run slot (the sim's `buildPreview`), or null when not aiming. */
  preview(slot: number): BuildPreview | null;
  /** Portal activity and the hot side (from the spawn plan; never on the phones). */
  portals(): HotState;
  /** Forces the hot side (null clears it; a logged debug command). */
  forceHot(side: SideId | null): void;
  /** Each run slot's cards and private offer (FF14 resume checks). */
  cards(): { slot: number; cards: Partial<Record<CardId, number>>; offer: CardId[] | null }[];
  /** The knights in play (the run's, or the lobby's chosen knights), with their cards (RD6-fix-2). */
  knights(): KnightRow[];
  /** Every card run slot `slot`'s knight could hold (commons + its own), for the panel's picker. */
  cardChoices(slot: number): CardChoice[];
  /**
   * Gives run slot `slot` one stack of `card` (a logged debug command, any phase, `requires`
   * bypassed). Returns why it was refused (another knight's card, a unique already owned), or null
   * when the command was sent; it applies at the next sim step.
   */
  giveCard(slot: number, card: CardId): string | null;
  /** The resume snapshot in storage, or null (§15.8). */
  saved(): RunSnapshot | null;
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
        baseHp: w?.base.hp ?? 0,
        builds: w?.builds.length ?? 0,
        paused: rt.pausedAll,
        pausedBy: rt.paused?.name ?? null,
        steps: rt.stats.steps,
      };
    },
    create: () => rt.createRoom(),
    speed: (n) => {
      // 0 freezes wall-clock sim time: only `advance` steps it (e2e).
      rt.speed = Math.max(0, Math.min(8, n));
    },
    advance: (steps) => rt.advance(Math.max(0, Math.min(36_000, Math.floor(steps)))),
    command: (cmd) => rt.session.command(cmd),
    seed: () => rt.session.start?.seed ?? rt.nextSeed,
    replay: () => rt.session.recorder?.recording() ?? null,
    addBuild: (kind, x, y, slot) => void rt.session.sim?.addBuild(kind, x, y, slot),
    builds: () =>
      (rt.world?.builds ?? []).map((b) => ({
        id: b.id,
        kind: b.kind,
        x: b.x,
        y: b.y,
        hp: b.hp,
        maxHp: b.maxHp,
        owner: b.owner,
        state: b.state,
      })),
    meters: () => meterStates(rt.world, rt.session.content),
    fillMeter: (slot) =>
      rt.session.command({
        c: 'debug',
        slot: -1,
        action: 'meter',
        ...(slot === undefined ? {} : { target: slot }),
      }),
    preview: (slot) => {
      const p = rt.world?.players.find((x) => x.slot === slot);
      return p ? buildPreview(p, rt.session.content) : null;
    },
    portals: () => hotState(rt.world, rt.session.content, rt.session.sim?.debugHot ?? null),
    forceHot: (side) => rt.session.command({ c: 'debug', slot: -1, action: 'hot', side }),
    cards: () =>
      (rt.world?.players ?? []).map((p) => ({
        slot: p.slot,
        cards: { ...p.cards },
        offer: p.offer ? [...p.offer] : null,
      })),
    knights: () => knightsInPlay(rt.session.party.members, rt.world),
    cardChoices: (slot) => {
      const p = rt.world?.players.find((x) => x.slot === slot);
      return p ? cardChoices(rt.session.content, p.classId, p.cards, NAMES) : [];
    },
    giveCard: (slot, card) => giveCardNow(rt, slot, card),
    saved: () => localSnapshotStore().load(Date.now()),
    boxes: () => ({
      canvas: document.querySelector('#tv canvas')?.getBoundingClientRect() ?? null,
      overlay: document.getElementById('tv-ui')?.getBoundingClientRect() ?? null,
    }),
    fallbacks,
  });
}

const NAMES = presentationShared.names;

/** The panel's and `__pcg.giveCard`'s give: the refusal in words, or null once the command is sent. */
function giveCardNow(rt: Runtime, slot: number, card: CardId): string | null {
  const no = giveMessage(rt.world, rt.session.content, slot, card, NAMES);
  if (no === null) rt.session.command({ c: 'debug', slot: -1, action: 'card', target: slot, card });
  return no;
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
padding:8px;display:flex;flex-direction:column;gap:6px;pointer-events:auto;max-height:calc(100vh - 16px);
overflow:auto}
#ff-debug.min>:not(.hd){display:none}
#ff-debug .hd{display:flex;justify-content:space-between;align-items:center;font-weight:600}
#ff-debug .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
#ff-debug input[type=number]{width:72px}
#ff-debug .sec{font-weight:600;border-top:1px solid var(--border,#2e333c);padding-top:6px}
#ff-debug [data-debug=knights]{display:flex;flex-direction:column;gap:2px}
#ff-debug .sw{display:inline-block;width:10px;height:10px;margin-right:4px;vertical-align:middle}
#ff-debug select[data-debug=card],#ff-debug select[data-debug=card-slot]{max-width:190px}
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
  const portal = h('select') as HTMLSelectElement;
  for (const id of PORTAL_IDS) portal.add(new Option(id, id));
  row(
    enemy,
    portal,
    button('Spawn', () => {
      const id = enemy.value as (typeof ENEMY_IDS)[number];
      if (!rt.session.content.enemies.some((e) => e.id === id)) return;
      cmd({ c: 'debug', slot: -1, action: 'spawn', enemy: id, portal: portal.value as never });
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
  // Build meters (§7.2): every knight's, or one run slot's.
  const meterWho = h('select', { 'data-debug': 'meter-slot' }) as HTMLSelectElement;
  let meterSlots = '';
  const syncMeterSlots = () => {
    const ps = rt.world?.players ?? [];
    const key = ps.map((p) => `${p.slot}:${p.name}`).join(',');
    if (key === meterSlots) return;
    meterSlots = key;
    const keep = meterWho.value;
    meterWho.replaceChildren(new Option('every knight', 'all'));
    for (const p of ps) meterWho.add(new Option(`${p.slot}: ${p.name}`, String(p.slot)));
    meterWho.value = [...meterWho.options].some((o) => o.value === keep) ? keep : 'all';
  };
  syncMeterSlots();
  row(
    meterWho,
    button(
      'Fill meter',
      () =>
        cmd({
          c: 'debug',
          slot: -1,
          action: 'meter',
          ...(meterWho.value === 'all' ? {} : { target: Number(meterWho.value) }),
        }),
      'meter',
    ),
  );
  // The hot side (§9.4): force one (this wave's unflared plan and every later wave) or clear it.
  const hotSide = h('select', { 'data-debug': 'hot-side' }) as HTMLSelectElement;
  hotSide.add(new Option('not forced', ''));
  for (const id of SIDE_IDS) hotSide.add(new Option(id, id));
  row(
    h('span', {}, 'Hot'),
    hotSide,
    button(
      'Force',
      () =>
        cmd({
          c: 'debug',
          slot: -1,
          action: 'hot',
          side: (hotSide.value || null) as SideId | null,
        }),
      'hot',
    ),
  );
  // Portal activity and the hot side, from the spawn plan.
  const portalShow = h('div', { 'data-debug': 'portals' });
  portalShow.style.whiteSpace = 'pre-wrap';
  el.append(portalShow);
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
  // Cards (RD6-fix-2): the knights in play with their cards, and a give for one of them.
  el.append(h('div', { class: 'sec' }, 'Cards'));
  const knightList = h('div', { 'data-debug': 'knights' });
  el.append(knightList);
  const cardWho = h('select', { 'data-debug': 'card-slot' }) as HTMLSelectElement;
  const cardPick = h('select', { 'data-debug': 'card' }) as HTMLSelectElement;
  const cardMsg = h('div', { 'data-debug': 'card-msg' });
  row(cardWho);
  row(
    cardPick,
    button(
      'Add',
      () => {
        if (cardWho.value === '' || cardPick.value === '') {
          cardMsg.textContent = 'No knight in a run to give to';
          return;
        }
        const slot = Number(cardWho.value);
        const card = cardPick.value as CardId;
        cardMsg.textContent = giveCardNow(rt, slot, card) ?? `Gave ${NAMES[card]} to slot ${slot}`;
      },
      'give-card',
    ),
  );
  el.append(cardMsg);
  let knightsKey = '';
  let pickKey = '';
  const syncCards = () => {
    const rows = knightsInPlay(rt.session.party.members, rt.world);
    const key = JSON.stringify(rows);
    if (key !== knightsKey) {
      knightsKey = key;
      knightList.replaceChildren(
        ...(rows.length === 0 ? [h('div', {}, 'no knights yet')] : []),
        ...rows.map((r) => {
          const line = h('div', { 'data-debug-knight': String(r.slot ?? '') });
          const swatch = h('span', { class: 'sw' });
          swatch.style.background = `var(--player-${r.color})`;
          line.append(swatch, knightLine(r, NAMES));
          return line;
        }),
      );
      const keep = cardWho.value;
      cardWho.replaceChildren();
      for (const r of rows)
        if (r.inRun && r.slot !== null)
          cardWho.add(new Option(`${r.slot}: ${NAMES[r.classId]} (${r.name})`, String(r.slot)));
      if ([...cardWho.options].some((o) => o.value === keep)) cardWho.value = keep;
    }
    const p = rt.world?.players.find((x) => String(x.slot) === cardWho.value);
    const pk = p ? `${p.slot}:${p.classId}:${JSON.stringify(p.cards)}` : '';
    if (pk === pickKey) return;
    pickKey = pk;
    const keep = cardPick.value;
    cardPick.replaceChildren();
    if (!p) return;
    const groups = new Map<string, HTMLOptGroupElement>();
    for (const c of cardChoices(rt.session.content, p.classId, p.cards, NAMES)) {
      let g = groups.get(c.group);
      if (!g) {
        g = h('optgroup', { label: c.group }) as HTMLOptGroupElement;
        groups.set(c.group, g);
        cardPick.append(g);
      }
      g.append(new Option(c.label, c.id));
    }
    if ([...cardPick.options].some((o) => o.value === keep)) cardPick.value = keep;
  };
  cardWho.onchange = syncCards;
  syncCards();
  row(button('Download replay', () => void downloadReplay(rt), 'replay'));
  document.body.append(el);

  const tick = setInterval(() => {
    const s = rt.session.start?.seed;
    seedShow.textContent = `${s ?? '—'}${rt.nextSeed !== null ? ` (next ${rt.nextSeed})` : ''}`;
    syncMeterSlots();
    syncCards();
    const w = rt.world;
    portalShow.textContent = w
      ? `${hotLine(hotState(w, rt.session.content, rt.session.sim?.debugHot ?? null))}\nmeters ${meterStates(
          w,
          rt.session.content,
        )
          .map((m) => `${m.slot}:${Math.round(m.meter * 100)}%`)
          .join(' ')}`
      : '';
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
