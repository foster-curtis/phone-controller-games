// Shared devices on the phone (SPEC §6.3.1; SC7 acceptance): add/remove seat messages and the seat-key
// store, Add disabled at the cap, the pass screen, dodger copy listing every seat.
import { createLocalClient, type LocalClient } from '@pcg/controller-kit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PhoneMsg, Screen, ScreenSeat } from '../../shared/messages';
import { createSeatKeyStore } from '../../shared/seats';
import { createApp, type App } from '../app';
import { sampleScreens } from '../dev';
import { createFakeCamera } from '../fakeCamera';

let root: HTMLElement;
let client: LocalClient;
let app: App;
const samples = sampleScreens();

beforeEach(() => {
  localStorage.clear();
  root = document.createElement('div');
  document.body.append(root);
  client = createLocalClient();
  app = createApp({
    root,
    client,
    camera: createFakeCamera(),
    photoUrl: () => null,
    platform: { fullscreen: false, wakeLock: false, viewport: false },
  });
});
afterEach(() => {
  app.destroy();
  root.remove();
});

const show = (screen: Screen) => client.emit({ t: 'screen', screen });
const sent = () => client.sent as PhoneMsg[];
const q = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel);
const click = (sel: string) => q(sel)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const seat = (n: number, name: string): ScreenSeat => ({ seat: n, name, color: 'crimson' });
const withSeats = (s: Screen, seats: ScreenSeat[]): Screen => ({ ...s, seats });
const lobby = (seats: ScreenSeat[], canAddSeat = true): Screen =>
  ({ ...withSeats(samples.lobby!, seats), canAddSeat }) as Screen;
const store = () => createSeatKeyStore(localStorage, 'local');

describe('players on this phone', () => {
  it('Add sends addSeat with a fresh key and saves it once the host lists the seat', () => {
    show(lobby([seat(0, 'Ana')]));
    click('[data-action=addSeat]');
    const input = q<HTMLInputElement>('input[name=seatName]')!;
    input.value = 'Leo';
    click('[data-action=confirmSeat]');
    const add = sent().find((m) => m.t === 'addSeat');
    expect(add).toMatchObject({ t: 'addSeat', name: 'Leo' });
    const key = add && add.t === 'addSeat' ? add.seatKey : '';
    expect(key.length).toBeGreaterThan(0);
    expect(store().load()).toEqual([]);

    show(lobby([seat(0, 'Ana'), seat(1, 'Leo')]));
    expect(store().load()).toEqual([{ seat: 1, seatKey: key, name: 'Leo' }]);
    expect(q('[data-seat="1"]')?.textContent).toContain('Leo');
  });

  it('✕ sends removeSeat and drops the key', () => {
    store().add({ seat: 1, seatKey: 'k1', name: 'Leo' });
    show(lobby([seat(0, 'Ana'), seat(1, 'Leo')]));
    click('[data-seat="1"] [data-action=removeSeat]');
    expect(sent()).toContainEqual({ t: 'removeSeat', seat: 1 });
    expect(store().load()).toEqual([]);
    expect(q('[data-seat="0"] [data-action=removeSeat]')).toBeNull();
  });

  it('Add is disabled when the room is full, and the hint is collapsible copy', () => {
    show(lobby([seat(0, 'Ana')], false));
    expect(q<HTMLButtonElement>('[data-action=addSeat]')?.disabled).toBe(true);
    expect(q('details.share-hint summary')?.textContent).toBe('Why share a phone?');
    expect(q('details.share-hint')?.textContent).toContain('No phone? No problem.');
    show(lobby([seat(0, 'Ana')], true));
    expect(q<HTMLButtonElement>('[data-action=addSeat]')?.disabled).toBe(false);
  });

  it('keeps the half-typed name through lobby updates', () => {
    show(lobby([seat(0, 'Ana')]));
    click('[data-action=addSeat]');
    const input = q<HTMLInputElement>('input[name=seatName]')!;
    input.value = 'Le';
    show(lobby([seat(0, 'Ana')]));
    expect(q<HTMLInputElement>('input[name=seatName]')).toBe(input);
    expect(input.value).toBe('Le');
  });
});

describe('pass screen', () => {
  it("shows the name and I'm {name} sends seatConfirm", () => {
    show(withSeats(samples.pass!, [seat(0, 'Ana'), seat(1, 'Bo')]));
    expect(q('[data-screen=pass]')?.textContent).toContain('Pass the phone to Bo');
    const btn = q<HTMLButtonElement>('[data-action=imSeat]')!;
    expect(btn.textContent).toBe("I'm Bo");
    btn.click();
    expect(sent()).toContainEqual({ t: 'seatConfirm', seat: 1 });
  });
});

describe('dodger screens on a shared phone', () => {
  const three = [seat(0, 'Ana'), seat(1, 'Leo'), seat(2, 'Mia')];
  it('list every seat; a single seat keeps the plain copy', () => {
    show(withSeats(samples['scatter (dodger)']!, three));
    expect(q('h1')?.textContent).toBe('Ana, Leo, Mia: scatter!');
    show(withSeats(samples['shoot (dodger)']!, three));
    expect(q('h1')?.textContent).toBe('Ana, Leo, Mia: scatter!');
    show(withSeats(samples['announce (dodger)']!, three));
    expect(q('h1')?.textContent).toBe('Ana, Leo, Mia: get ready to dodge!');
    show(withSeats(samples['scatter (dodger)']!, [seat(0, 'Ana')]));
    expect(q('h1')?.textContent).toBe('Scatter!');
  });
});
