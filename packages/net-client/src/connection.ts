// Shared plumbing for the host and controller clients: a relay socket that reconnects with
// backoff after unexpected closes, detects dead sockets (app ping, probe on page return, connect
// timeout) and retries at once when the page comes back (relay SPEC §3.1, decision #5).
import { HEARTBEAT_DEFAULTS } from './api';
import type {
  CloseCause,
  CloseReason,
  ConnectionStats,
  ConnectionStatus,
  DocumentLike,
  EventTargetLike,
  HeartbeatOptions,
  LastClose,
  Unsubscribe,
  WebSocketCtor,
} from './api';
import { backoffDelay } from './backoff';
import { decode, encode } from './codec';
import type { ClientToRelay, RelayToClient } from './protocol';

export class Emitter<A extends unknown[]> {
  private readonly listeners = new Set<(...args: A) => void>();

  on(cb: (...args: A) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  emit(...args: A): void {
    for (const cb of [...this.listeners]) {
      try {
        cb(...args);
      } catch (err) {
        // A throwing listener must not corrupt the client's state machine.
        console.error('net-client listener error', err);
      }
    }
  }
}

export interface ConnectionOptions {
  url: string;
  WebSocket: WebSocketCtor | undefined;
  document: DocumentLike | undefined;
  window: EventTargetLike | undefined;
  heartbeat?: HeartbeatOptions;
  /** Clock for stats and timeouts; default `Date.now`. */
  now?: () => number;
  /** Socket opened: send the handshake (create / reclaim / join). */
  onOpen: () => void;
  onMessage: (msg: RelayToClient) => void;
}

const WS_OPEN = 1;
const WINDOW_EVENTS = ['online', 'pageshow', 'focus'] as const;

type Timer = ReturnType<typeof setTimeout>;
type TimerName = 'timer' | 'connectTimer' | 'deadTimer' | 'probeTimer';

export class Connection {
  status: ConnectionStatus = 'idle';
  closeReason: CloseReason | null = null;
  readonly statusEvents = new Emitter<[ConnectionStatus]>();

  private ws: WebSocket | null = null;
  private attempt = 0;
  private timer: Timer | null = null;
  private readonly opts: ConnectionOptions;
  private readonly hbOpts: Required<HeartbeatOptions>;
  private readonly now: () => number;

  // Per-socket state.
  private handshaken = false;
  private connectTimer: Timer | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private deadTimer: Timer | null = null;
  private probeTimer: Timer | null = null;
  /** The one ping in flight; any inbound frame clears it. */
  private outstanding: { n: number; sentAt: number } | null = null;

  // Stats.
  private pingN = 0;
  private handshakes = 0;
  private reconnects = 0;
  private failedAttempts = 0;
  private lastClose: LastClose | null = null;
  private rttMs: number | null = null;
  private heartbeat = false;
  private lastMessageAt: number | null = null;
  private openSince: number | null = null;

  constructor(opts: ConnectionOptions) {
    this.opts = opts;
    this.now = opts.now ?? (() => Date.now());
    const h = opts.heartbeat ?? {};
    this.hbOpts = {
      intervalMs: h.intervalMs ?? HEARTBEAT_DEFAULTS.intervalMs,
      timeoutMs: h.timeoutMs ?? HEARTBEAT_DEFAULTS.timeoutMs,
      probeTimeoutMs: h.probeTimeoutMs ?? HEARTBEAT_DEFAULTS.probeTimeoutMs,
      connectTimeoutMs: h.connectTimeoutMs ?? HEARTBEAT_DEFAULTS.connectTimeoutMs,
    };
  }

  start(): void {
    if (this.status !== 'idle') return;
    this.opts.document?.addEventListener('visibilitychange', this.onVisibility);
    this.opts.document?.addEventListener('resume', this.revive);
    for (const ev of WINDOW_EVENTS) this.opts.window?.addEventListener(ev, this.revive);
    this.setStatus('connecting');
    this.open();
  }

  /**
   * Handshake completed (created / reclaimed / joined). `heartbeat` is the reply's
   * `heartbeat: true` flag: app pings run only against a relay that answers them.
   */
  ready(heartbeat = false): void {
    if (this.handshaken || !this.ws) return;
    this.handshaken = true;
    this.attempt = 0;
    this.clearTimer('connectTimer');
    if (this.handshakes > 0) this.reconnects += 1;
    this.handshakes += 1;
    this.openSince = this.now();
    this.heartbeat = heartbeat;
    if (!heartbeat) this.rttMs = null;
    if (heartbeat && this.hbOpts.intervalMs > 0) {
      this.pingTimer = setInterval(() => this.sendPing(), this.hbOpts.intervalMs);
    }
    this.setStatus('open');
  }

  stats(): ConnectionStats {
    return {
      status: this.status,
      reconnects: this.reconnects,
      failedAttempts: this.failedAttempts,
      lastClose: this.lastClose ? { ...this.lastClose } : null,
      rttMs: this.rttMs,
      heartbeat: this.heartbeat,
      lastMessageAt: this.lastMessageAt,
      openSince: this.openSince,
    };
  }

  /** Returns false (and drops the message) unless the socket is open. */
  send(msg: ClientToRelay): boolean {
    const ws = this.ws;
    if (!ws || ws.readyState !== WS_OPEN) return false;
    ws.send(encode(msg));
    return true;
  }

