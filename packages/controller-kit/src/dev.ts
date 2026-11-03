// Offline dev mode (`play.html?dev=1`): no relay. A local fake client drives the real app, with a live
// input-tuple readout and a panel of switcher rows (screens, colors, overlays…) the game fills in.
import type { ConnectionStatus, ControllerClient } from '@pcg/net-client';
import { el } from './dom';
import type { ShellClient } from './shell/app';

/** True on `?dev=1`. */
export function isDevMode(search: string = globalThis.location?.search ?? ''): boolean {
  return new URLSearchParams(search).get('dev') === '1';
}

export interface LocalClient extends ShellClient {
  /** Delivers a host message to the app. */
  emit(data: unknown): void;
  setStatus(s: ConnectionStatus): void;
  setHostStatus(s: 'present' | 'away'): void;
  /** Simulates the relay closing this client with reason `kicked`. */
  kick(): void;
  /** Every message the app sent. */
  sent: unknown[];
}

/** An in-memory ControllerClient. Used by dev mode and by tests. */
export function createLocalClient(): LocalClient {
  const msg = new Set<(d: unknown) => void>();
  const status = new Set<(s: ConnectionStatus) => void>();
  const host = new Set<(s: 'present' | 'away') => void>();
  const kicked = new Set<() => void>();
  const errors = new Set<(e: never) => void>();
  const sub = <T>(set: Set<T>, cb: T) => {
    set.add(cb);
    return () => void set.delete(cb);
  };
  const client = {
    status: 'open' as ConnectionStatus,
    playerId: 'dev',
    hostStatus: 'present' as 'present' | 'away',
    sent: [] as unknown[],
    connect: () => Promise.resolve({ playerId: 'dev' }),
    send(d: unknown) {
      client.sent.push(d);
    },
    close() {},
    onMessage: (cb: (d: unknown) => void) => sub(msg, cb),
    onStatus: (cb: (s: ConnectionStatus) => void) => sub(status, cb),
    onHostStatus: (cb: (s: 'present' | 'away') => void) => sub(host, cb),
    onKicked: (cb: () => void) => sub(kicked, cb),
    onError: (cb: Parameters<ControllerClient['onError']>[0]) =>
      sub(errors, cb as (e: never) => void),
    emit(d: unknown) {
      for (const cb of [...msg]) cb(d);
    },
    kick() {
      client.status = 'closed';
      for (const cb of [...kicked]) cb();
    },
    setStatus(s: ConnectionStatus) {
      client.status = s;
      for (const cb of [...status]) cb(s);
    },
    setHostStatus(s: 'present' | 'away') {
      client.hostStatus = s;
      for (const cb of [...host]) cb(s);
    },
  };
  return client;
}

export interface DevItem {
  id: string;
  /** Button text (default `id`). */
  label?: string;
  onClick(): void;
}

export interface DevHarness {
  /** Mount the app here. */
  readonly stage: HTMLElement;
  readonly readout: HTMLElement;
  readonly panel: HTMLElement;
  /** Shows a tuple (or any text) in the readout. */
  setReadout(value: readonly number[] | string): void;
  /** Adds a row of buttons, each tagged `data-dev-<attr>=<id>`. */
  addRow(attr: string, items: readonly DevItem[]): HTMLElement;
}

/**
 * Lays out `.dev-stage`, `.dev-readout`, a `.dev-toggle` button and the (hidden) `.dev-panel` of
 * `.dev-row`s in `root`. The game styles them.
 */
export function createDevHarness(root: HTMLElement): DevHarness {
  const stage = el('div', { class: 'dev-stage' });
  const readout = el('div', { class: 'dev-readout', 'aria-live': 'off' });
  const toggle = el('button', { type: 'button', class: 'dev-toggle', text: 'dev' });
  const panel = el('div', { class: 'dev-panel' });
  panel.hidden = true;
  toggle.addEventListener('click', () => (panel.hidden = !panel.hidden));
  root.append(stage, readout, toggle, panel);
  return {
    stage,
    readout,
    panel,
    setReadout(value) {
      readout.textContent = typeof value === 'string' ? value : `[${value.join(', ')}]`;
    },
    addRow(attr, items) {
      const row = el('div', { class: 'dev-row' });
      for (const item of items) {
        const b = el('button', {
          type: 'button',
          [`data-dev-${attr}`]: item.id,
          text: item.label ?? item.id,
        });
        b.addEventListener('click', () => item.onClick());
        row.append(b);
      }
      panel.append(row);
      return row;
    },
  };
}
