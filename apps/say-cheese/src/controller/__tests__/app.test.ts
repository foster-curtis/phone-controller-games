// Phone screens in jsdom (SPEC §6.7; SC3 acceptance): every Screen.kind renders, leader buttons,
// I'm ready unlocks audio, tag sheet behavior, Finish confirm, shutter over the DOM.
import { createLocalClient, type LocalClient } from '@pcg/controller-kit';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCREEN_KINDS, type PhoneMsg, type Screen } from '../../shared/messages';
import { noopSfx, type Sfx } from '../../shared/sfx';
import { createApp, type App } from '../app';
import { sampleScreens } from '../dev';
import { createFakeCamera } from '../fakeCamera';

let root: HTMLElement;
let client: LocalClient;
let app: App | null = null;
let clock = 0;

const memStorage = () => {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
};

function boot(sfx: Sfx = noopSfx) {
  root = document.createElement('div');
  document.body.append(root);
  client = createLocalClient();
  app = createApp({
    root,
    client,
    camera: createFakeCamera(),
    sfx,
    now: () => clock,
    storage: memStorage(),
    photoUrl: () => 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
    platform: { fullscreen: false, wakeLock: false, viewport: false },
  });
}
const show = (screen: Screen) => client.emit({ t: 'screen', screen });
const sent = () => client.sent as PhoneMsg[];
const q = <T extends Element = HTMLElement>(sel: string) => root.querySelector<T>(sel);
const click = (sel: string) => q(sel)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
const samples = sampleScreens();
const withLeader = (s: Screen, isLeader: boolean): Screen => ({ ...s, isLeader });

beforeEach(() => {
  clock = 0;
  boot();
});
afterEach(() => {
  app?.destroy();
  root.remove();
  vi.useRealTimers();
});

describe('screens', () => {
  it('starts on joining', () => expect(q('[data-screen=joining]')).not.toBeNull());

  it('renders [data-screen=<kind>] for every Screen.kind', () => {
    const seen = new Set<string>();
    for (const s of Object.values(samples)) {
      show(s);
      expect(q(`[data-screen=${s.kind}]`), s.kind).not.toBeNull();
      seen.add(s.kind);
    }
    for (const k of SCREEN_KINDS) expect(seen.has(k), k).toBe(true);
  });

  it('player-facing text avoids the banned word', () => {
    for (const s of Object.values(samples)) {
      show(s);
      expect(root.textContent?.toLowerCase()).not.toMatch(/\bh[i]de\b/);
    }
  });

  it('leader buttons only when isLeader', () => {
    for (const [sel, s] of [
      ['[data-action=start]', samples.lobby],
      ['[data-action=next]', samples.rules],
      ['[data-action=next]', samples.results],
      ['[data-action=rematch]', samples.matchEnd],
    ] as const) {
      show(withLeader(s!, true));
      expect(q(sel), `${s!.kind} leader`).not.toBeNull();
      show(withLeader(s!, false));
      expect(q(sel), `${s!.kind} not leader`).toBeNull();
    }
    show(withLeader(samples.rules!, false));
    expect(root.textContent).toContain('Watch the TV');
  });

  it('rules: Next becomes Let’s play! on the last card', () => {
    show({ ...samples.rules!, card: 4 } as Screen);
    expect(q('[data-action=next]')?.textContent).toBe("Let's play!");
    click('[data-action=next]');
    expect(sent().at(-1)).toEqual({ t: 'leader', action: 'next' });
  });

  it('I’m ready calls sfx.unlock and sends shootReady', () => {
    const unlock = vi.fn(() => Promise.resolve());
    app?.destroy();
    root.remove();
    boot({ ...noopSfx, unlock });
    show(samples['announce (photographer)']!);
    click('[data-action=ready]');
    expect(unlock).toHaveBeenCalledOnce();
    expect(sent().at(-1)).toEqual({ t: 'shootReady' });
  });

  it('joining sends the profile and remembers the name', () => {
    const input = q<HTMLInputElement>('input[name=name]')!;
    input.value = 'Zed';
    click('[data-action=join]');
    expect(sent().at(-1)).toEqual({ t: 'profile', seat: 0, name: 'Zed' });
    expect(app?.ctx.getName()).toBe('Zed');
  });

  it('lobby: Enable camera reports the result; denied shows the badge', async () => {
    show(samples.lobby!);
    click('[data-action=camera]');
    await Promise.resolve();
    await Promise.resolve();
    expect(sent().at(-1)).toEqual({ t: 'camera', ok: true });
    show({ ...samples.lobby!, camera: 'denied' } as Screen);
    expect(root.textContent).toContain('No camera');
  });

  it('shows overlays for kicked', () => {
    client.kick();
    expect(app?.ctx).toBeDefined();
    expect(root.querySelector('.overlay')).not.toBeNull();
  });
});

