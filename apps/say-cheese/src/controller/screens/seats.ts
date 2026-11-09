// "Players on this phone" panel (SPEC §6.3.1): seat chips with ✕, "+ Add another player on this
// phone" (the same name step), and the collapsible "Why share a phone?" hint. Each extra seat's key
// goes into the seat-key store (`SEAT_KEYS_STORAGE` per room) once the host confirms the seat.
import { el } from '@pcg/controller-kit';
import { createSeatKeyStore, type SeatKeyStore } from '../../shared/seats';
import { NAME_MAX, type Screen } from '../../shared/messages';
import type { Ctx } from '../ctx';
import { button, chip, para } from './view';

type Lobby = Extract<Screen, { kind: 'lobby' }>;

export const SHARE_HINT =
  "No phone? No problem. Add kids or anyone without a phone here. You'll just pass this phone to them when it's their turn to take photos.";

function newKey(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `k${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

function defaultStore(): SeatKeyStore {
  const code = new URLSearchParams(location.search).get('code')?.trim().toUpperCase() || 'local';
  let storage: Storage | undefined;
  try {
    storage = localStorage;
  } catch {
    storage = undefined;
  }
  return createSeatKeyStore(storage, code);
}

export interface SeatsPanel {
  el: HTMLElement;
  update(s: Lobby): void;
}

export function createSeatsPanel(ctx: Ctx, store: SeatKeyStore = defaultStore()): SeatsPanel {
  const root = el('section', { class: 'seats-panel' });
  const chips = el('ul', { class: 'players seat-chips' });
  const addSlot = el('div', { class: 'add-seat' });
  const hint = el(
    'details',
    { class: 'share-hint' },
    el('summary', { text: 'Why share a phone?' }),
  );
  hint.append(para(SHARE_HINT, 'caption'));
  const title = el('h2', { class: 'caption', text: 'Players on this phone' });
  root.append(title, chips, addSlot, hint);

  // Keys sent with addSeat, waiting for the host to give the seat an index.
  const pending: Array<{ name: string; seatKey: string }> = [];
  let adding = false;
  let canAdd = true;
  let input: HTMLInputElement | null = null;

  const submit = () => {
    const name = input?.value.trim() ?? '';
    if (!name || !canAdd) return;
    const seatKey = newKey();
    pending.push({ name, seatKey });
    ctx.send({ t: 'addSeat', name, seatKey });
    adding = false;
    input = null;
    paintAdd();
  };

  function paintAdd() {
    if (!adding) {
      addSlot.replaceChildren(
        button(
          '+ Add another player on this phone',
          () => {
            adding = true;
            paintAdd();
            input?.focus();
          },
          { id: 'addSeat', cls: 'btn--quiet', disabled: !canAdd },
        ),
      );
      return;
    }
    const field = el('input', {
      type: 'text',
      class: 'name-input',
      name: 'seatName',
      maxlength: String(NAME_MAX),
      autocomplete: 'off',
      autocapitalize: 'words',
      placeholder: 'Their name',
      'aria-label': 'New player name',
    });
    field.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
    input = field;
    addSlot.replaceChildren(
      field,
      el(
        'div',
        { class: 'leader-row' },
        button('Add', submit, { id: 'confirmSeat' }),
        button(
          'Cancel',
          () => {
            adding = false;
            input = null;
            paintAdd();
          },
          { id: 'cancelSeat', cls: 'btn--quiet' },
        ),
      ),
    );
  }

  paintAdd();

  return {
    el: root,
    update(s) {
      canAdd = s.canAddSeat;
      // A seat the host now lists but the store doesn't know is the one we just added.
      const known = new Set(store.load().map((x) => x.seat));
      for (const seat of s.seats) {
        if (seat.seat === 0 || known.has(seat.seat)) continue;
        const i = pending.findIndex((p) => p.name === seat.name);
        if (i < 0) continue;
        const [p] = pending.splice(i, 1);
        if (p) store.add({ seat: seat.seat, seatKey: p.seatKey, name: p.name });
      }
      chips.replaceChildren(
        ...s.seats.map((seat) => {
          const li = el('li', { 'data-seat': String(seat.seat) }, chip(seat.name, seat.color));
          if (seat.seat > 0) {
            const x = button(
              '✕',
              () => {
                store.remove(seat.seat);
                ctx.send({ t: 'removeSeat', seat: seat.seat });
              },
              { id: 'removeSeat', cls: 'btn--quiet' },
            );
            x.setAttribute('aria-label', `Remove ${seat.name}`);
            li.append(x);
          }
          return li;
        }),
      );
      title.hidden = s.seats.length < 2;
      chips.hidden = s.seats.length < 2;
      const add = addSlot.querySelector<HTMLButtonElement>('[data-action=addSeat]');
      if (add) add.disabled = !canAdd;
    },
  };
}
