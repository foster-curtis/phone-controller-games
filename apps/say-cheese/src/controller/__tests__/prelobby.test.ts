// Pre-lobby "who's playing on this phone" screen and the lobby pencil (SPEC §6.3.1, §6.7; SC7-fix-1):
// add/remove rows, the 8-seat cap, Join sends profile then addSeat (nothing before), the seat-key
// store, and the pencil's return to the form with diffs on re-Join.
import { createLocalClient, type LocalClient } from '@pcg/controller-kit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PhoneMsg, Screen } from '../../shared/messages';
import { createSeatKeyStore } from '../../shared/seats';
import { createApp, type App } from '../app';
import { sampleScreens } from '../dev';
import { createFakeCamera } from '../fakeCamera';

let root: HTMLElement;
let client: LocalClient;
let app: App;
const samples = sampleScreens();

const boot = () =>
  createApp({
    root,
    client,
    camera: createFakeCamera(),
    photoUrl: () => null,
    platform: { fullscreen: false, wakeLock: false, viewport: false },
  });

beforeEach(() => {
  localStorage.clear();
  root = document.createElement('div');
  document.body.append(root);
  client = createLocalClient();
  app = boot();
});
afterEach(() => {
  app.destroy();
  root.remove();
});

const show = (screen: Screen) => client.emit({ t: 'screen', screen });
const sent = () => client.sent as PhoneMsg[];
const q = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel);
const qa = <T extends Element = HTMLElement>(sel: string) =>
  Array.from(root.querySelectorAll<T>(sel));
const click = (sel: string) => q(sel)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const colors = ['crimson', 'cobalt', 'jade', 'berry', 'amber', 'violet', 'teal', 'coral'] as const;

/** A lobby screen for this phone's `names`, with `others` seats held by other phones. */
const lobby = (names: string[], others = 0): Screen => {
  const seats = names.map((n, i) => ({ seat: i, name: n, color: colors[i]! }));
  const player = (name: string, color: (typeof colors)[number], phoneId: string, i: number) => ({
    playerId: `${phoneId}#${i}`,
    name,
    color,
    phoneId,
    ready: false,
    camera: 'ok' as const,
    connected: true,
  });
  const mine = seats.map((s, i) => player(s.name, s.color, 'me', i));
  const rest = Array.from({ length: others }, (_, i) =>
    player(`Other${i}`, colors[(names.length + i) % colors.length]!, `o${i}`, 0),
  );
  return { ...samples.lobby!, seats, players: [...mine, ...rest] } as Screen;
};
const type = (input: HTMLInputElement, value: string) => {
  input.value = value;
};
const rows = () => qa<HTMLInputElement>('.seat-row input');
const store = () => createSeatKeyStore(localStorage, 'local');

describe('pre-lobby screen', () => {
  it('starts on joining with the name prefilled from localStorage and sends nothing', () => {
    app.destroy();
    root.replaceChildren();
    localStorage.setItem('say-cheese:name', 'Zed');
    app = boot();
    expect(q('[data-screen=joining]')).not.toBeNull();
    expect(q<HTMLInputElement>('input[name=name]')?.value).toBe('Zed');
    expect(q('details.share-hint summary')?.textContent).toBe('Why share a phone?');
    expect(q('details.share-hint')?.textContent).toContain('No phone? No problem.');
    expect(sent()).toEqual([]);
  });

  it('adds and removes rows without sending anything', () => {
    click('[data-action=addSeat]');
    click('[data-action=addSeat]');
    expect(rows()).toHaveLength(3);
    click('.seat-row [data-action=removeRow]');
    expect(rows()).toHaveLength(2);
    expect(sent()).toEqual([]);
  });

  it('caps the rows at the 8-seat room', () => {
    for (let i = 0; i < 7; i++) click('[data-action=addSeat]');
    expect(rows()).toHaveLength(8);
    expect(q<HTMLButtonElement>('[data-action=addSeat]')?.disabled).toBe(true);
    click('.seat-row [data-action=removeRow]');
    expect(q<HTMLButtonElement>('[data-action=addSeat]')?.disabled).toBe(false);
  });

  it('counts seats other phones hold against the cap', () => {
    show(lobby([], 5));
    expect(q('[data-screen=joining]')).not.toBeNull();
    click('[data-action=addSeat]');
    click('[data-action=addSeat]');
    expect(rows()).toHaveLength(3);
    expect(q<HTMLButtonElement>('[data-action=addSeat]')?.disabled).toBe(true);
  });

  it('Join needs a name; then sends profile and addSeat in order, skipping blank rows', () => {
    click('[data-action=addSeat]');
    click('[data-action=addSeat]');
    click('[data-action=addSeat]');
    click('[data-action=join]');
    expect(sent()).toEqual([]);
    const [me, a, blank, b] = rows();
    type(me!, ' Ana ');
    type(a!, 'Leo');
    type(blank!, '  ');
    type(b!, 'Mia');
    click('[data-action=join]');
    const msgs = sent();
    expect(msgs.map((m) => m.t)).toEqual(['profile', 'addSeat', 'addSeat']);
    expect(msgs[0]).toEqual({ t: 'profile', seat: 0, name: 'Ana' });
    expect(msgs[1]).toMatchObject({ t: 'addSeat', name: 'Leo' });
    expect(msgs[2]).toMatchObject({ t: 'addSeat', name: 'Mia' });
    expect(app.ctx.getName()).toBe('Ana');
    // Stays on the form until the host seats us; keys are saved when the host lists the seats.
    expect(q('[data-screen=joining]')).not.toBeNull();
    expect(store().load()).toEqual([]);
    show(lobby(['Ana', 'Leo', 'Mia']));
    expect(q('[data-screen=lobby]')).not.toBeNull();
    const keys = msgs.flatMap((m) => (m.t === 'addSeat' ? [m.seatKey] : []));
    expect(store().load()).toEqual([
      { seat: 1, seatKey: keys[0], name: 'Leo' },
      { seat: 2, seatKey: keys[1], name: 'Mia' },
    ]);
  });
});

