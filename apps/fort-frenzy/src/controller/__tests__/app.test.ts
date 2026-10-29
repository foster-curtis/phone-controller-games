import { createLocalClient } from '@pcg/controller-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROTOCOL_VERSION, isHostMsg, isMeView, isTeamView } from '../../shared/messages';
import { DEVICE_ID_KEY, createApp, type App } from '../app';
import { SAMPLES } from '../samples';

let app: App | null = null;
let root: HTMLElement;

function mount(extra: Partial<Parameters<typeof createApp>[0]> = {}) {
  const client = createLocalClient();
  const storage = new Map<string, string>();
  const store = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
  };
  app = createApp({
    root,
    client,
    code: 'DEV1',
    storage: store,
    session: {
      ...store,
      getItem: (k) => sessionMap.get(k) ?? null,
      setItem: (k, v) => void sessionMap.set(k, v),
    },
    watchOrientation: false,
    ...extra,
  });
  return { client, store };
}
const sessionMap = new Map<string, string>();

const emitSample = (client: ReturnType<typeof createLocalClient>, id: string, rev = 1) => {
  const s = SAMPLES[id]!();
  client.emit({ t: 'team', rev, team: s.team });
  client.emit({ t: 'me', rev, me: s.me });
  return s;
};

beforeEach(() => {
  document.body.innerHTML = '<div id="app"></div>';
  root = document.getElementById('app')!;
  sessionMap.clear();
});
afterEach(() => {
  app?.destroy();
  app = null;
});

describe('samples', () => {
  it('every sample passes the wire guards', () => {
    for (const [id, make] of Object.entries(SAMPLES)) {
      const s = make();
      expect(isTeamView(s.team), id).toBe(true);
      expect(isMeView(s.me), id).toBe(true);
      expect(isHostMsg({ t: 'me', rev: 1, me: s.me }), id).toBe(true);
    }
  });

  it('every sample renders its screen without throwing', () => {
    const { client } = mount();
    let rev = 0;
    for (const id of Object.keys(SAMPLES)) {
      emitSample(client, id, ++rev);
      expect(root.querySelector('.screen'), id).not.toBeNull();
      const s = SAMPLES[id]!();
      s.after?.(root);
    }
  });
});

describe('screens follow me.screen', () => {
  it('shows join until the first me, then the host screen', () => {
    const { client } = mount();
    expect(app!.group()).toBe('join');
    emitSample(client, 'lobby');
    expect(app!.group()).toBe('lobby');
    expect(root.querySelector('.lineup-row')).not.toBeNull();
  });

  it('shares one view across combat and dead (updated in place), and rebuilds across groups', () => {
    const { client } = mount();
    emitSample(client, 'combat', 1);
    const view = root.querySelector('.combat');
    emitSample(client, 'dead', 2);
    expect(root.querySelector('.combat')).toBe(view);
    expect(root.querySelector('.combat')!.classList.contains('is-dead')).toBe(true);
    emitSample(client, 'build', 3);
    expect(root.querySelector('.combat')).toBeNull();
    expect(root.querySelector('.build')).not.toBeNull();
  });

  it('drops a stale me snapshot', () => {
    const { client } = mount();
    emitSample(client, 'combat', 5);
    client.emit({ t: 'me', rev: 4, me: SAMPLES['lobby']!().me });
    expect(app!.group()).toBe('combat');
  });

  it('shows the Build kit tiles with costs, or "No buildings to build"', () => {
    const { client } = mount();
    emitSample(client, 'build', 1);
    expect(root.querySelectorAll('.kit-tile')).toHaveLength(2);
    expect(root.querySelector('.kit-cost')?.textContent).toBe('2 CELLS');
    emitSample(client, 'build-none', 2);
    expect(root.querySelector('.no-kit')!.hasAttribute('hidden')).toBe(false);
    expect(root.querySelector('.kit-tiles')!.hasAttribute('hidden')).toBe(true);
  });

  it('shop tab: coins, card with rarity and mark, rows, QM-only hidden for others', () => {
    const { client } = mount();
    emitSample(client, 'shop', 1).after?.(root);
    expect(root.querySelector('.coins')!.textContent).toBe('1,240');
    expect(root.querySelectorAll('.upgrade-card')).toHaveLength(3);
    expect(root.querySelectorAll('.upgrade-card.rare')).toHaveLength(2);
    expect(root.querySelector('[data-item="base_armor"]')).toBeNull();
    expect(root.querySelector('[data-item="repair"]')).not.toBeNull();
    expect(root.querySelector('[data-item="spiked_walls"] .shop-req')!.textContent).toContain(
      'Maya',
    );
    emitSample(client, 'build-none', 2);
    expect(root.querySelector('[data-item="base_armor"]')).not.toBeNull();
  });

  it('claim lists free slots and sends a claim intent', () => {
    const { client } = mount();
    emitSample(client, 'claim');
    const sent = client.sent.length;
    root.querySelector<HTMLElement>('[data-slot="2"]')!.click();
    expect(client.sent[sent]).toMatchObject({ t: 'intent', intent: { k: 'claim', slot: 2 } });
  });

  it('summary: only the leader gets the three end options', () => {
    const { client } = mount();
    emitSample(client, 'summary-victory', 1);
    expect(root.querySelectorAll('[data-option]')).toHaveLength(3);
    expect(root.querySelector('.summary-options')!.hasAttribute('hidden')).toBe(false);
    emitSample(client, 'summary-defeat', 2);
    expect(root.querySelector('.summary-options')!.hasAttribute('hidden')).toBe(true);
    expect(root.querySelector('.summary-banner')!.textContent).toBe('DEFEAT');
  });

  it('lobby: leader sees difficulty and Start (disabled under 2 ready); members do not', () => {
    const { client } = mount();
    emitSample(client, 'lobby', 1);
    expect(root.querySelector('.leader-box')!.hasAttribute('hidden')).toBe(false);
    expect(root.querySelectorAll('.lineup-remove').length).toBeGreaterThan(0);
    emitSample(client, 'lobby-member', 2);
    expect(root.querySelector('.leader-box')!.hasAttribute('hidden')).toBe(true);
    expect(root.querySelectorAll('.lineup-remove')).toHaveLength(0);
  });
});