  /** Closes for good: no further reconnects. */
  stop(reason: CloseReason): void {
    if (this.status === 'closed') return;
    this.closeReason = reason;
    this.clearTimer('timer');
    this.clearSocketTimers();
    this.opts.document?.removeEventListener('visibilitychange', this.onVisibility);
    this.opts.document?.removeEventListener('resume', this.revive);
    for (const ev of WINDOW_EVENTS) this.opts.window?.removeEventListener(ev, this.revive);
    const ws = this.ws;
    this.ws = null;
    if (ws) {
      detach(ws);
      try {
        ws.close();
      } catch {
        // already closing
      }
    }
    this.openSince = null;
    this.recordClose('local', 0, reason, true);
    this.setStatus('closed');
  }

  private open(): void {
    this.timer = null;
    const Ctor = this.opts.WebSocket;
    if (!Ctor) throw new Error('net-client: no WebSocket implementation available');
    let ws: WebSocket;
    try {
      ws = new Ctor(this.opts.url);
    } catch {
      this.failedAttempts += 1;
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    this.handshaken = false;
    ws.onopen = () => {
      if (this.ws === ws) this.opts.onOpen();
    };
    ws.onmessage = (ev: MessageEvent) => {
      if (this.ws !== ws) return;
      this.onFrame(ev.data);
    };
    ws.onclose = (ev: CloseEvent) => {
      if (this.ws !== ws) return;
      this.ws = null;
      detach(ws);
      this.clearSocketTimers();
      this.openSince = null;
      if (!this.handshaken) this.failedAttempts += 1;
      this.recordClose('socket', ev?.code ?? 0, ev?.reason ?? '', ev?.wasClean ?? false);
      if (this.status !== 'closed') this.scheduleReconnect();
    };
    ws.onerror = null; // a close event always follows an error
    const { connectTimeoutMs } = this.hbOpts;
    if (connectTimeoutMs > 0) {
      this.connectTimer = setTimeout(() => {
        this.connectTimer = null;
        if (this.ws === ws && !this.handshaken) this.abandon('connect-timeout', false);
      }, connectTimeoutMs);
    }
  }

  /** Any inbound frame proves the socket works: it answers the ping and the probe. */
  private onFrame(data: unknown): void {
    this.lastMessageAt = this.now();
    const pending = this.outstanding;
    this.outstanding = null;
    this.clearTimer('deadTimer');
    this.clearTimer('probeTimer');
    const res = decode(data);
    // Undecodable frames are ignored: the relay is the only sender.
    if (!res.ok) return;
    if (res.msg.t === 'pong') {
      if (pending && pending.n === res.msg.n) this.rttMs = Math.max(0, this.now() - pending.sentAt);
      return; // never reaches the game
    }
    this.opts.onMessage(res.msg);
  }

  /** Sends a ping unless one is already in flight (at most one outstanding). */
  private sendPing(): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== WS_OPEN || !this.handshaken || this.outstanding) return;
    const n = (this.pingN += 1);
    try {
      ws.send(encode({ t: 'ping', n }));
    } catch {
      return;
    }
    this.outstanding = { n, sentAt: this.now() };
    // Measured from the ping: any frame since then cleared `outstanding` and this timer, so a
    // timer that fires late in a throttled tab can't kill a socket that answered.
    this.deadTimer = setTimeout(() => {
      this.deadTimer = null;
      if (this.ws === ws && this.outstanding?.n === n) this.abandon('heartbeat-timeout', true);
    }, this.hbOpts.timeoutMs);
  }

  /** Page came back (or the network changed): retry now, or check that the open socket works. */
  private readonly revive = (): void => {
    if (this.status === 'reconnecting') {
      if (this.ws || this.timer === null) return; // an attempt is already in flight
      clearTimeout(this.timer);
      this.open();
      return;
    }
    if (this.status !== 'open' || !this.heartbeat || this.hbOpts.intervalMs <= 0) return;
    const ws = this.ws;
    if (!ws || this.probeTimer !== null) return; // coalesce bursts
    this.sendPing();
    this.probeTimer = setTimeout(() => {
      this.probeTimer = null;
      if (this.ws === ws) this.abandon('probe-timeout', true);
    }, this.hbOpts.probeTimeoutMs);
  };

  private readonly onVisibility = (): void => {
    if (this.opts.document?.visibilityState === 'visible') this.revive();
  };

  /** Gives up on the current socket: detached, so its late events can't touch state. */
  private abandon(cause: CloseCause, resetBackoff: boolean): void {
    const ws = this.ws;
    if (!ws) return;
    this.ws = null;
    detach(ws);
    try {
      ws.close();
    } catch {
      // already closing
    }
    this.clearSocketTimers();
    this.openSince = null;
    if (!this.handshaken) this.failedAttempts += 1;
    this.recordClose(cause, 0, cause, false);
    if (resetBackoff) this.attempt = 0;
    this.scheduleReconnect();
  }

  private recordClose(cause: CloseCause, code: number, reason: string, wasClean: boolean): void {
    this.lastClose = { cause, code, reason, wasClean, at: this.now() };
  }

  private scheduleReconnect(): void {
    if (this.status === 'closed') return;
    this.setStatus('reconnecting');
    const delay = backoffDelay(this.attempt);
    this.attempt += 1;
    this.timer = setTimeout(() => this.open(), delay);
  }

  private clearSocketTimers(): void {
    this.clearTimer('connectTimer');
    this.clearTimer('deadTimer');
    this.clearTimer('probeTimer');
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.outstanding = null;
  }

  private clearTimer(name: TimerName): void {
    const t = this[name];
    if (t !== null) clearTimeout(t);
    this[name] = null;
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.statusEvents.emit(status);
  }
}

function detach(ws: WebSocket): void {
  ws.onopen = null;
  ws.onmessage = null;
  ws.onclose = null;
  ws.onerror = null;
}