describe('lobby pencil', () => {
  const joinAs = (names: string[]) => {
    for (let i = 1; i < names.length; i++) click('[data-action=addSeat]');
    rows().forEach((r, i) => type(r, names[i]!));
    click('[data-action=join]');
    show(lobby(names));
    client.sent.length = 0;
  };

  it('shows the names once at the top with a pencil, no name field or add panel', () => {
    joinAs(['Ana', 'Leo']);
    expect(qa('.me .chip').map((c) => c.textContent)).toEqual(['Ana', 'Leo']);
    expect(q('[data-action=editPlayers]')?.textContent).toBe('✏️');
    expect(qa('.players .chip')).toEqual([]);
    expect(q('input')).toBeNull();
    expect(q('[data-screen=lobby] [data-action=addSeat]')).toBeNull();
    expect(q('[data-action=camera]')).not.toBeNull();
    expect(q('[data-action=ready]')).not.toBeNull();
    expect(q('[data-action=start]')).not.toBeNull();
  });

  it('pencil returns to the pre-lobby screen prefilled with the current seats', () => {
    joinAs(['Ana', 'Leo']);
    click('[data-action=editPlayers]');
    expect(q('[data-screen=joining]')).not.toBeNull();
    expect(rows().map((r) => r.value)).toEqual(['Ana', 'Leo']);
    // Host updates don't kick us back to the lobby while editing.
    show(lobby(['Ana', 'Leo']));
    expect(q('[data-screen=joining]')).not.toBeNull();
    expect(sent()).toEqual([]);
  });

  it('re-Join sends only the diffs: rename, add, remove', () => {
    store().add({ seat: 1, seatKey: 'k1', name: 'Leo' });
    store().add({ seat: 2, seatKey: 'k2', name: 'Mia' });
    joinAs(['Ana', 'Leo', 'Mia']);
    click('[data-action=editPlayers]');
    type(rows()[0]!, 'Anna'); // rename seat 0
    click('.seat-row:nth-child(2) [data-action=removeRow]'); // remove Leo (seat 1)
    type(rows()[1]!, 'Mimi'); // rename seat 2
    click('[data-action=addSeat]');
    type(rows()[2]!, 'Zoe'); // new
    click('[data-action=join]');
    const msgs = sent();
    expect(msgs[0]).toEqual({ t: 'removeSeat', seat: 1 });
    expect(msgs).toContainEqual({ t: 'profile', seat: 0, name: 'Anna' });
    expect(msgs).toContainEqual({ t: 'profile', seat: 2, name: 'Mimi' });
    expect(msgs.filter((m) => m.t === 'addSeat')).toEqual([
      { t: 'addSeat', name: 'Zoe', seatKey: expect.any(String) },
    ]);
    expect(msgs).toHaveLength(4);
    expect(q('[data-screen=lobby]')).not.toBeNull();
    expect(store().load()).toEqual([{ seat: 2, seatKey: 'k2', name: 'Mimi' }]);
  });

  it('re-Join with no changes sends nothing', () => {
    joinAs(['Ana']);
    click('[data-action=editPlayers]');
    click('[data-action=join]');
    expect(sent()).toEqual([]);
    expect(q('[data-screen=lobby]')).not.toBeNull();
  });

  it('has no pencil once the match is running', () => {
    joinAs(['Ana']);
    show(samples.rules!);
    expect(q('[data-action=editPlayers]')).toBeNull();
  });
});
