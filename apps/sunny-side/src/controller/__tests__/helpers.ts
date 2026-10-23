import { createApp, type App } from '../app';
import { createLocalClient, sampleScreen, type LocalClient } from '../dev';
import type { Screen } from '../../shared/messages';

/** Dispatches a pointer event (jsdom's PointerEvent support varies, so fall back to a MouseEvent). */
export function pointer(
  target: Element,
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  pointerId: number,
  x = 0,
  y = 0,
): void {
  const init = { bubbles: true, cancelable: true, clientX: x, clientY: y };
  const ev =
    typeof PointerEvent === 'function'
      ? new PointerEvent(type, { ...init, pointerId })
      : Object.assign(new MouseEvent(type, init), { pointerId });
  target.dispatchEvent(ev);
}

export interface Harness {
  root: HTMLElement;
  client: LocalClient;
  app: App;
  storage: Storage;
  show(screen: Screen): void;
  tuples(): number[][];
  msgs(): Array<Record<string, unknown>>;
}

export function mount(opts: { name?: string } = {}): Harness {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app') as HTMLElement;
  const client = createLocalClient();
  localStorage.clear();
  if (opts.name) localStorage.setItem('sunny-side:name', opts.name);
  const app = createApp({ root, client, code: 'ABCD', storage: localStorage });
  return {
    root,
    client,
    app,
    storage: localStorage,
    show: (screen) => client.emit({ t: 'screen', screen }),
    tuples: () => client.sent.filter(Array.isArray) as number[][],
    msgs: () => client.sent.filter((m) => !Array.isArray(m)) as Array<Record<string, unknown>>,
  };
}

export { sampleScreen };
