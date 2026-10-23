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

export function standingsList(screen: Screen): HTMLElement {
  const list = el('ol', { class: 'standings' });
  for (const s of screen.standings) list.append(standingRow(s, s.name === screen.name));
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
