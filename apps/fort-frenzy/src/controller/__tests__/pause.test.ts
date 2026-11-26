// Team pause on the phone (C4, FF14-fix-1; SPEC §10, §15.7): the top bar's pause button in a run, the
// paused card with Resume on every phone, and the intents they send.
import { createLocalClient } from '@pcg/controller-kit';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createApp, type App } from '../app';
import { SAMPLES } from '../samples';

let app: App | null = null;
let root: HTMLElement;
type Client = ReturnType<typeof createLocalClient>;

function mount(): Client {
  const client = createLocalClient();
  const map = new Map<string, string>();
  const store = {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
  };
  app = createApp({
    root,
    client,
    code: 'DEV1',
    storage: store,
    session: store,
    watchOrientation: false,
  });
  return client;
}

const emitSample = (client: Client, id: string, rev = 1) => {
  const s = SAMPLES[id]!();
  client.emit({ t: 'team', rev, team: s.team });
  client.emit({ t: 'me', rev, me: s.me });
};

const intents = (client: Client) =>
  client.sent
    .filter((m) => (m as { t?: string }).t === 'intent')
    .map((m) => (m as { intent: unknown }).intent);

const pauseBtn = () => root.querySelector<HTMLElement>('[data-pause]');
const layer = () => root.querySelector<HTMLElement>('.paused-layer')!;

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app')!;
});
afterEach(() => {
  app?.destroy();
  app = null;
});

describe('team pause on the phone (C4, FF14-fix-1)', () => {
  it('the top bar pause button shows in a run and sends a pause intent', () => {
    const client = mount();
    emitSample(client, 'combat');
    expect(pauseBtn()!.hidden).toBe(false);
    expect(layer().hidden).toBe(true);
    pauseBtn()!.click();
    expect(intents(client).at(-1)).toEqual({ k: 'pause', paused: true });
    emitSample(client, 'shop', 2);
    expect(pauseBtn()!.hidden).toBe(false);
    emitSample(client, 'dead', 3);
    expect(pauseBtn()!.hidden).toBe(false);
  });

  it('is not there in the lobby, while waiting or on the summary', () => {
    const client = mount();
    let rev = 0;
    for (const id of ['lobby', 'waiting', 'summary-victory']) {
      emitSample(client, id, ++rev);
      const btn = pauseBtn();
      expect(btn === null || btn.hidden, id).toBe(true);
    }
  });

  it('paused by anyone: the phone shows who and a Resume that sends the resume intent', () => {
    const client = mount();
    emitSample(client, 'combat', 1);
    emitSample(client, 'combat-paused', 2);
    expect(layer().hidden).toBe(false);
    expect(layer().textContent).toContain('Riley paused the run');
    expect(pauseBtn()!.hidden).toBe(true);
    root.querySelector<HTMLElement>('[data-resume]')!.click();
    expect(intents(client).at(-1)).toEqual({ k: 'pause', paused: false });
    // The host's next team clears it.
    emitSample(client, 'combat', 3);
    expect(layer().hidden).toBe(true);
    expect(pauseBtn()!.hidden).toBe(false);
  });

  it('the build phase shows the paused card too', () => {
    const client = mount();
    emitSample(client, 'build-paused');
    expect(layer().hidden).toBe(false);
    expect(layer().textContent).toContain('paused the run');
  });
});

describe('pause menu: Leave game and End game (RD6-fix-1)', () => {
  const q = (sel: string) => root.querySelector<HTMLButtonElement>(sel)!;
  const shown = (sel: string) => {
    const n = root.querySelector<HTMLElement>(sel);
    return n !== null && !n.hidden && n.closest('[hidden]') === null;
  };

  it('Leave game needs the confirm step: one tap sends nothing, Confirm sends one leave', () => {
    const client = mount();
    emitSample(client, 'combat-paused');
    const before = intents(client).length;
    expect(shown('[data-leave]')).toBe(true);
    q('[data-leave]').click();
    expect(intents(client)).toHaveLength(before);
    expect(shown('[data-pause-confirm]')).toBe(true);
    expect(layer().textContent).toContain('Leave the game?');
    q('[data-pause-confirm]').click();
    q('[data-pause-confirm]').click(); // a double tap still sends one
    expect(intents(client).slice(before)).toEqual([{ k: 'leave' }]);
  });

  it('Cancel sends nothing and goes back to the menu', () => {
    const client = mount();
    emitSample(client, 'combat-paused');
    const before = intents(client).length;
    q('[data-leave]').click();
    q('[data-pause-cancel]').click();
    expect(shown('[data-pause-confirm]')).toBe(false);
    expect(shown('[data-resume]')).toBe(true);
    q('[data-end-game]').click();
    expect(layer().textContent).toContain('End the game for everyone?');
    q('[data-pause-cancel]').click();
    expect(intents(client)).toHaveLength(before);
  });

  it('End game (leader) needs the confirm step and sends one endGame', () => {
    const client = mount();
    emitSample(client, 'build-paused');
    const before = intents(client).length;
    q('[data-end-game]').click();
    expect(intents(client)).toHaveLength(before);
    q('[data-pause-confirm]').click();
    expect(intents(client).slice(before)).toEqual([{ k: 'leader', action: 'endGame' }]);
  });

  it('End game is hidden for non-leaders; Leave game is not', () => {
    const client = mount();
    emitSample(client, 'paused-member');
    expect(shown('[data-leave]')).toBe(true);
    expect(shown('[data-end-game]')).toBe(false);
  });

  it('after a confirmed leave, the host`s kick returns the phone to the join screen', () => {
    const client = mount();
    emitSample(client, 'combat-paused');
    q('[data-leave]').click();
    q('[data-pause-confirm]').click();
    const sent = client.sent.find(
      (m) => (m as { intent?: { k: string } }).intent?.k === 'leave',
    ) as { seq: number };
    client.emit({ t: 'ack', seq: sent.seq, ok: true });
    client.kick();
    expect(app!.group()).toBe('join');
    expect(root.querySelector('input[aria-label="Room code"]')).not.toBeNull();
    expect(root.textContent).toContain('You left the game');
  });
});
