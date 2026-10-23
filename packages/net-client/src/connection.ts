// Shared plumbing for the host and controller clients: a relay socket that reconnects with
// backoff after unexpected closes, and retries at once when the tab becomes visible / online.
import type {
  CloseReason,
  ConnectionStatus,
  DocumentLike,
  EventTargetLike,
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
  /** Socket opened: send the handshake (create / reclaim / join). */
  onOpen: () => void;
  onMessage: (msg: RelayToClient) => void;
}

const WS_OPEN = 1;

export class Connection {
  status: ConnectionStatus = 'idle';
  closeReason: CloseReason | null = null;
  readonly statusEvents = new Emitter<[ConnectionStatus]>();

  private ws: WebSocket | null = null;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly opts: ConnectionOptions;

  constructor(opts: ConnectionOptions) {
    this.opts = opts;
  }

  start(): void {
    if (this.status !== 'idle') return;
    this.opts.document?.addEventListener('visibilitychange', this.onVisibility);
    this.opts.window?.addEventListener('online', this.wake);
    this.setStatus('connecting');
    this.open();
  }

  /** Handshake completed (created / reclaimed / joined). */
  ready(): void {
    this.attempt = 0;
    this.setStatus('open');
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
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.opts.document?.removeEventListener('visibilitychange', this.onVisibility);
    this.opts.window?.removeEventListener('online', this.wake);
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
      this.scheduleReconnect();
      return;
    }
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws === ws) this.opts.onOpen();
    };
    ws.onmessage = (ev: MessageEvent) => {
      if (this.ws !== ws) return;
      const res = decode(ev.data);
      if (res.ok) this.opts.onMessage(res.msg);
      // Undecodable frames are ignored: the relay is the only sender.
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      detach(ws);
      if (this.status !== 'closed') this.scheduleReconnect();
    };
    ws.onerror = null; // a close event always follows an error
  }

  private scheduleReconnect(): void {
    this.setStatus('reconnecting');
    const delay = backoffDelay(this.attempt);
    this.attempt += 1;
    this.timer = setTimeout(() => this.open(), delay);
  }

  /** Reconnect now instead of waiting out the backoff (unless an attempt is in flight). */
  private readonly wake = (): void => {
    if (this.status !== 'reconnecting' || this.ws || this.timer === null) return;
    clearTimeout(this.timer);
    this.open();
  };

  private readonly onVisibility = (): void => {
    if (this.opts.document?.visibilityState === 'visible') this.wake();
  };

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
