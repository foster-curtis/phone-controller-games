// Controller app (SPEC §15.7): the kit's app shell turns the phone platform on and drives the
// reconnecting / host-away / rotate overlays; the screen comes from the host's `me.screen` (rev-ordered
// `team` / `me` snapshots); menu actions go out as intents with a `seq` and refusals come back as
// toasts; the input tuple streams while the player is in combat or the build phase.
import {
  createAppShell,
  createScreenRouter,
  defaultStorage,
  readStored,
  writeStored,
  type ShellClient,
} from '@pcg/controller-kit';
import type { StorageLike } from '@pcg/net-client';
import { title } from '../../game.meta';
import { PROTOCOL_VERSION, isHostMsg, type Intent, type TeamView } from '../shared/messages';
import { Toast } from './components';
import { createPhoneSender, type PhoneSender } from './input';
import { createJoin, createNote } from './screens/simple';
import { GROUP_OF, INPUT_GROUPS, createView, type ViewGroup } from './screens';
import type { ScreenCtx, Snapshot } from './screens/common';
import {
  INITIAL_STATE,
  applyHostMsg,
  createIntentTracker,
  resetRevs,
  type HostState,
} from './state';

export type OverlayName = 'reconnecting' | 'hostAway' | 'rotate' | 'refreshTv';
export const OVERLAY_NAMES: OverlayName[] = ['reconnecting', 'hostAway', 'rotate', 'refreshTv'];

const OVERLAY_TEXT: Record<OverlayName, { title: string; body: string }> = {
  reconnecting: { title: 'Reconnecting…', body: 'Hang tight, getting you back in.' },
  hostAway: { title: 'TV away', body: 'Waiting for the TV to come back.' },
  rotate: { title: 'Rotate your phone', body: `${title} plays in landscape.` },
  refreshTv: {
    title: 'Refresh the TV',
    body: 'The TV is running an older version. Reload it and rejoin.',
  },
};

const ERROR_TEXT: Record<string, string> = {
  'no-room': 'That room does not exist. Check the code on the TV.',
  'room-full': 'The room is full.',
  'room-closed': 'The room was closed.',
  'bad-request': 'Something went wrong joining.',
};

export const DEVICE_ID_KEY = 'fort-frenzy:deviceId';
const RELOADED_KEY = 'fort-frenzy:reloaded';

/** A random id this phone keeps in localStorage, not tied to any room (SPEC §15.8). */
export function getDeviceId(storage: StorageLike | undefined = defaultStorage()): string {
  const have = readStored(DEVICE_ID_KEY, storage);
  if (have) return have;
  const id =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  writeStored(DEVICE_ID_KEY, id, storage);
  return id;
}

/** Stand-in team while only `me` has arrived (name / full / claim screens need none). */
export const EMPTY_TEAM: TeamView = {
  phase: 'lobby',
  wave: 0,
  buildEndsInMs: null,
  coins: 0,
  baseHp: 0,
  baseMaxHp: 0,
  theme: 'neon-knights',
  difficulty: 'normal',
  leaderId: null,
  roster: [],
  shop: [],
  wishlist: [],
  nextWave: null,
  summary: null,
};

export interface AppOptions {
  root: HTMLElement;
  client: ShellClient & { playerId?: string | null };
  /** Room code from `?code=`. */
  code?: string | null;
  storage?: StorageLike;
  /** Per-tab storage for the reload-once guard (default sessionStorage). */
  session?: StorageLike;
  /** Reloads the page (default location.reload); tests stub it. */
  reload?: () => void;
  /** Called when the player types a room code. */
  onCode?: (code: string) => void;
  /** Rotate overlay in portrait (default on). */
  watchOrientation?: boolean;
  /** Observes every phone → host message (dev readout). */
  onSent?: (msg: unknown) => void;
  now?: () => number;
}

export interface App {
  readonly sender: PhoneSender;
  readonly state: () => HostState;
  setOverlay(name: OverlayName, on: boolean): void;
  overlays(): OverlayName[];
  /** The screen group on show (or a phone-local one). */
  group(): ViewGroup | string | null;
  showRemoved(): void;
  /** Connects, then says hello. Errors show on the join screen. */
  start(): Promise<void>;
  destroy(): void;
}

