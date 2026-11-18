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
import {
  detectCapabilities,
  fullscreenApi,
  isStandalone,
  type CapabilityEnv,
  type Capabilities,
} from '@pcg/game-kit';
import type { ConnectionStats, ControllerClient } from '@pcg/net-client';
import { el } from '../dom';
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
  /** Game-specific rows from `DiagnosticsOptions.extra` (additive). */
  extra?: Record<string, string>;
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

const MAX_EVENTS = 50;
const REFRESH_MS = 1000;

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

const emptyCaps = (): Capabilities => ({
  secureContext: false,
  wakeLock: false,
  fullscreen: false,
  vibrate: false,
  orientationLock: false,
  motion: 'unsupported',
  standalone: false,
  clipboard: false,
});

/** Plain text for pasting into a chat or issue. */
export function formatDiagnostics(report: DiagnosticsReport): string {
  const lines: string[] = [];
  const kv = (k: string, v: unknown) => lines.push(`${k}: ${v === undefined ? '-' : String(v)}`);
  kv('time', report.at);
  if (report.game) kv('game', report.game);
  if (report.version) kv('version', report.version);
  kv('url', report.url);
  kv('userAgent', report.userAgent);
  const c = report.connection;
  kv('status', c.status);
  kv('reconnects', c.reconnects);
  kv('failedAttempts', c.failedAttempts);
  kv(
    'lastClose',
    c.lastClose
      ? `${c.lastClose.code} ${c.lastClose.reason || '(no reason)'} cause=${c.lastClose.cause} clean=${c.lastClose.wasClean}`
      : 'none',
  );
  kv('rttMs', c.rttMs ?? 'n/a');
  kv('heartbeat', c.heartbeat);
  kv('playerId', c.playerId ?? 'n/a');
  kv('hostStatus', c.hostStatus ?? 'n/a');
  for (const [k, v] of Object.entries(report.state)) kv(k, v);
  for (const [k, v] of Object.entries(report.extra ?? {})) kv(k, v);
  lines.push('capabilities:');
  for (const [k, v] of Object.entries(report.capabilities)) lines.push(`  ${k.padEnd(16)} ${v}`);
  lines.push('events (seconds relative to this report):');
  const now = Date.parse(report.at) || Date.now();
  if (report.events.length === 0) lines.push('  (none)');
  for (const e of report.events) {
    const t = ((e.at - now) / 1000).toFixed(1);
    lines.push(`  ${t.padStart(7)}s  ${e.kind}${e.detail ? ' ' + e.detail : ''}`);
  }
  return lines.join('\n');
}

