// Phone app (SPEC §6.7, PLATFORM §3): the controller-kit app shell (Wake Lock, fullscreen on tap,
// overlays for reconnecting / host away / kicked / room closed, portrait) plus a router keyed by
// `Screen.kind`. Client, camera and sfx are injected: SC5 passes the real ones, dev mode and tests
// fakes. Never imports host code (lint).
import {
  createAppShell,
  createScreenRouter,
  defaultStorage,
  readStored,
  writeStored,
  type ShellClient,
} from '@pcg/controller-kit';
import { title } from '../../game.meta';
import { isHostMsg, type HostMsg, type PhoneMsg, type Screen } from '../shared/messages';
import { noopSfx, type Sfx } from '../shared/sfx';
import type { Camera, CapturedPhoto } from './camera/types';
import { DEFAULT_COOLDOWN_MS, type Ctx } from './ctx';
import { createView, groupOf } from './screens';

const OVERLAYS = ['reconnecting', 'hostAway', 'rotate', 'kicked', 'closed'] as const;
type AppOverlay = 'kicked' | 'closed';

const NAME_KEY = 'say-cheese:name';

const TEXT = {
  reconnecting: { title: 'Reconnecting…', body: 'Hang on, finding the game again.' },
  hostAway: { title: 'TV is away', body: 'Waiting for the TV to come back.' },
  rotate: { title: 'Rotate your phone', body: `${title} plays upright.` },
  kicked: { title: 'You were removed', body: 'Ask the group leader if you want back in.' },
  closed: { title: 'Game closed', body: 'This room is gone. Scan the TV for a new code.' },
};

export interface AppOptions {
  root: HTMLElement;
  client: ShellClient;
  camera: Camera;
  sfx?: Sfx;
  /** Local object URL of a photo this phone took, or null. */
  photoUrl?: (r: number, photo: number) => string | null;
  /** SC5: every captured shot. */
  onCapture?: (r: number, photo: number, captured: CapturedPhoto) => void;
  /** SC5: host messages other than `screen` (e.g. `photoAck`). */
  onHostMsg?: (msg: HostMsg) => void;
  now?: () => number;
  storage?: Parameters<typeof readStored>[1];
  /** Shell platform switches (tests turn the browser-only ones off). */
  platform?: Parameters<typeof createAppShell>[0]['platform'];
}

export interface App {
  readonly ctx: Ctx;
  /** Shows a host screen directly (dev mode and tests). */
  show(screen: Screen): void;
  setOverlay(name: AppOverlay, on: boolean): void;
  destroy(): void;
}

/** The screen shown before the host sends anything. */
export const JOINING: Screen = {
  kind: 'joining',
  leaderName: null,
  isLeader: false,
  seats: [],
  canEmoji: false,
};

export function createApp(opts: AppOptions): App {
  const { client } = opts;
  const storage = opts.storage ?? defaultStorage();
  const shell = createAppShell<AppOverlay>({
    root: opts.root,
    client,
    overlays: OVERLAYS,
    text: TEXT,
    platform: { landscape: false, rotate: false, ...opts.platform },
  });

  const ctx: Ctx = {
    send: (msg: PhoneMsg) => client.send(msg),
    camera: opts.camera,
    sfx: opts.sfx ?? noopSfx,
    photoUrl: opts.photoUrl ?? (() => null),
    now: opts.now ?? (() => performance.now()),
    getName: () => readStored(NAME_KEY, storage) ?? '',
    setName: (n) => writeStored(NAME_KEY, n, storage),
    cooldownMs: DEFAULT_COOLDOWN_MS,
    ...(opts.onCapture ? { onCapture: opts.onCapture } : {}),
  };

  const router = createScreenRouter<Screen, string>({
    host: shell.screenHost,
    groupOf,
    create: (s) => createView(s, ctx),
  });
  router.show(JOINING);

  const offs = [
    client.onMessage((d) => {
      if (!isHostMsg(d)) return;
      if (d.t === 'screen') router.show(d.screen);
      else opts.onHostMsg?.(d);
    }),
    client.onKicked(() => shell.setOverlay('kicked', true)),
    client.onError((e) => {
      if (e.code === 'room-closed' || e.code === 'no-room') shell.setOverlay('closed', true);
    }),
  ];

  return {
    ctx,
    show: (s) => router.show(s),
    setOverlay: (n, on) => shell.setOverlay(n, on),
    destroy() {
      for (const off of offs) off();
      router.destroy();
      shell.destroy();
    },
  };
}
