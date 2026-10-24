// Pieces shared by several screens.
import markUrl from '../../../brand/mark.svg?url';
import { el } from '../dom';
import type {
  ControllerMsg,
  LeaderAction,
  PlayerColorId,
  Screen,
  Standing,
} from '../../shared/messages';
import type { StorageLike } from '@pcg/net-client';
import type { InputSender } from '../input/sender';

export interface ScreenCtx {
  send(msg: ControllerMsg): void;
  storage: StorageLike | undefined;
  sender: InputSender;
  /** Hold-to-pause completed on the controller screen. */
  onPause(): void;
  /** Right-hand slot of the top banner; the play surface mounts its pause button here. */
  pauseSlot: HTMLElement;
}

export interface ScreenView<S extends Screen = Screen> {
  el: HTMLElement;
  update(screen: S): void;
  destroy(): void;
}

export function colorVar(id: PlayerColorId | null | undefined): string {
  return id ? `var(--player-${id})` : 'var(--surface-strong)';
}

export function colorOnVar(id: PlayerColorId | null | undefined): string {
  return id ? `var(--player-${id}-on)` : 'var(--foreground)';
}

export function heading(text: string): HTMLElement {
  return el('h1', { class: 'h2 sticker-heading', text });
}

export function markImg(): HTMLImageElement {
  return el('img', { class: 'mark', src: markUrl, alt: '', width: '64', height: '64' });
}

export function stickerButton(
  text: string,
  onClick: () => void,
  extraClass = '',
): HTMLButtonElement {
  const b = el('button', { type: 'button', class: `btn label ${extraClass}`.trim(), text });
  b.addEventListener('click', onClick);
  return b;
}

/** A button that sends `{ t: 'leader', action }`; callers add it only when `isLeader`. */
export function leaderButton(
  ctx: ScreenCtx,
  text: string,
  action: LeaderAction,
  extraClass = 'btn-accent',
): HTMLButtonElement {
  const b = stickerButton(text, () => ctx.send({ t: 'leader', action }), extraClass);
  b.dataset.leader = action;
  return b;
}

/** How long an armed "Remove?" stays armed before disarming. */
export const REMOVE_ARM_MS = 3000;

interface Armed {
  id: string;
  btn: HTMLButtonElement | null;
  timer: ReturnType<typeof setTimeout>;
}
/** One armed remove control per phone; survives the list being re-rendered by a screen update. */
const armedByCtx = new WeakMap<ScreenCtx, Armed>();

function paintRemove(b: HTMLButtonElement, armed: boolean, name: string): void {
  b.classList.toggle('armed', armed);
  b.textContent = armed ? 'Remove?' : '\u00d7';
  b.setAttribute('aria-label', armed ? `Confirm remove ${name}` : `Remove ${name}`);
}

/** Leader-only sticker "x" with a confirm step: the first tap arms it, a second tap within 3 s sends. */
function removeButton(ctx: ScreenCtx, s: Standing): HTMLButtonElement {
  const b = el('button', { type: 'button', class: 'remove-btn label', 'data-remove': s.playerId });
  const cur = armedByCtx.get(ctx);
  const isArmed = cur?.id === s.playerId;
  paintRemove(b, isArmed, s.name);
  if (cur && isArmed) cur.btn = b;
  b.addEventListener('click', () => {
    const now = armedByCtx.get(ctx);
    if (now && now.id === s.playerId) {
      clearTimeout(now.timer);
      armedByCtx.delete(ctx);
      ctx.send({ t: 'leader', action: 'remove', playerId: s.playerId });
      return;
    }
    if (now) {
      clearTimeout(now.timer);
      if (now.btn) paintRemove(now.btn, false, now.btn.dataset.name ?? '');
    }
    const armed: Armed = {
      id: s.playerId,
      btn: b,
      timer: setTimeout(() => {
        if (armedByCtx.get(ctx) === armed) armedByCtx.delete(ctx);
        if (armed.btn) paintRemove(armed.btn, false, s.name);
      }, REMOVE_ARM_MS),
    };
    armedByCtx.set(ctx, armed);
    paintRemove(b, true, s.name);
  });
  b.dataset.name = s.name;
  return b;
}

/**
 * Standings list. With `ctx` and `screen.isLeader`, every other player's entry gets a remove control
 * (never the leader's own entry); away players are dimmed with an "away" label.
 */
export function standingsList(screen: Screen, ctx?: ScreenCtx): HTMLElement {
  const list = el('ol', { class: 'standings' });
  const canRemove = !!ctx && screen.isLeader;
  for (const s of screen.standings) {
    const me = s.name === screen.name;
    const row = standingRow(s, me);
    if (canRemove && !me) row.append(removeButton(ctx, s));
    list.append(row);
  }
  return list;
}

function standingRow(s: Standing, me: boolean): HTMLElement {
  const cls = ['standing', s.left ? 'left' : '', !s.connected ? 'offline' : '', me ? 'me' : '']
    .filter(Boolean)
    .join(' ');
  const row = el('li', { class: cls });
  const dot = el('span', { class: 'dot' });
  dot.style.background = colorVar(s.color);
  row.append(dot, el('span', { class: 'label name', text: s.name }));
  if (!s.connected && !s.left) row.append(el('span', { class: 'caption away', text: 'away' }));
  row.append(el('span', { class: 'score-num', text: String(s.score) }));
  return row;
}

export function roundLine(screen: Screen): HTMLElement {
  const text =
    screen.round > 0
      ? `Round ${screen.round} · first to ${screen.targetScore}`
      : `First to ${screen.targetScore}`;
  return el('p', { class: 'caption muted', text });
}