export function createDiagnosticsOverlay(opts: DiagnosticsOptions): DiagnosticsOverlay {
  const win = opts.window ?? (globalThis.window as Window | undefined);
  const doc = opts.document ?? (globalThis.document as Document | undefined);
  const client = opts.client;
  const events: DiagnosticsEvent[] = [];
  const offs: Array<() => void> = [];
  let timer: ReturnType<typeof setInterval> | null = null;
  let destroyed = false;
  let panel: HTMLElement | null = null;
  let rows: HTMLElement | null = null;

  const record = (kind: string, detail?: string) => {
    events.push({ at: Date.now(), kind, ...(detail ? { detail } : {}) });
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  };
  const listen = (target: EventTarget | undefined, type: string, fn: (e: Event) => void) => {
    safe(() => {
      target?.addEventListener(type, fn);
      offs.push(() => target?.removeEventListener(type, fn));
    }, undefined);
  };

  safe(() => {
    const a = client?.onStatus?.((s) => record('status', s));
    if (a) offs.push(a);
    const b = client?.onHostStatus?.((s) => record('host', s));
    if (b) offs.push(b);
  }, undefined);
  listen(doc, 'visibilitychange', () => record('visibility', doc?.visibilityState));
  listen(doc, 'freeze', () => record('freeze'));
  listen(doc, 'resume', () => record('resume'));
  listen(win, 'pagehide', (e) =>
    record('pagehide', `persisted=${(e as PageTransitionEvent).persisted}`),
  );
  listen(win, 'pageshow', (e) =>
    record('pageshow', `persisted=${(e as PageTransitionEvent).persisted}`),
  );
  for (const t of ['online', 'offline', 'focus', 'blur']) listen(win, t, () => record(t));
  listen(doc, 'fullscreenchange', () => record('fullscreen'));
  listen(doc, 'webkitfullscreenchange', () => record('fullscreen'));

  const collect = (): DiagnosticsReport => {
    const nav = safe(() => globalThis.navigator, undefined);
    const stats = safe(() => client?.getStats?.(), undefined) ?? {};
    const status = safe(() => client?.status, undefined);
    const hostStatus = safe(() => client?.hostStatus, undefined);
    const capEnv = { window: win, document: doc, navigator: nav } as CapabilityEnv;
    const report: DiagnosticsReport = {
      at: new Date().toISOString(),
      ...(opts.game ? { game: opts.game } : {}),
      ...(opts.version ? { version: opts.version } : {}),
      url: safe(() => String(win?.location?.href ?? ''), ''),
      userAgent: safe(() => nav?.userAgent ?? '', ''),
      connection: {
        ...(status && !('status' in stats) ? { status } : {}),
        ...stats,
        playerId: safe(() => client?.playerId ?? null, null),
        ...(hostStatus ? { hostStatus } : {}),
      },
      capabilities: safe(() => detectCapabilities(capEnv), emptyCaps()),
      state: {
        visibility: safe(() => doc?.visibilityState ?? 'unknown', 'unknown'),
        online: safe(() => (typeof nav?.onLine === 'boolean' ? nav.onLine : null), null),
        fullscreen: safe(() => fullscreenApi(doc).isActive(), false),
        standalone: safe(() => isStandalone(capEnv), false),
        wakeLockHeld: safe(() => (opts.wakeLock ? opts.wakeLock.held : null), null),
        viewport: safe(() => `${win?.innerWidth}x${win?.innerHeight}`, ''),
      },
      events: events.slice(),
    };
    const extra = safe(() => opts.extra?.(), undefined);
    if (extra) report.extra = extra;
    return report;
  };

  // ---- UI ----
  const pill = el('button', { type: 'button', class: 'pcg-diag-pill', text: 'Diagnostics' });
  Object.assign(pill.style, {
    position: 'fixed',
    top: 'env(safe-area-inset-top, 0px)',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '2147483001',
    fontSize: '11px',
    padding: '2px 8px',
    opacity: '0.6',
  });

  const render = () => {
    if (!rows) return;
    const text = formatDiagnostics(collect());
    rows.replaceChildren(
      ...text.split('\n').map((line) => {
        const row = el('div', { class: 'pcg-diag-row' });
        row.textContent = line;
        row.style.whiteSpace = 'pre-wrap';
        return row;
      }),
    );
  };

  const close = () => {
    if (timer) clearInterval(timer);
    timer = null;
    panel?.remove();
    panel = null;
    rows = null;
    pill.setAttribute('aria-expanded', 'false');
  };

  const copy = async (status: HTMLElement, fallback: { area: HTMLTextAreaElement | null }) => {
    const text = formatDiagnostics(collect());
    const done = () => {
      status.textContent = 'Copied';
      setTimeout(() => (status.textContent = ''), 2000);
    };
    const clip = safe(() => (globalThis.navigator as Navigator | undefined)?.clipboard, undefined);
    const secure = safe(() => globalThis.isSecureContext !== false, false);
    if (secure && typeof clip?.writeText === 'function') {
      try {
        await clip.writeText(text);
        return done();
      } catch {
        /* fall through */
      }
    }
    const area = fallback.area ?? el('textarea', { class: 'pcg-diag-copy', readonly: '' });
    fallback.area = area;
    area.value = text;
    area.style.width = '100%';
    area.style.height = '6em';
    if (!area.isConnected) status.parentElement?.after(area);
    let ok: boolean;
    try {
      area.focus();
      area.select();
      ok = typeof doc?.execCommand === 'function' && doc.execCommand('copy') === true;
    } catch {
      ok = false;
    }
    if (ok) {
      area.remove();
      fallback.area = null;
      done();
    } else {
      status.textContent = 'Copy this text manually';
    }
  };

  const open = () => {
    if (panel || destroyed) return;
    const status = el('span', { class: 'pcg-diag-status', 'aria-live': 'polite' });
    const fallback = { area: null as HTMLTextAreaElement | null };
    const copyBtn = el('button', {
      type: 'button',
      class: 'pcg-diag-copy-btn',
      text: 'Copy diagnostics',
    });
    copyBtn.addEventListener('click', () => void copy(status, fallback));
    const closeBtn = el('button', { type: 'button', class: 'pcg-diag-close', text: 'Close' });
    closeBtn.addEventListener('click', close);
    rows = el('div', { class: 'pcg-diag-rows' });
    panel = el(
      'div',
      { class: 'pcg-diag-panel', role: 'dialog', 'aria-label': 'Diagnostics' },
      el('div', { class: 'pcg-diag-actions' }, copyBtn, closeBtn, status),
      rows,
    );
    Object.assign(panel.style, {
      position: 'fixed',
      inset: '0',
      zIndex: '2147483002',
      overflow: 'auto',
      boxSizing: 'border-box',
      padding: 'calc(env(safe-area-inset-top, 0px) + 8px) 8px 8px',
      background: 'rgba(0,0,0,0.9)',
      color: '#fff',
      fontSize: '12px',
      fontFamily: 'monospace',
    });
    opts.root.append(panel);
    pill.setAttribute('aria-expanded', 'true');
    render();
    timer = setInterval(render, REFRESH_MS);
  };

  pill.addEventListener('click', () => (panel ? close() : open()));
  safe(() => opts.root.append(pill), undefined);

  return {
    collect,
    destroy() {
      destroyed = true;
      close();
      pill.remove();
      for (const off of offs.splice(0)) safe(off, undefined);
    },
  };
}
