// Pre-lobby "who's playing on this phone" form (SPEC §6.3.1, §6.7): your name plus "+ Add another
// player" rows (✕, up to the room's 8-seat cap), the collapsible "Why share a phone?" hint and a big
// Join. Nothing goes to the host until Join; then `profile` (seat 0), `addSeat` per extra name. Opened
// again from the lobby's pencil, Join sends only the diffs (rename, add, remove). Each extra seat's
// key goes into the seat-key store (`SEAT_KEYS_STORAGE` per room) once the host lists the seat.
import { el } from '@pcg/controller-kit';
import { createSeatKeyStore, type SeatKeyStore } from '../../shared/seats';
import { MAX_SEATS, NAME_MAX, type Screen, type ScreenSeat } from '../../shared/messages';
import type { Ctx } from '../ctx';
import { button, lockup, para } from './view';

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

interface Row {
  /** The host's phone-local seat index; null for a row added in this form. */
  seat: number | null;
  input: HTMLInputElement;
}

export interface SeatsForm {
  el: HTMLElement;
  /** Fills the rows from the phone's current seats (none: just the remembered name). */
  open(seats: readonly ScreenSeat[]): void;
  /** Host update: room for more rows, and keys of the seats we just added. */
  update(s: Screen): void;
}

export function createSeatsForm(
  ctx: Ctx,
  onJoined: () => void,
  store: SeatKeyStore = defaultStore(),
): SeatsForm {
  const root = el('section', { class: 'seats-form' });
  const list = el('ul', { class: 'seat-rows' });
  const addSlot = el('div', { class: 'add-seat' });
  const hint = el(
    'details',
    { class: 'share-hint' },
    el('summary', { text: 'Why share a phone?' }),
  );
  hint.append(para(SHARE_HINT, 'caption'));
  const join = button('Join', () => submit(), { id: 'join' });
  root.append(lockup(), para("Who's playing on this phone?"), list, addSlot, hint, join);

  let rows: Row[] = [];
  let base: readonly ScreenSeat[] = [];
  let maxRows = MAX_SEATS;
  /** Keys sent with addSeat, waiting for the host to give the seat an index. */
  const pending: Array<{ name: string; seatKey: string }> = [];

  const makeInput = (seat: number | null, value: string): Row => {
    const first = seat === 0;
    const input = el('input', {
      type: 'text',
      class: 'name-input',
      name: first ? 'name' : 'seatName',
      maxlength: String(NAME_MAX),
      autocomplete: 'off',
      autocapitalize: 'words',
      placeholder: first ? 'Your name' : 'Their name',
      'aria-label': first ? 'Your name' : 'Player name',
    });
    input.value = value;
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') input.blur();
    });
    return { seat, input };
  };

  function paint() {
    list.replaceChildren(
      ...rows.map((row, i) => {
        const li = el('li', { class: 'seat-row' }, row.input);
        if (i > 0) {
          const x = button(
            '✕',
            () => {
              rows = rows.filter((r) => r !== row);
              paint();
            },
            { id: 'removeRow', cls: 'btn--quiet' },
          );
          x.setAttribute('aria-label', 'Remove this player');
          li.append(x);
        }
        return li;
      }),
    );
    addSlot.replaceChildren(
      button(
        '+ Add another player',
        () => {
          const row = makeInput(null, '');
          rows = [...rows, row];
          paint();
          row.input.focus();
        },
        { id: 'addSeat', cls: 'btn--quiet', disabled: rows.length >= maxRows },
      ),
    );
  }

  function submit() {
    const mine = rows[0];
    const name = mine?.input.value.trim() ?? '';
    if (!mine || !name) {
      mine?.input.focus();
      return;
    }
    ctx.setName(name);
    const wanted = rows
      .map((r) => ({ seat: r.seat, name: r.input.value.trim() }))
      .filter((r, i) => i === 0 || r.name);
    if (base.length === 0) {
      ctx.send({ t: 'profile', seat: 0, name });
    } else {
      // Removals first, so the room has space for the additions.
      const kept = new Set(wanted.map((r) => r.seat));
      for (const b of base) {
        if (b.seat === 0 || kept.has(b.seat)) continue;
        store.remove(b.seat);
        ctx.send({ t: 'removeSeat', seat: b.seat });
      }
      for (const w of wanted) {
        const was = base.find((b) => b.seat === w.seat);
        if (!was || was.name === w.name) continue;
        ctx.send({ t: 'profile', seat: was.seat, name: w.name });
        const saved = store.load().find((x) => x.seat === was.seat);
        if (saved) store.add({ ...saved, name: w.name });
      }
    }
    for (const w of wanted) {
      if (w.seat !== null) continue;
      const seatKey = newKey();
      pending.push({ name: w.name, seatKey });
      ctx.send({ t: 'addSeat', name: w.name, seatKey });
    }
    if (base.length === 0) {
      join.disabled = true;
      join.textContent = 'Joining…';
    }
    onJoined();
  }

  return {
    el: root,
    open(seats) {
      base = seats.map((s) => ({ ...s }));
      const first = seats[0];
      rows = [makeInput(0, first ? first.name : ctx.getName())];
      for (const s of seats.slice(1)) rows.push(makeInput(s.seat, s.name));
      join.disabled = false;
      join.textContent = 'Join';
      paint();
    },
    update(s) {
      if (s.kind === 'lobby') {
        const cap = MAX_SEATS - Math.max(0, s.players.length - s.seats.length);
        if (cap !== maxRows) {
          maxRows = cap;
          const add = addSlot.querySelector<HTMLButtonElement>('[data-action=addSeat]');
          if (add) add.disabled = rows.length >= maxRows;
        }
      }
      // A seat the host now lists but the store doesn't know is one we just added.
      const known = new Set(store.load().map((x) => x.seat));
      for (const seat of s.seats) {
        if (seat.seat === 0 || known.has(seat.seat)) continue;
        const i = pending.findIndex((p) => p.name === seat.name);
        if (i < 0) continue;
        const [p] = pending.splice(i, 1);
        if (p) store.add({ seat: seat.seat, seatKey: p.seatKey, name: p.name });
      }
    },
  };
}
