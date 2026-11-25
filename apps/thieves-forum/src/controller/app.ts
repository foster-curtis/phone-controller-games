// Phone app (SPEC §3, §6.18; PLATFORM §3): the controller-kit app shell (Wake Lock, manual full-screen
// button, reconnecting / host-away / kicked / room-closed overlays, landscape with the rotate overlay,
// `?debug=1` diagnostics) plus two setup-shell screens: join (room code + name) and "Connected, watch
// the TV". The client is injected: main.ts passes the relay client, dev mode and tests a fake.
// Never imports host code (lint).
import {
  createAppShell,
  defaultStorage,
  readStored,
  writeStored,
  type ShellClient,
} from '@pcg/controller-kit';
import { title } from '../../game.meta';
import { cleanName, GAME_ID, isHostMsg, NAME_MAX, type PhoneMsg } from '../shared/messages';
import { GAME_VERSION } from '../shared/version';

const OVERLAYS = ['reconnecting', 'hostAway', 'rotate', 'kicked', 'closed'] as const;
type AppOverlay = 'kicked' | 'closed';

export const NAME_KEY = 'thieves-forum:name';
/** Set when Join had to reload the page under a new `?code=`: join again on arrival. */
export const AUTOJOIN_KEY = 'thieves-forum:autojoin';

const TEXT = {
  reconnecting: { title: 'Reconnecting…', body: 'Hang on, finding the game again.' },
  hostAway: { title: 'TV is away', body: 'Waiting for the TV to come back.' },
  rotate: { title: 'Turn your phone sideways', body: `${title} plays in landscape.` },
  kicked: { title: 'You were removed', body: 'Ask the group leader if you want back in.' },
  closed: { title: 'Game closed', body: 'This room is gone. Scan the TV for a new code.' },
};

export interface AppOptions {
  root: HTMLElement;
  client: ShellClient;
  /** The room this page's client is joined to (`?code=`), or null. */
  code: string | null;
  /** Join with a different code: main.ts reloads under `?code=`. */
  goToRoom?: (code: string) => void;
  storage?: Parameters<typeof readStored>[1];
  session?: Parameters<typeof readStored>[1];
  platform?: Parameters<typeof createAppShell>[0]['platform'];
}

export interface App {
  screen(): 'join' | 'connected';
  destroy(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function sessionStore(): Storage | undefined {
  try {
    return globalThis.sessionStorage;
  } catch {
    return undefined; // blocked: no auto-join after the reload, the player taps Join again
  }
}

export function createApp(opts: AppOptions): App {
  const { client } = opts;
  const storage = opts.storage ?? defaultStorage();
  const session = opts.session ?? sessionStore();
  const shell = createAppShell<AppOverlay>({
    root: opts.root,
    client,
    overlays: OVERLAYS,
    text: TEXT,
    game: GAME_ID,
    version: GAME_VERSION,
    // Landscape game (SPEC §3): the kit's landscape lock and rotate overlay stay on. The corner
    // full-screen button sits top-left, clear of the right-hand action buttons to come.
    platform: { fullscreenCorner: 'top-left', ...opts.platform },
  });

  let current: 'join' | 'connected' = 'join';
  /** The name sent to the host; re-sent after every reconnect. */
  let joinedAs: string | null = null;

  const send = (msg: PhoneMsg) => client.send(msg);

  function showJoin(error = ''): void {
    current = 'join';
    const form = el('form', { class: 'screen join', 'data-screen': 'join', novalidate: '' });
    const code = el('input', {
      name: 'code',
      class: 'code',
      autocomplete: 'off',
      autocapitalize: 'characters',
      maxlength: '4',
      placeholder: 'CODE',
      'aria-label': 'Room code',
    });
    code.value = opts.code ?? '';
    const name = el('input', {
      name: 'name',
      class: 'label',
      autocomplete: 'nickname',
      maxlength: String(NAME_MAX),
      placeholder: 'Your name',
      'aria-label': 'Your name',
    });
    name.value = readStored(NAME_KEY, storage) ?? '';
    const err = el('p', { class: 'caption join-error', role: 'alert' }, error);
    const button = el(
      'button',
      { type: 'submit', class: 'primary button coin-edge', 'data-action': 'join' },
      'Join',
    );
    form.append(el('h1', { class: 'banner' }, title), code, name, err, button);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const room = code.value.trim().toUpperCase();
      const n = cleanName(name.value);
      if (!/^[A-Z]{4}$/.test(room))
        return void (err.textContent = 'Enter the 4-letter code on the TV.');
      if (!n) return void (err.textContent = 'Enter your name.');
      writeStored(NAME_KEY, n, storage);
      if (room !== opts.code) {
        writeStored(AUTOJOIN_KEY, room, session);
        opts.goToRoom?.(room);
        return;
      }
      joinedAs = n;
      button.disabled = true;
      button.textContent = 'Joining…';
      if (client.status === 'open') send({ t: 'join', name: n });
    });
    shell.screenHost.replaceChildren(form);
    if (opts.code && readStored(AUTOJOIN_KEY, session) === opts.code && name.value) {
      writeStored(AUTOJOIN_KEY, '', session);
      form.requestSubmit();
    }
  }

  function showConnected(name: string): void {
    current = 'connected';
    const box = el('section', { class: 'screen connected', 'data-screen': 'connected' });
    box.append(
      el('p', { class: 'name-phone' }, name),
      el('h1', { class: 'banner' }, 'Connected'),
      el('p', { class: 'body' }, 'Watch the TV.'),
    );
    shell.screenHost.replaceChildren(box);
  }

  const offs = [
    client.onMessage((d) => {
      if (isHostMsg(d) && d.t === 'joined') showConnected(d.name);
    }),
    client.onStatus((s) => {
      if (s === 'open' && joinedAs) send({ t: 'join', name: joinedAs });
    }),
    client.onKicked(() => shell.setOverlay('kicked', true)),
    client.onError((e) => {
      if (e.code === 'room-closed' || e.code === 'no-room') shell.setOverlay('closed', true);
    }),
  ];

  showJoin();

  return {
    screen: () => current,
    destroy() {
      for (const off of offs) off();
      shell.destroy();
    },
  };
}
