// Small screens: joining (phone-local), game paused, left.
import { el } from '../dom';
import type { Screen } from '../../shared/messages';
import { heading, markImg, stickerButton, type ScreenCtx, type ScreenView } from './common';

export interface JoiningView {
  el: HTMLElement;
  set(state: { code: string | null; error: string | null }): void;
}

/** Joining: room code (prefilled from the QR), connecting. Asks for the code if there is none. */
export function createJoining(onCode: (code: string) => void): JoiningView {
  const root = el('section', { class: 'screen joining', 'data-screen': 'joining' });
  const code = el('div', { class: 'code' });
  const status = el('p', { class: 'body status' });
  const form = el('form', { class: 'code-form' });
  const input = el('input', {
    class: 'name-input code',
    type: 'text',
    maxlength: '8',
    placeholder: 'CODE',
    autocapitalize: 'characters',
    autocomplete: 'off',
  });
  form.append(input, el('button', { type: 'submit', class: 'btn btn-accent label', text: 'Join' }));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = input.value.trim().toUpperCase();
    if (v) onCode(v);
  });
  root.append(markImg(), heading('Sunny Side Slam'), code, status, form);
  return {
    el: root,
    set({ code: c, error }) {
      code.textContent = c ?? '';
      code.hidden = !c;
      form.hidden = !!c;
      status.textContent = error ?? (c ? 'Connecting…' : 'Enter the room code on the TV');
      status.classList.toggle('error', !!error);
    },
  };
}

type GamePaused = Extract<Screen, { kind: 'gamePaused' }>;

export function createGamePaused(ctx: ScreenCtx): ScreenView<GamePaused> {
  const root = el(
    'section',
    { class: 'screen gamePaused', 'data-screen': 'gamePaused' },
    heading('Game paused'),
    el('p', { class: 'body', text: 'Make sure the host screen is open and connected.' }),
    stickerButton('Leave game', () => ctx.send({ t: 'leave' })),
  );
  return { el: root, update() {}, destroy() {} };
}

type Left = Extract<Screen, { kind: 'left' }>;

export function createLeft(): ScreenView<Left> {
  const root = el(
    'section',
    { class: 'screen left', 'data-screen': 'left' },
    heading('You left the game'),
    el('p', { class: 'body', text: 'Reopen the link to rejoin; your score is kept.' }),
  );
  return { el: root, update() {}, destroy() {} };
}

/** Phone-local: this phone was removed (by the leader/host), not a self-Leave. */
export function createRemoved(onJoinAgain: () => void): ScreenView {
  const root = el(
    'section',
    { class: 'screen removed', 'data-screen': 'removed' },
    heading('You were removed from the game'),
    stickerButton('Join again', onJoinAgain, 'btn-accent'),
  );
  return { el: root, update() {}, destroy() {} };
}
