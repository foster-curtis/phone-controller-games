// Leave game + Remove a player (SPEC §6.3 Leave, §6.3.1 Leaving): a small menu button over every
// screen that has seats, opening a sheet with this phone's players (Remove one, on a shared phone)
// and Leave game (every seat). Both ask "Are you sure?" first. Hidden while the photographer's whole
// screen is the shutter (scatter / shoot). Leaving forgets the seat keys too, so a later rejoin is a
// new player (SPEC §6.3).
import { el } from '@pcg/controller-kit';
import type { PhoneMsg, Screen } from '../../shared/messages';
import type { SeatKeyStore } from '../../shared/seats';
import { button, colorVars } from './view';

export interface LeaveMenuOptions {
  send(msg: PhoneMsg): void;
  /** This phone's seat keys (SC7 store): a removed seat's key is forgotten. */
  seatKeys?: SeatKeyStore;
}

export interface LeaveMenu {
  readonly el: HTMLElement;
  update(screen: Screen): void;
  destroy(): void;
}

/** No menu on these screens (nothing to leave, or the photographer can't see it). */
function hidden(s: Screen): boolean {
  if (s.kind === 'joining' || s.kind === 'left' || s.seats.length === 0) return true;
  const photographer = 'role' in s && s.role === 'photographer';
  return photographer && (s.kind === 'scatter' || s.kind === 'shoot');
}

type Confirm = { kind: 'leave' } | { kind: 'remove'; seat: number; name: string };

export function createLeaveMenu(opts: LeaveMenuOptions): LeaveMenu {
  const root = el('div', { class: 'leave-menu', style: 'position: fixed; z-index: 4' });
  const toggle = button('⋯', () => open(null), { id: 'menu', cls: 'btn--quiet' });
  toggle.setAttribute('aria-label', 'Leave or remove a player');
  toggle.setAttribute(
    'style',
    'position: fixed; top: var(--space-2); right: var(--space-2); z-index: 4; min-width: 48px',
  );
  let screen: Screen | null = null;
  let sheet: HTMLElement | null = null;

  function close(): void {
    sheet?.remove();
    sheet = null;
  }

  function open(confirm: Confirm | null): void {
    close();
    if (!screen) return;
    const seats = screen.seats;
    const body = el('div', { class: 'sheet', 'data-sheet': 'leave' });
    if (confirm) {
      body.append(
        el('p', {
          class: 'body',
          text:
            confirm.kind === 'leave'
              ? 'Leave the game? You can’t come back into this match.'
              : `Remove ${confirm.name} from the game?`,
        }),
        button(
          confirm.kind === 'leave' ? 'Leave game' : `Remove ${confirm.name}`,
          () => {
            if (confirm.kind === 'leave') {
              opts.send({ t: 'leave' });
              opts.seatKeys?.save([]);
            } else {
              opts.send({ t: 'removeSeat', seat: confirm.seat });
              opts.seatKeys?.remove(confirm.seat);
            }
            close();
          },
          { id: confirm.kind === 'leave' ? 'confirmLeave' : 'confirmRemove' },
        ),
      );
    } else {
      if (seats.length >= 2) {
        body.append(
          el('p', { class: 'caption', text: 'Remove a player' }),
          el(
            'ul',
            { class: 'sheet-list' },
            ...seats.map((s) =>
              el(
                'li',
                {},
                el('button', {
                  type: 'button',
                  class: 'sheet-option',
                  style: colorVars(s.color),
                  'data-remove-seat': String(s.seat),
                  text: `✕ ${s.name}`,
                }),
              ),
            ),
          ),
        );
        body.querySelectorAll<HTMLButtonElement>('[data-remove-seat]').forEach((b) => {
          const seat = Number(b.dataset.removeSeat);
          const name = seats.find((s) => s.seat === seat)?.name ?? '';
          b.addEventListener('click', () => open({ kind: 'remove', seat, name }));
        });
      }
      body.append(button('Leave game', () => open({ kind: 'leave' }), { id: 'leave' }));
    }
    body.append(button('Cancel', close, { id: 'cancelMenu', cls: 'btn--quiet' }));
    const backdrop = el('div', { class: 'sheet-backdrop' }, body);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) close();
    });
    sheet = backdrop;
    root.append(backdrop);
  }

  return {
    el: root,
    update(s) {
      screen = s;
      if (hidden(s)) {
        toggle.remove();
        close();
      } else if (toggle.parentNode !== root) {
        root.prepend(toggle);
      }
    },
    destroy() {
      close();
      root.remove();
    },
  };
}
