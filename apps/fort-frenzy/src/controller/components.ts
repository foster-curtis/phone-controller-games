// Plain TS DOM components (SPEC §15.7): Badge, RoundButton, ChargeRing, StatusStrip, KitTile,
// UpgradeCard, ShopRow, HoldConfirm, Toast, LineupRow, ClassCard. No framework; each returns its
// element plus a setter where it changes. Styled in controller.css from brand.css tokens only.
import { createHoldToConfirm, el } from '@pcg/controller-kit';
import {
  PLAYER_COLOR_IDS,
  type CardId,
  type ClassId,
  type PlayerColorId,
  type ShopItemId,
  type StructureId,
} from '../shared/ids';
import type { MeView, TeamRosterEntry, TeamShopRow, TeamView } from '../shared/messages';
import { portraitUrl } from './assets';
import { CARD_INFO, CLASS_INFO, ROMAN, SHOP_INFO, STRUCTURE_INFO, type ClassInfo } from './copy';
import { HIT_EXTRA } from './layout';

const SVG = 'http://www.w3.org/2000/svg';

/** A glyph from the inlined icon sprite. */
export function icon(id: string, cls = ''): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `icon ${cls}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(SVG, 'use');
  use.setAttribute('href', `#icon-${id}`);
  svg.append(use);
  return svg;
}

export type BadgeState = 'rest' | 'active' | 'selected' | 'ready' | 'dim';

/** Lit badge (SPEC §2.6): a glyph in a chamfered gunmetal tile; amber edge when active/selected/ready. */
export function Badge(
  id: string,
  state: BadgeState = 'rest',
): HTMLElement & { set(id: string, s: BadgeState): void } {
  const node = el('span', { class: 'badge' }) as HTMLElement & {
    set(id: string, s: BadgeState): void;
  };
  const paint = (glyph: string, s: BadgeState) => {
    node.dataset.state = s;
    node.replaceChildren(el('span', { class: 'badge-tile' }), icon(glyph, 'badge-glyph'));
  };
  node.set = paint;
  paint(id, state);
  return node;
}

export interface RoundButton {
  /** The touch target (drawn size + 8 px on every side). */
  el: HTMLElement;
  face: HTMLElement;
  place(cx: number, cy: number, d: number): void;
  setIcon(id: string, dimmed?: boolean): void;
  label(text: string): void;
}

/** Round gunmetal button with an icon; the touch target extends 8 px past the drawn edge. */
export function RoundButton(kind: string, iconId: string): RoundButton {
  const face = el('span', { class: 'round-face' });
  const text = el('span', { class: 'round-label' });
  const node = el('div', { class: `round-btn ${kind}`, 'data-btn': kind }, face, text);
  let glyph = icon(iconId, 'round-glyph');
  face.append(glyph);
  return {
    el: node,
    face,
    place(cx, cy, d) {
      const size = d + HIT_EXTRA * 2;
      node.style.cssText = `left:${cx - size / 2}px;top:${cy - size / 2}px;width:${size}px;height:${size}px;--face:${d}px`;
    },
    setIcon(id, dimmed = false) {
      const next = icon(id, 'round-glyph');
      glyph.replaceWith(next);
      glyph = next;
      node.classList.toggle('dimmed', dimmed);
    },
    label(t) {
      text.textContent = t;
    },
  };
}

/** The super's charge ring: fills clockwise, lights amber when full; the pulse is CSS (`.full`). */
export function ChargeRing(): { el: HTMLElement; set(charge: number, full: boolean): void } {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('class', 'ring-svg');
  const track = document.createElementNS(SVG, 'circle');
  const arc = document.createElementNS(SVG, 'circle');
  for (const c of [track, arc]) {
    c.setAttribute('cx', '50');
    c.setAttribute('cy', '50');
    c.setAttribute('r', '46');
    c.setAttribute('pathLength', '100');
  }
  track.setAttribute('class', 'ring-track');
  arc.setAttribute('class', 'ring-arc');
  arc.setAttribute('stroke-dasharray', '100');
  svg.append(track, arc);
  const node = el('div', { class: 'charge-ring' });
  node.append(svg);
  let wasFull = false;
  return {
    el: node,
    set(charge, full) {
      const p = Math.max(0, Math.min(1, full ? 1 : charge));
      arc.setAttribute('stroke-dashoffset', String(100 * (1 - p)));
      node.classList.toggle('full', full);
      // The one-time flash (150 ms) on becoming full; the pulse follows in CSS.
      if (full && !wasFull) {
        node.classList.remove('flash');
        void node.offsetWidth;
        node.classList.add('flash');
      }
      wasFull = full;
    },
  };
}