describe('client wiring', () => {
  it('says hello with the protocol version and a persistent device id on open', () => {
    const { client, store } = mount();
    client.setStatus('open');
    const hello = client.sent.find((m) => (m as { t?: string }).t === 'hello') as {
      proto: number;
      deviceId: string;
    };
    expect(hello.proto).toBe(PROTOCOL_VERSION);
    expect(hello.deviceId.length).toBeGreaterThan(0);
    expect(store.getItem(DEVICE_ID_KEY)).toBe(hello.deviceId);
    // not repeated until the connection drops and reopens
    client.setStatus('open');
    expect(client.sent.filter((m) => (m as { t?: string }).t === 'hello')).toHaveLength(1);
    client.setStatus('reconnecting');
    client.setStatus('open');
    expect(client.sent.filter((m) => (m as { t?: string }).t === 'hello')).toHaveLength(2);
  });

  it('sends intents with seq and toasts a refusal ack', () => {
    const { client } = mount();
    emitSample(client, 'lobby');
    root.querySelector<HTMLElement>('.ready')!.click();
    const intent = client.sent.at(-1) as { seq: number; intent: unknown };
    expect(intent).toMatchObject({ t: 'intent', intent: { k: 'ready', ready: true } });
    client.emit({ t: 'ack', seq: intent.seq, ok: false, reason: 'notLeader' });
    const toast = root.querySelector('.toast') as HTMLElement;
    expect(toast.hidden).toBe(false);
    expect(toast.textContent).toBe('Only the party leader can do that');
  });

  it('reloads once on `outdated` from a newer host, then shows "Refresh the TV" never', () => {
    const reload = vi.fn();
    const { client } = mount({ reload });
    client.emit({ t: 'outdated', proto: PROTOCOL_VERSION + 1 });
    client.emit({ t: 'outdated', proto: PROTOCOL_VERSION + 1 });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('an older host shows the "Refresh the TV" overlay', () => {
    const { client } = mount();
    client.emit({ t: 'outdated', proto: PROTOCOL_VERSION - 1 });
    expect(app!.overlays()).toContain('refreshTv');
    expect(root.querySelector('.overlay')!.textContent).toContain('Refresh the TV');
  });

  it('streams input tuples only in combat and build', () => {
    const { client } = mount();
    emitSample(client, 'lobby', 1);
    expect(app!.sender.running).toBe(false);
    emitSample(client, 'combat', 2);
    expect(app!.sender.running).toBe(true);
    emitSample(client, 'summary-victory', 3);
    expect(app!.sender.running).toBe(false);
  });

  it('shows reconnecting and host-away overlays from the client', () => {
    const { client } = mount();
    client.setStatus('reconnecting');
    expect(app!.overlays()).toContain('reconnecting');
    client.setHostStatus('away');
    expect(app!.overlays()).toContain('hostAway');
  });
});
