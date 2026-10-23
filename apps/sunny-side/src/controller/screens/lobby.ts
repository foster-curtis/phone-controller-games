// Lobby: name + color; the leader also sees Start (SPEC §6.3, §6.7).
import { el } from '../dom';
import { PLAYER_COLOR_IDS, type PlayerColorId, type Screen } from '../../shared/messages';
import { loadName, MAX_NAME_LENGTH, saveName } from '../storage';
import {
  colorVar,
  heading,
  leaderButton,
  markImg,
  roundLine,
  standingsList,
  type ScreenCtx,
  type ScreenView,
} from './common';

type LobbyScreen = Extract<Screen, { kind: 'lobby' }>;

export function createLobby(ctx: ScreenCtx, first: LobbyScreen): ScreenView<LobbyScreen> {
  const root = el('section', { class: 'screen lobby', 'data-screen': 'lobby' });
  const input = el('input', {
    class: 'name-input body',
    type: 'text',
    name: 'name',
    maxlength: String(MAX_NAME_LENGTH),
    placeholder: 'Your name',
    autocomplete: 'off',
    autocapitalize: 'words',
    enterkeyhint: 'done',
  });
  input.value = loadName(ctx.storage) || first.name;
  const swatches = el('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Color' });
  const join = el('button', { type: 'submit', class: 'btn btn-accent label', text: 'Ready' });
  const form = el('form', { class: 'lobby-form' }, input, swatches, join);
  const standings = el('div', { class: 'lobby-standings' });
  const actions = el('div', { class: 'actions' });
  const side = el('div', { class: 'lobby-side' });
  const main = el('div', { class: 'lobby-main' });
  side.append(markImg(), heading('Lobby'), standings);
  main.append(form, actions);
  root.append(side, main);

  let chosen: PlayerColorId | null = first.color;
  let current = first;

  const profile = () => {
    const name = input.value.trim().slice(0, MAX_NAME_LENGTH);
    if (chosen) ctx.send({ t: 'profile', name, color: chosen });
    return name;
  };

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    saveName(profile(), ctx.storage);
  });

  const paintSwatches = () => {
    swatches.replaceChildren();
    for (const id of PLAYER_COLOR_IDS) {
      const taken = current.takenColors.includes(id) && id !== current.color;
      const selected = id === chosen;
      const b = el('button', {
        type: 'button',
        class: `swatch${selected ? ' selected' : ''}`,
        role: 'radio',
        'aria-checked': String(selected),
        'aria-label': id,
        'data-color': id,
      });
      b.style.background = colorVar(id);
      if (taken) b.disabled = true;
      b.addEventListener('click', () => {
        chosen = id;
        paintSwatches();
        profile();
      });
      swatches.append(b);
    }
  };

  const render = () => {
    if (!chosen || (current.takenColors.includes(chosen) && chosen !== current.color)) {
      chosen =
        current.color ?? PLAYER_COLOR_IDS.find((c) => !current.takenColors.includes(c)) ?? null;
    }
    paintSwatches();
    standings.replaceChildren(roundLine(current), standingsList(current));
    actions.replaceChildren();
    if (current.isLeader) {
      const start = leaderButton(ctx, 'Start', 'start');
      start.disabled = !current.canStart;
      actions.append(start);
    }
  };
  render();

  return {
    el: root,
    update(s) {
      current = s;
      render();
    },
    destroy() {},
  };
}
