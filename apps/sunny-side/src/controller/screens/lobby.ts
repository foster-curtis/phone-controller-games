// Lobby (SPEC §6.3, §6.7): a quick name step first, then color + Ready; the leader also sees the
// difficulty picker and Start (enabled once every other player is ready). A pencil button opens a
// rename popup.
import { el } from '../dom';
import { fitAboveKeyboard } from '../keyboard';
import {
  DIFFICULTIES,
  PLAYER_COLOR_IDS,
  type Difficulty,
  type PlayerColorId,
  type Screen,
} from '../../shared/messages';
import { loadName, MAX_NAME_LENGTH, saveName } from '../storage';
import {
  colorVar,
  heading,
  leaderButton,
  markImg,
  roundLine,
  standingsList,
  stickerButton,
  type ScreenCtx,
  type ScreenView,
} from './common';

type LobbyScreen = Extract<Screen, { kind: 'lobby' }>;

const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  easy: 'Easy',
  medium: 'Medium',
  hard: 'Hard',
};

function nameInput(value: string): HTMLInputElement {
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
  input.value = value;
  return input;
}

export function createLobby(ctx: ScreenCtx, first: LobbyScreen): ScreenView<LobbyScreen> {
  const root = el('section', { class: 'screen lobby', 'data-screen': 'lobby' });

  let chosen: PlayerColorId | null = first.color;
  let current = first;
  let name = loadName(ctx.storage) || first.name;
  let renaming: HTMLElement | null = null;
  let stopRenameFit = () => {};
  let stopNameStepFit = () => {};

  const sendProfile = () => {
    if (chosen) ctx.send({ t: 'profile', name, color: chosen });
  };

  const setName = (raw: string) => {
    name = raw.trim().slice(0, MAX_NAME_LENGTH);
    saveName(name, ctx.storage);
    sendProfile();
  };

  // ---- name step ----

  const showNameStep = () => {
    root.classList.add('name-step');
    const input = nameInput(name);
    const next = el('button', { type: 'submit', class: 'btn btn-accent label', text: 'Next' });
    const form = el('form', { class: 'lobby-form' }, input, next);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      input.blur();
      setName(input.value);
      ctx.named = true;
      showMain();
    });
    root.replaceChildren(
      el('div', { class: 'name-step-card' }, markImg(), heading("What's your name?"), form),
    );
    stopNameStepFit = fitAboveKeyboard(root);
  };

  // ---- rename popup ----

  const closeRename = () => {
    stopRenameFit();
    stopRenameFit = () => {};
    renaming?.remove();
    renaming = null;
  };

  const openRename = () => {
    closeRename();
    const input = nameInput(name);
    const save = el('button', { type: 'submit', class: 'btn btn-accent label', text: 'Save' });
    const cancel = stickerButton('Cancel', closeRename);
    const form = el(
      'form',
      { class: 'lobby-form' },
      input,
      el('div', { class: 'actions' }, cancel, save),
    );
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      input.blur();
      setName(input.value);
      closeRename();
    });
    renaming = el(
      'div',
      { class: 'overlay', 'data-popup': 'rename' },
      el(
        'div',
        { class: 'overlay-card' },
        el('h1', { class: 'h2 sticker-heading', text: 'Change name' }),
        form,
      ),
    );
    root.append(renaming);
    stopRenameFit = fitAboveKeyboard(renaming);
  };

  // ---- main lobby ----

  const swatches = el('div', { class: 'swatches', role: 'radiogroup', 'aria-label': 'Color' });
  const nameRow = el('div', { class: 'lobby-name' });
  const standings = el('div', { class: 'lobby-standings scroll-y' });
  const actions = el('div', { class: 'actions' });
  const side = el('div', { class: 'lobby-side' });
  const main = el('div', { class: 'lobby-main' });
  side.append(markImg(), heading('Lobby'), standings);
  main.append(nameRow, swatches, actions);

  const ready = () => current.ready === true;

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
      // A ready player's color (and name) is locked until they tap again to un-ready.
      if (taken || ready()) b.disabled = true;
      b.addEventListener('click', () => {
        chosen = id;
        paintSwatches();
        sendProfile();
      });
      swatches.append(b);
    }
  };

  const difficultyPicker = (): HTMLElement => {
    const group = el('div', {
      class: 'difficulty',
      role: 'radiogroup',
      'aria-label': 'Difficulty',
    });
    const now = current.difficulty ?? 'medium';
    for (const d of DIFFICULTIES) {
      const b = el('button', {
        type: 'button',
        class: `chip label${d === now ? ' selected' : ''}`,
        role: 'radio',
        'aria-checked': String(d === now),
        'data-difficulty': d,
        text: DIFFICULTY_LABEL[d],
      });
      b.addEventListener('click', () => {
        if (d !== (current.difficulty ?? 'medium')) {
          ctx.send({ t: 'leader', action: 'difficulty', difficulty: d });
        }
      });
      group.append(b);
    }
    return group;
  };

  const readyButton = (): HTMLButtonElement => {
    const on = ready();
    const text = on ? `Waiting for ${current.leaderName || 'the leader'}…` : 'Ready';
    const b = stickerButton(
      text,
      () => ctx.send({ t: 'ready', ready: !ready() }),
      on ? 'ready-btn pressed' : 'ready-btn btn-accent',
    );
    b.dataset.ready = String(on);
    b.setAttribute('aria-pressed', String(on));
    return b;
  };

  const renderMain = () => {
    if (!chosen || (current.takenColors.includes(chosen) && chosen !== current.color)) {
      chosen =
        current.color ?? PLAYER_COLOR_IDS.find((c) => !current.takenColors.includes(c)) ?? null;
    }
    if (ready() && current.color) chosen = current.color;
    // Ready locks the name (and color) until the player un-readies.
    if (ready()) closeRename();
    const edit = stickerButton('✎', openRename, 'icon-btn');
    edit.setAttribute('aria-label', 'Change name');
    edit.dataset.rename = '';
    edit.disabled = ready();
    nameRow.replaceChildren(el('span', { class: 'label name', text: current.name }), edit);
    paintSwatches();
    standings.replaceChildren(roundLine(current), standingsList(current, ctx));
    actions.replaceChildren();
    if (current.isLeader) {
      const start = leaderButton(ctx, 'Start', 'start');
      start.disabled = !current.canStart;
      actions.append(difficultyPicker(), start);
      const others = current.standings.filter(
        (s) => s.connected && !s.left && s.name !== current.name,
      );
      const waiting = others.filter((s) => !s.ready).length;
      if (others.length > 0 && waiting > 0) {
        actions.append(
          el('p', {
            class: 'caption muted',
            'data-hint': '',
            text: `Waiting for ${waiting} player${waiting === 1 ? '' : 's'} to ready up`,
          }),
        );
      }
    } else {
      actions.append(readyButton());
    }
  };

  const showMain = () => {
    stopNameStepFit();
    stopNameStepFit = () => {};
    root.classList.remove('name-step');
    root.replaceChildren(side, main);
    if (renaming) root.append(renaming);
    renderMain();
  };

  if (ctx.named) showMain();
  else showNameStep();

  return {
    el: root,
    update(s) {
      current = s;
      if (!root.classList.contains('name-step')) renderMain();
    },
    destroy() {
      stopNameStepFit();
      closeRename();
    },
  };
}
