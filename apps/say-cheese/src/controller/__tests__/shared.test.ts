// Shared devices on the phone (SPEC §6.3.1; SC7 acceptance): the pass screen and dodger copy listing
// every seat. The pre-lobby seat form is in prelobby.test.ts.
import { createLocalClient, type LocalClient } from '@pcg/controller-kit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { PhoneMsg, Screen, ScreenSeat } from '../../shared/messages';
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
const seat = (n: number, name: string): ScreenSeat => ({ seat: n, name, color: 'crimson' });
const withSeats = (s: Screen, seats: ScreenSeat[]): Screen => ({ ...s, seats });

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
