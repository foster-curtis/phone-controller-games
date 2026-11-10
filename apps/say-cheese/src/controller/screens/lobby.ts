// Joining and lobby screens (SPEC §6.1, §6.3, §6.3.1, §6.7), one routed view with two faces. Before the
// phone is in the room (`data-screen=joining`) it shows the "who's playing on this phone" form
// (seats.ts); after Join it shows the lobby (`data-screen=lobby`): this phone's name(s) once at the
// top with a ✏️ pencil that goes back to the form, Enable camera, Ready, leader Start / How to play.
import { el } from '@pcg/controller-kit';
import type { Screen } from '../../shared/messages';
import type { Ctx } from '../ctx';
import { createSeatsForm } from './seats';
import { button, chip, heading, para, type View } from './view';

export function lobbyView(first: Screen, ctx: Ctx): View {
  const root = el('main', { class: 'screen lobby' });
  const body = el('div', { class: 'lobby-body' });
  const form = createSeatsForm(ctx, () => {
    editing = false;
    // First Join: wait for the host to seat us (update() switches); a re-Join returns right away.
    if (latest.seats.length > 0) setMode('lobby');
  });

  let mode: 'form' | 'lobby' = 'form';
  /** The form was opened from the pencil: stay on it through host updates. */
  let editing = false;
  let latest: Screen = first;
  let enabling = false;

  function setMode(next: 'form' | 'lobby') {
    mode = next;
    root.dataset.screen = next === 'lobby' ? 'lobby' : 'joining';
    // Only one face is in the DOM at a time; the form keeps its inputs while it's out.
    root.replaceChildren(next === 'lobby' ? body : form.el);
    if (next === 'lobby') paintLobby(latest);
  }

  function edit(s: Screen) {
    editing = true;
    form.open(s.seats);
    setMode('form');
  }

  function paintLobby(screen: Screen) {
    if (screen.kind !== 'lobby') return;
    const s = screen;
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
    const pencil = button('✏️', () => edit(latest), { id: 'editPlayers', cls: 'btn--quiet' });
    pencil.setAttribute('aria-label', 'Change who is playing on this phone');
    // This phone's players are shown once, at the top; the list below is everyone else.
    const mine = new Set(s.seats.map((x) => x.color));
    const others = s.players.filter((p) => !mine.has(p.color));
    const nodes: Array<Node | false> = [
      heading('Lobby'),
      el(
        'div',
        { class: 'me' },
        ...s.seats.map((seat) => chip(seat.name, seat.color, 'chip--big')),
        pencil,
      ),
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
        ...others.map((p) =>
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
    body.replaceChildren(...nodes.filter((n): n is Node => !!n));
  }

  const update = (screen: Screen) => {
    latest = screen;
    form.update(screen);
    // Seated (Join went through, or the host restored this phone's seats): show the lobby, unless
    // the pencil is open. No seats left: back to the form.
    if (mode === 'form' && screen.seats.length > 0 && !editing) setMode('lobby');
    else if (mode === 'lobby' && screen.seats.length === 0) {
      editing = false;
      form.open([]);
      setMode('form');
    } else if (mode === 'lobby') paintLobby(screen);
  };
  form.open(first.seats);
  setMode(first.seats.length > 0 ? 'lobby' : 'form');
  return { el: root, update, destroy() {} };
}

export const joiningView = lobbyView;