const pct = (n: number, max: number) =>
  `${Math.round(Math.max(0, Math.min(1, max > 0 ? n / max : 0)) * 100)}%`;

/** Top-center strip: HP, cells carried (up to the cap), base HP, emergency kits (SPEC §10.1). */
export function StatusStrip(): { el: HTMLElement; update(me: MeView, team: TeamView): void } {
  const hp = el('span', { class: 'bar-fill hp' });
  const base = el('span', { class: 'bar-fill base' });
  const cells = el('span', { class: 'cells' });
  const kit = el('span', { class: 'kit' });
  const group = (label: string, ...kids: Node[]) =>
    el('div', { class: 'strip-group' }, el('span', { class: 'strip-label', text: label }), ...kids);
  const node = el(
    'div',
    { class: 'status-strip' },
    group('HP', el('span', { class: 'bar' }, hp)),
    group('CELLS', cells, kit),
    group('BASE', el('span', { class: 'bar' }, base)),
  );
  return {
    el: node,
    update(me, team) {
      hp.style.width = pct(me.hp, me.maxHp);
      base.style.width = pct(team.baseHp, team.baseMaxHp);
      const pips: Node[] = [];
      for (let i = 0; i < Math.max(me.carryCap, me.crates); i++) {
        pips.push(el('i', { class: i < me.crates ? 'pip on' : 'pip' }));
      }
      cells.replaceChildren(...pips);
      kit.replaceChildren(...(me.kits > 0 ? [icon('emergency-kit', 'kit-glyph')] : []));
    },
  };
}

/** A structure in the build kit: badge, name, cell cost; dimmed when the player can't pay. */
export function KitTile(
  id: StructureId,
  opts: { selected: boolean; affordable: boolean },
  onPick: () => void,
): HTMLElement {
  const info = STRUCTURE_INFO[id];
  const tile = el(
    'button',
    { type: 'button', class: 'kit-tile', 'data-structure': id },
    Badge(info.icon, opts.selected ? 'selected' : 'rest'),
    el('span', { class: 'kit-name', text: info.name }),
    el('span', { class: 'kit-cost', text: `${info.cost} ${info.cost === 1 ? 'CELL' : 'CELLS'}` }),
  );
  tile.classList.toggle('selected', opts.selected);
  tile.classList.toggle('dimmed', !opts.affordable);
  tile.addEventListener('click', onPick);
  return tile;
}

/** Upgrade card: chamfered frame (common gunmetal, rare double amber), category mark, name, text. */
export function UpgradeCard(
  id: CardId,
  opts: { onTake?: () => void; state?: 'offer' | 'picked' | 'passed' },
): HTMLElement {
  const info = CARD_INFO[id];
  const card = el(
    'div',
    {
      class: `upgrade-card ${info.rare ? 'rare' : 'common'} ${opts.state ?? 'offer'}`,
      'data-card': id,
    },
    el('span', { class: 'card-rarity', text: info.rare ? 'RARE' : 'COMMON' }),
    Badge(info.mark, info.rare ? 'active' : 'rest'),
    el('span', { class: 'card-name', text: info.name }),
    el('span', { class: 'card-text', text: info.text }),
  );
  if (opts.onTake && (opts.state ?? 'offer') === 'offer') {
    const take = el('button', { type: 'button', class: 'btn btn-primary take', text: 'TAKE' });
    take.addEventListener('click', opts.onTake);
    card.append(take);
  } else if (opts.state === 'picked') {
    card.append(el('span', { class: 'card-picked', text: 'PICKED' }));
  }
  return card;
}

/**
 * A button that needs a press-and-hold (0.6 s, the kit's hold-to-confirm; fill via `--progress`), or a
 * plain tap when `hold` is false. Returns the element and its teardown.
 */