describe('review', () => {
  const review = samples['review (photographer)']!;
  const lastPhoto = (): Screen => ({ ...review, photo: 2 }) as Screen;

  it('tag sheet: tagged players disabled, Unknown present, no Remove on a new circle', () => {
    show(review);
    click('.stage');
    expect(q('[data-sheet]')).not.toBeNull();
    expect(q<HTMLButtonElement>('[data-player="k2#0"]')?.disabled).toBe(true);
    expect(q<HTMLButtonElement>('[data-player="k3#0"]')?.disabled).toBe(false);
    expect(q('[data-player=unknown]')).not.toBeNull();
    expect(q('[data-action=remove]')).toBeNull();
  });

  it('tapping a name sends a tag', () => {
    show(review);
    click('.stage');
    click('[data-player="k3#0"]');
    const m = sent().at(-1) as Extract<PhoneMsg, { t: 'tag' }>;
    expect(m).toMatchObject({ t: 'tag', photo: 0, playerId: 'k3#0' });
    expect(q('[data-sheet]')).toBeNull();
  });

  it('a new circle is discarded on an outside tap', () => {
    show(review);
    const before = sent().length;
    click('.stage');
    q('[data-sheet]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(q('[data-sheet]')).toBeNull();
    expect(q('.tag-ring--pending')).toBeNull();
    expect(sent().length).toBe(before);
  });

  it('an existing circle offers Remove', () => {
    show(review);
    click('[data-tag=t1]');
    expect(q('[data-action=remove]')).not.toBeNull();
    click('[data-action=remove]');
    expect(sent().at(-1)).toEqual({ t: 'untag', photo: 0, tagId: 't1' });
  });

  it('Finish needs a confirm', () => {
    show(lastPhoto());
    click('[data-action=finish]');
    expect(sent().some((m) => m.t === 'finishReview')).toBe(false);
    expect(root.textContent).toContain('Are you sure?');
    click('[data-action=confirmFinish]');
    expect(sent().at(-1)).toEqual({ t: 'finishReview' });
  });

  it('Next sends view', () => {
    show(review);
    click('[data-action=next]');
    expect(sent().at(-1)).toEqual({ t: 'view', photo: 1 });
  });

  it('dodgers see Watch the TV', () => {
    show(samples['review (dodger)']!);
    expect(root.textContent).toContain('Watch the TV');
    expect(q('.stage')).toBeNull();
  });
});

describe('shoot', () => {
  const shoot = samples['shoot (photographer)']!;
  const tapScreen = async (at: number) => {
    clock = at;
    q('[data-screen=shoot]')?.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await vi.advanceTimersByTimeAsync(0);
  };

  beforeEach(() => {
    vi.useFakeTimers();
    app?.ctx.camera.enable();
  });

  it('cooldown: taps 300 ms apart are one shot, 500 ms apart two', async () => {
    await app?.ctx.camera.enable();
    show(shoot);
    await tapScreen(1000);
    await tapScreen(1300);
    expect(sent().filter((m) => m.t === 'shot')).toHaveLength(1);
    await tapScreen(1800);
    expect(sent().filter((m) => m.t === 'shot')).toHaveLength(2);
    expect(
      sent()
        .filter((m) => m.t === 'shot')
        .map((m) => (m as { photo: number }).photo),
    ).toEqual([0, 1]);
  });

  it('caps at 15 shots and sends shootDone', async () => {
    await app?.ctx.camera.enable();
    show(shoot);
    for (let i = 1; i <= 18; i++) await tapScreen(i * 500);
    expect(sent().filter((m) => m.t === 'shot')).toHaveLength(15);
    expect(sent().filter((m) => m.t === 'shootDone')).toEqual([
      { t: 'shootDone', r: 1, count: 15 },
    ]);
  });

  it('no shot after the local deadline; shootDone fires at the deadline', async () => {
    await app?.ctx.camera.enable();
    show(shoot);
    await tapScreen(1000);
    clock = 20_000;
    await vi.advanceTimersByTimeAsync(20_100);
    await tapScreen(20_500);
    expect(sent().filter((m) => m.t === 'shot')).toHaveLength(1);
    expect(sent().filter((m) => m.t === 'shootDone')).toEqual([{ t: 'shootDone', r: 1, count: 1 }]);
  });
});

// SC5-fix-2: the photographer hears the 5 s scatter count with eyes closed (SPEC §6.2, §6.8).
describe('scatter beeps', () => {
  const runScatter = async (screen: Screen) => {
    app?.destroy();
    root.remove();
    const played: string[] = [];
    boot({ ...noopSfx, play: (n) => void played.push(n) });
    vi.useFakeTimers();
    show(screen);
    for (let t = 0; t <= 5000; t += 200) {
      clock = t;
      await vi.advanceTimersByTimeAsync(200);
    }
    return played;
  };

  it('the photographer phone beeps at 5, 4, 3, 2 and the final beep at 1', async () => {
    const played = await runScatter(samples['scatter (photographer)']!);
    expect(played).toEqual(['beep', 'beep', 'beep', 'beep', 'beepFinal']);
  });

  it('a dodger phone stays silent', async () => {
    expect(await runScatter(samples['scatter (dodger)']!)).toEqual([]);
  });
});
