// Leave game + Remove a player menu (SPEC §6.3, §6.3.1): confirm before sending; seat keys forgotten.
import { describe, expect, it } from 'vitest';
import type { PhoneMsg, Screen } from '../../shared/messages';
import { createSeatKeyStore } from '../../shared/seats';
import { createLeaveMenu } from '../screens/leave';

const base = { leaderName: null, isLeader: false, canEmoji: false };
const lobby = (seats: Screen['seats']): Screen =>
  ({ ...base, kind: 'lobby', seats }) as unknown as Screen;

function setup() {
  const sent: PhoneMsg[] = [];
  const mem = new Map<string, string>();
  const seatKeys = createSeatKeyStore(
    {
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => void mem.set(k, v),
      removeItem: (k) => void mem.delete(k),
    },
    'ABCD',
  );
  seatKeys.add({ seat: 1, seatKey: 'kid', name: 'Kid' });
  const menu = createLeaveMenu({ send: (m) => void sent.push(m), seatKeys });
  document.body.replaceChildren(menu.el);
  const q = (sel: string) => menu.el.querySelector<HTMLElement>(sel);
  return { sent, seatKeys, menu, q };
}

describe('leave menu', () => {
  it('Leave game asks first, then sends leave and forgets the seat keys', () => {
    const h = setup();
    h.menu.update(lobby([{ seat: 0, name: 'Ann', color: 'jade' }]));
    h.q('[data-action=menu]')!.click();
    expect(h.q('[data-remove-seat]')).toBeNull(); // single seat: no list
    h.q('[data-action=leave]')!.click();
    expect(h.sent).toEqual([]);
    h.q('[data-action=confirmLeave]')!.click();
    expect(h.sent).toEqual([{ t: 'leave' }]);
    expect(h.seatKeys.load()).toEqual([]);
    expect(h.q('.sheet')).toBeNull();
  });

  it('Remove a player lists a shared phone’s seats and removes one', () => {
    const h = setup();
    h.menu.update(
      lobby([
        { seat: 0, name: 'Ann', color: 'jade' },
        { seat: 1, name: 'Kid', color: 'cobalt' },
      ]),
    );
    h.q('[data-action=menu]')!.click();
    h.q('[data-remove-seat="1"]')!.click();
    h.q('[data-action=confirmRemove]')!.click();
    expect(h.sent).toEqual([{ t: 'removeSeat', seat: 1 }]);
    expect(h.seatKeys.load()).toEqual([]);
  });

  it('is hidden with no seats, on the left screen and on the photographer’s shutter', () => {
    const h = setup();
    h.menu.update(lobby([]));
    expect(h.q('[data-action=menu]')).toBeNull();
    const seats = [{ seat: 0, name: 'Ann', color: 'jade' as const }];
    h.menu.update({ ...base, kind: 'shoot', role: 'photographer', seats } as unknown as Screen);
    expect(h.q('[data-action=menu]')).toBeNull();
    h.menu.update({ ...base, kind: 'shoot', role: 'dodger', seats } as unknown as Screen);
    expect(h.q('[data-action=menu]')).not.toBeNull();
    h.menu.update({ ...base, kind: 'left', seats } as unknown as Screen);
    expect(h.q('[data-action=menu]')).toBeNull();
  });
});