export function HoldConfirm(
  label: string,
  hold: boolean,
  onConfirm: () => void,
  cls = '',
): { el: HTMLButtonElement; destroy(): void } {
  const btn = el('button', { type: 'button', class: `btn hold-confirm ${cls}`.trim() });
  btn.append(el('span', { class: 'hold-fill' }), el('span', { class: 'hold-label', text: label }));
  if (!hold) {
    btn.addEventListener('click', onConfirm);
    return { el: btn, destroy() {} };
  }
  btn.classList.add('needs-hold');
  const h = createHoldToConfirm(btn, onConfirm);
  return { el: btn, destroy: () => h.destroy() };
}

export interface ShopRowOpts {
  coins: number;
  requestedBy: string[];
  mine: boolean;
  onBuy(item: ShopItemId): void;
  onRequest(item: ShopItemId, on: boolean): void;
}

/** One team shop row: badge, name and tier, price (hold to confirm on big buys), Request toggle. */
export function ShopRow(row: TeamShopRow, opts: ShopRowOpts): { el: HTMLElement; destroy(): void } {
  const info = SHOP_INFO[row.id];
  const soldOut = row.price === null;
  const sub =
    row.maxTier > 1
      ? `TIER ${ROMAN[Math.min(row.tier + (soldOut ? 0 : 1), 5)]} / ${ROMAN[Math.min(row.maxTier, 5)]}`
      : null;
  const price = HoldConfirm(
    soldOut ? 'MAX' : row.holdToConfirm ? `HOLD ${row.price}` : String(row.price),
    !soldOut && row.holdToConfirm,
    () => opts.onBuy(row.id),
    'price',
  );
  if (soldOut) price.el.disabled = true;
  price.el.classList.toggle('short', !soldOut && opts.coins < (row.price ?? 0));
  if (!soldOut) price.el.prepend(icon('coins', 'price-coin'));
  const request = el('button', {
    type: 'button',
    class: `btn request${opts.mine ? ' on' : ''}`,
    'aria-pressed': String(opts.mine),
    'aria-label': 'Request',
  });
  request.append(icon('request'));
  request.addEventListener('click', () => opts.onRequest(row.id, !opts.mine));
  const node = el(
    'div',
    { class: 'shop-row', 'data-item': row.id },
    Badge(info.icon, opts.mine ? 'active' : 'rest'),
    el(
      'div',
      { class: 'shop-text' },
      el('span', { class: 'shop-name', text: info.name }),
      sub ? el('span', { class: 'shop-sub', text: sub }) : null,
      opts.requestedBy.length
        ? el('span', { class: 'shop-req', text: `REQUESTED BY ${opts.requestedBy.join(', ')}` })
        : null,
    ),
    price.el,
    request,
  );
  return { el: node, destroy: price.destroy };
}

/** Transient message (ack refusals); one at a time, gone after `ms`. */
export function Toast(host: HTMLElement, ms = 2200): { show(text: string): void } {
  const node = el('div', { class: 'toast', role: 'status' });
  node.hidden = true;
  host.append(node);
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    show(text) {
      node.textContent = text;
      node.hidden = false;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => (node.hidden = true), ms);
    },
  };
}

export const colorVar = (c: PlayerColorId | null): string =>
  c ? `var(--player-${c})` : 'var(--border-control)';
export const colorOnVar = (c: PlayerColorId | null): string =>
  c ? `var(--player-${c}-on)` : 'var(--foreground)';

/** Lineup row: player color bar, class helm, name, leader mark, ready check, optional remove. */
export function LineupRow(
  p: TeamRosterEntry,
  opts: { leader: boolean; me: boolean; canRemove: boolean; onRemove(): void },
): HTMLElement {
  const info = p.classId ? CLASS_INFO[p.classId] : null;
  const row = el(
    'div',
    {
      class: `lineup-row${p.connected ? '' : ' away'}${opts.me ? ' me' : ''}`,
      'data-player': p.playerId,
    },
    el('span', { class: 'lineup-color' }),
    info
      ? icon(`class-${info.rig}`, 'lineup-helm')
      : el('span', { class: 'lineup-helm empty', text: '?' }),
    el('span', { class: 'lineup-name', text: p.name || '…' }),
    opts.leader ? icon('leader', 'lineup-leader') : null,
    p.ready ? icon('ready', 'lineup-ready') : el('span', { class: 'lineup-wait', text: '…' }),
  );
  (row.firstChild as HTMLElement).style.background = colorVar(p.color);
  if (opts.canRemove) {
    const x = el('button', {
      type: 'button',
      class: 'lineup-remove',
      'aria-label': `Remove ${p.name}`,
      text: '×',
    });
    x.addEventListener('click', opts.onRemove);
    row.append(x);
  }
  return row;
}

