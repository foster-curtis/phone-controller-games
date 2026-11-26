// Test harness for the phone app (SPEC §12.7, §12.9): the real app on a local fake client with a manual
// clock and frame loop, so countdowns, cooldowns and hold bars are driven by `advance`.
import { createLocalClient, type LocalClient } from '@pcg/controller-kit';
import type { HoldEstimator } from '../../shared/hold';
import type { HostMsg, PhoneMsg } from '../../shared/messages';
import { createApp, type App } from '../app';
import { createFakeHoldEstimator } from '../fakeHold';
import { SAMPLES } from '../samples';
import type { TipViewerFactory } from '../tipViewer';

export interface Rig {
  app: App;
  client: LocalClient;
  root: HTMLElement;
  /** Moves the clock and runs one frame. */
  advance(ms: number): void;
  emit(...msgs: HostMsg[]): void;
  /** Loads a dev sample's messages. */
  sample(id: string): void;
  /** Phone messages sent so far (excluding input tuples unless asked). */
  sent(t?: PhoneMsg['t']): PhoneMsg[];
  q<T extends HTMLElement = HTMLElement>(sel: string): T;
  qa(sel: string): HTMLElement[];
  clock: { t: number };
}

export function mountApp(
  opts: { estimator?: HoldEstimator; tipViewer?: TipViewerFactory } = {},
): Rig {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app')!;
  const client = createLocalClient();
  const clock = { t: 1000 };
  let frame: (() => void) | null = null;
  const app = createApp({
    root,
    client,
    code: 'TEST',
    now: () => clock.t,
    raf: (cb) => (frame = cb),
    platform: {
      wakeLock: false,
      keepAwakeHint: false,
      viewport: false,
      rotate: false,
      fullscreenButton: false,
      diagnostics: false,
    },
    estimator: opts.estimator ?? createFakeHoldEstimator(),
    ...(opts.tipViewer ? { tipViewer: opts.tipViewer } : {}),
  });
  const rig: Rig = {
    app,
    client,
    root,
    clock,
    advance(ms) {
      clock.t += ms;
      const f = frame;
      frame = null;
      f?.();
    },
    emit(...msgs) {
      for (const m of msgs) client.emit(m);
      rig.advance(0);
    },
    sample(id) {
      rig.emit(...SAMPLES[id]!().msgs);
    },
    sent: (t) => (client.sent as PhoneMsg[]).filter((m) => (t ? m.t === t : m.t !== 'input')),
    q: <T extends HTMLElement>(sel: string) => root.querySelector<T>(sel)!,
    qa: (sel) => [...root.querySelectorAll<HTMLElement>(sel)],
  };
  return rig;
}

/** A pointer event jsdom delivers to the kit's hold buttons (they only read `pointerId`). */
export function pointer(el: Element, type: 'pointerdown' | 'pointerup', id = 1): void {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { pointerId: id });
  el.dispatchEvent(e);
}
