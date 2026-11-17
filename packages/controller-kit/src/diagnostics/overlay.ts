// Controller diagnostics overlay (controller-compat F0 contract, F2 builds it). On only with
// `?debug=1` on the phone's URL. A small "Diagnostics" pill (out of the way of the controls) opens a
// panel with: connection state, reconnect count, last close (code, reason, cause), RTT, heartbeat,
// player id, host status, user agent, display mode, secure context, visibility / online state, the
// feature table from `detectCapabilities` (Wake Lock, full screen, vibration, orientation lock, motion
// permission), whether Wake Lock is held, and a timeline of recent events (status changes,
// visibilitychange, pagehide / pageshow, freeze / resume, online / offline). **Copy diagnostics**
// copies `formatDiagnostics(collect())` (clipboard API, else a selected textarea fallback) so a tester
// can paste it. Records from the moment it's created, so the shell creates it first thing.
// Frozen at controller-compat F0: additive changes only.
import type { Capabilities } from '@pcg/game-kit';
import type { ConnectionStats, ControllerClient } from '@pcg/net-client';
import type { WakeLock } from '../platform/wakeLock';

export type DiagnosticsClient = Partial<
  Pick<
    ControllerClient,
    'status' | 'playerId' | 'hostStatus' | 'getStats' | 'onStatus' | 'onHostStatus'
  >
>;

export interface DiagnosticsEvent {
  /** `Date.now()`. */
  at: number;
  /** e.g. `status`, `visibility`, `pageshow`, `online`, `host`. */
  kind: string;
  detail?: string;
}

export interface DiagnosticsReport {
  /** ISO time of the snapshot. */
  at: string;
  game?: string;
  version?: string;
  url: string;
  userAgent: string;
  connection: Partial<ConnectionStats> & {
    playerId?: string | null;
    hostStatus?: 'present' | 'away';
  };
  capabilities: Capabilities;
  state: {
    visibility: string;
    online: boolean | null;
    fullscreen: boolean;
    standalone: boolean;
    wakeLockHeld: boolean | null;
    viewport: string;
  };
  /** Oldest first, capped (the last 50). */
  events: DiagnosticsEvent[];
}

export interface DiagnosticsOptions {
  /** Where the pill and panel mount (the shell passes its root). */
  root: HTMLElement;
  client?: DiagnosticsClient;
  game?: string;
  version?: string;
  wakeLock?: WakeLock | null;
  /** Game-specific rows appended to the report. */
  extra?: () => Record<string, string>;
  window?: Window;
  document?: Document;
}

export interface DiagnosticsOverlay {
  collect(): DiagnosticsReport;
  destroy(): void;
}

/** `?debug=1` in the page's query string. */
export function diagnosticsEnabled(search: string = globalThis.location?.search ?? ''): boolean {
  try {
    return new URLSearchParams(search).get('debug') === '1';
  } catch {
    return false;
  }
}

/** Plain text for pasting into a chat or issue. F2 implements; F0 stub: JSON. */
export function formatDiagnostics(report: DiagnosticsReport): string {
  return JSON.stringify(report, null, 2);
}

/** F2 implements. F0 stub: mounts nothing. */
export function createDiagnosticsOverlay(_opts: DiagnosticsOptions): DiagnosticsOverlay {
  return {
    collect() {
      throw new Error('diagnostics overlay: not built yet (controller-compat F2)');
    },
    destroy() {},
  };
}