/** A knight's front view in the player's color: body layer plus the color part tinted by CSS mask. */
export function Portrait(classId: ClassId, color: PlayerColorId | null): HTMLElement {
  const rig = CLASS_INFO[classId].rig;
  const body = portraitUrl(rig, 'body');
  const mask = portraitUrl(rig, 'mask');
  const node = el('div', { class: 'portrait', 'data-rig': rig });
  node.style.setProperty('--portrait-body', body ? `url("${body}")` : 'none');
  node.style.setProperty('--portrait-mask', mask ? `url("${mask}")` : 'none');
  node.style.setProperty('--portrait-color', colorVar(color));
  node.append(el('span', { class: 'portrait-body' }), el('span', { class: 'portrait-tint' }));
  return node;
}

const modeText = (m: 'tap' | 'aim') => (m === 'aim' ? 'AIM' : 'TAP');

/**
 * Class select card (SPEC §2.6, §8): portrait with name and role, then what each part does: main and
 * super (with tap/aim), the passive, and the build kit.
 */
export function ClassCard(classId: ClassId, color: PlayerColorId | null): HTMLElement {
  const info: ClassInfo = CLASS_INFO[classId];
  const attack = (kind: 'main' | 'super') =>
    el(
      'div',
      { class: 'cc-block attack', 'data-part': kind },
      Badge(`${kind}-${info.rig}`),
      el(
        'div',
        { class: 'attack-text' },
        el('span', {
          class: 'attack-sub',
          text: `${kind.toUpperCase()} · ${modeText(info[kind].mode)}`,
        }),
        el('span', { class: 'attack-name', text: info[kind].name }),
        el('span', { class: 'cc-desc', text: info[kind].text }),
      ),
    );
  const part = (kind: string, label: string, ...kids: Node[]) =>
    el(
      'div',
      { class: 'cc-block fact', 'data-part': kind },
      el('span', { class: 'fact-k', text: label }),
      ...kids,
    );
  return el(
    'article',
    { class: 'class-card', 'data-class': classId },
    el(
      'div',
      { class: 'class-head' },
      Portrait(classId, color),
      el('h2', { class: 'class-name h2', text: info.name }),
      el('span', { class: 'class-role', text: info.role.toUpperCase() }),
    ),
    el(
      'div',
      { class: 'class-body' },
      attack('main'),
      attack('super'),
      part(
        'passive',
        'PASSIVE',
        el('span', { class: 'fact-v', text: info.passive }),
        el('span', { class: 'cc-desc', text: info.passiveText }),
      ),
      part(
        'builds',
        'BUILDS',
        ...info.kit.map((k) =>
          el(
            'span',
            { class: 'cc-kit' },
            el('b', { class: 'fact-v', text: k.name }),
            el('span', { class: 'cc-desc', text: ` ${k.text}` }),
          ),
        ),
      ),
    ),
  );
}

/** The six brand colors; ones other players hold are marked unavailable (FF4-fix-2). */
export function ColorPicker(opts: {
  mine: PlayerColorId | null;
  taken: ReadonlySet<PlayerColorId>;
  disabled?: boolean;
  onPick(c: PlayerColorId): void;
}): HTMLElement {
  const row = el('div', { class: 'color-picker', role: 'group', 'aria-label': 'Your color' });
  for (const c of PLAYER_COLOR_IDS) {
    const taken = opts.taken.has(c) && c !== opts.mine;
    const b = el('button', {
      type: 'button',
      class: `swatch${c === opts.mine ? ' on' : ''}${taken ? ' taken' : ''}`,
      'data-color': c,
      'aria-label': taken ? `${c} (taken)` : c,
      'aria-pressed': String(c === opts.mine),
    });
    b.style.setProperty('--swatch', colorVar(c));
    b.disabled = taken || !!opts.disabled;
    if (taken) b.append(el('span', { class: 'swatch-x', text: '×' }));
    b.addEventListener('click', () => c !== opts.mine && opts.onPick(c));
    row.append(b);
  }
  return row;
}