export function createApp(opts: AppOptions): App {
  const { root, client } = opts;
  const storage = opts.storage ?? defaultStorage();
  const now = opts.now ?? (() => Date.now());
  const post = (m: unknown) => {
    client.send(m);
    opts.onSent?.(m);
  };
  const sender = createPhoneSender((t) => post(t));
  const tracker = createIntentTracker(post);

  const shell = createAppShell<OverlayName>({
    root,
    client,
    overlays: OVERLAY_NAMES,
    text: OVERLAY_TEXT,
    overlayClasses: { title: 'h2', body: 'body' },
    platform: { rotate: opts.watchOrientation !== false },
  });
  const toast = Toast(shell.overlayHost);

  const ctx: ScreenCtx = {
    intent: (i: Intent) => void tracker.send(i),
    sender,
    code: opts.code ?? null,
    storage,
    myId: () => client.playerId ?? null,
    toast: (t) => toast.show(t),
    now,
  };

  let state: HostState = INITIAL_STATE;
  const router = createScreenRouter<Snapshot, ViewGroup>({
    host: shell.screenHost,
    groupOf: (s) => GROUP_OF[s.me.screen],
    create: (s) => createView(s, ctx),
  });

  let joinError: string | null = null;
  const join = createJoin({
    code: opts.code ?? null,
    error: null,
    onCode: (c) => opts.onCode?.(c),
  });
  const showJoin = () => {
    sender.neutral();
    sender.stop();
    join.set({ code: opts.code ?? null, error: joinError });
    router.showLocal('join', join.el);
  };

  const render = () => {
    const me = state.me;
    if (!me) return showJoin();
    router.show({ team: state.team ?? EMPTY_TEAM, me });
    if (INPUT_GROUPS.includes(GROUP_OF[me.screen])) sender.start();
    else {
      sender.neutral();
      sender.stop();
    }
  };

  const showRemoved = () => {
    sender.neutral();
    sender.stop();
    const view = createNote('You were removed', 'The party leader removed you from the lobby.', {
      label: 'JOIN AGAIN',
      run: () => (opts.reload ?? (() => location.reload()))(),
    });
    router.showLocal('removed', view.el, view);
  };

  const showHome = () => {
    sender.neutral();
    sender.stop();
    const view = createNote('The TV went home', 'Join the new room with the code on the TV.', {
      label: 'JOIN AGAIN',
      run: () => opts.onCode?.(''),
    });
    router.showLocal('home', view.el, view);
  };

  const session =
    opts.session ??
    (() => {
      try {
        return globalThis.sessionStorage;
      } catch {
        return undefined;
      }
    })();
  const onOutdated = (hostProto: number) => {
    if (hostProto > PROTOCOL_VERSION) {
      // This phone is older than the TV: reload once to pick up the new build.
      if (readStored(RELOADED_KEY, session)) return;
      writeStored(RELOADED_KEY, '1', session);
      (opts.reload ?? (() => location.reload()))();
    } else {
      shell.setOverlay('refreshTv', true);
    }
  };

  // hello after every (re)open: the host answers with `team` and `me`.
  let needHello = true;
  const hello = () => {
    if (!needHello) return;
    needHello = false;
    post({ t: 'hello', proto: PROTOCOL_VERSION, deviceId: getDeviceId(storage) });
  };

  const offs: Array<() => void> = [
    client.onMessage((data) => {
      if (!isHostMsg(data)) return;
      if (data.t === 'ack') {
        const text = tracker.ack(data);
        if (text) toast.show(text);
        return;
      }
      if (data.t === 'outdated') return onOutdated(data.proto);
      const r = applyHostMsg(state, data);
      state = r.state;
      if (r.changed) render();
    }),
    client.onStatus((s) => {
      if (s === 'open') {
        // A reconnect: the host's revs may have restarted.
        state = resetRevs(state);
        hello();
      } else needHello = true;
      if (s === 'closed' && !state.me) showJoin();
    }),
    client.onHostStatus((s) => {
      if (s !== 'present') return;
      state = resetRevs(state);
      // A reloaded TV reclaimed the room with no party in memory: say hello again so it can match
      // this phone to its saved slot (§11.5, FF14).
      needHello = true;
      if (client.status === 'open') hello();
    }),
    client.onKicked(() =>
      // "Return to home" closes the room for everyone (§4); a lobby removal is the other kick.
      state.team?.phase === 'summary' ? showHome() : showRemoved(),
    ),
    client.onError((e) => {
      joinError = ERROR_TEXT[e.code] ?? e.message;
      if (!state.me) showJoin();
    }),
  ];

  showJoin();

  return {
    sender,
    state: () => state,
    setOverlay: (n, on) => shell.setOverlay(n, on),
    overlays: () => shell.overlays(),
    group: () => router.group(),
    showRemoved,
    async start() {
      try {
        await client.connect();
        if (client.status === 'open') hello();
      } catch (e) {
        joinError =
          ERROR_TEXT[(e as { code?: string }).code ?? ''] ??
          (e instanceof Error ? e.message : 'Could not connect.');
        if (!state.me) showJoin();
      }
    },
    destroy() {
      for (const off of offs) off();
      sender.stop();
      router.destroy();
      join.destroy();
      shell.destroy();
    },
  };
}
