// Joining and lobby screens (SPEC §6.1, §6.3, §6.7): name (prefilled from localStorage), color chip,
// Enable camera with the "no camera" badge, Ready, leader Start / How to play, and the shared-device
// panel (Players on this phone, Add another player; SPEC §6.3.1), whose DOM persists across lobby
// updates so a name typed for a new seat isn't lost.
import { el } from '@pcg/controller-kit';
import { NAME_MAX, type Screen } from '../../shared/messages';
import type { Ctx } from '../ctx';
import { createSeatsPanel } from './seats';
import { button, chip, heading, para, type View } from './view';

function nameInput(ctx: Ctx, onCommit: (name: string) => void): HTMLInputElement {
  const input = el('input', {
    type: 'text',
    class: 'name-input',
    name: 'name',
    maxlength: String(NAME_MAX),
    autocomplete: 'off',
    autocapitalize: 'words',
    placeholder: 'Your name',
    'aria-label': 'Your name',
  });
  input.value = ctx.getName();
  const commit = () => {
    const name = input.value.trim();
    if (!name) return;
    ctx.setName(name);
    onCommit(name);
  };
  input.addEventListener('change', commit);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && input.blur());
  return input;
}

export function joiningView(first: Screen, ctx: Ctx): View {
  const root = el('main', { class: 'screen', 'data-screen': 'joining' });
  const input = nameInput(ctx, () => {});
  const join = button('Join', () => {
    const name = input.value.trim();
    if (!name) {
      input.focus();
      return;
    }
    ctx.setName(name);
    ctx.send({ t: 'profile', seat: 0, name });
    join.disabled = true;
    join.textContent = 'Joining…';
  });
  root.append(heading('Say Cheese!'), para('What should we call you?'), input, join);
  void first;
  return { el: root, update() {}, destroy() {} };
}

export function lobbyView(first: Screen, ctx: Ctx): View {
  const input = nameInput(ctx, (name) => ctx.send({ t: 'profile', seat: 0, name }));
  const panel = createSeatsPanel(ctx);
  const root = el('main', { class: 'screen lobby', 'data-screen': 'lobby' });
  const top = el('div', { class: 'lobby-top' });
  const rest = el('div', { class: 'lobby-rest' });
  root.append(top, panel.el, rest);
  let enabling = false;
  const paint = (screen: Screen) => {
    const s = screen as Extract<Screen, { kind: 'lobby' }>;
    const me = s.seats[0];
    if (me && document.activeElement !== input && !input.value) input.value = me.name;
    const noCam = s.camera === 'denied';
    const camBtn = button(
      s.camera === 'ok' ? 'Camera on ✓' : 'Enable camera',
      () => {
        if (enabling) return;
        enabling = true;
        void ctx.camera.enable().then((r) => {
          enabling = false;
          ctx.send({ t: 'camera', ok: r === 'ok' });
        });
      },
      { cls: 'btn--quiet', id: 'camera', disabled: s.camera === 'ok' },
    );
    top.replaceChildren(
      heading('Lobby'),
      el('div', { class: 'me' }, me ? chip(me.name, me.color, 'chip--big') : null, input),
    );
    panel.update(s);
    const nodes: Array<Node | false> = [
      el(
        'div',
        { class: 'camera-row' },
        camBtn,
        noCam && el('span', { class: 'badge', text: 'No camera' }),
      ),
      noCam &&
        para("No camera? You can still play, you just can't be the photographer.", 'caption'),
      button(
        s.ready ? 'Not ready' : 'Ready',
        () => {
          void ctx.sfx.unlock();
          ctx.send({ t: 'ready', ready: !s.ready });
        },
        { id: 'ready', cls: s.ready ? 'btn--quiet' : '' },
      ),
      el(
        'ul',
        { class: 'players' },
        ...s.players.map((p) =>
          el(
            'li',
            { class: p.connected ? '' : 'away' },
            chip(p.name, p.color),
            el('span', { class: 'caption', text: p.ready ? '✓ Ready' : '' }),
          ),
        ),
      ),
      s.isLeader &&
        el(
          'div',
          { class: 'leader-row' },
          button('Start', () => ctx.send({ t: 'leader', action: 'start' }), {
            id: 'start',
            disabled: !s.canStart,
          }),
          button('How to play', () => ctx.send({ t: 'leader', action: 'howToPlay' }), {
            id: 'howToPlay',
            cls: 'btn--quiet',
          }),
        ),
      !s.isLeader &&
        para(s.leaderName ? `${s.leaderName} starts the game` : 'Waiting for a leader', 'caption'),
    ];
    rest.replaceChildren(...nodes.filter((n): n is Node => !!n));
  };
  paint(first);
  return { el: root, update: paint, destroy() {} };
}
