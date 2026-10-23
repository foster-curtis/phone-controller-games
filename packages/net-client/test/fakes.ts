// Test doubles: an in-memory WebSocket, Storage, document and window. No globals touched.
import type { DocumentLike, EventTargetLike, StorageLike, WebSocketCtor } from '../src/api';
import type { ClientToRelay, RelayToClient } from '../src/protocol';

export class FakeSocket {
  readyState = 0;
  readonly sent: string[] = [];
  onopen: ((ev: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  closedByClient = false;
  readonly url: string;

  constructor(url: string) {
    this.url = url;
  }

  send(data: string): void {
    if (this.readyState !== 1) throw new Error('send on a non-open socket');
    this.sent.push(data);
  }

  close(): void {
    this.closedByClient = true;
    this.readyState = 3;
  }

  // ---- test controls ----

  /** The relay accepted the connection. */
  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  receive(msg: RelayToClient): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }

  receiveRaw(data: unknown): void {
    this.onmessage?.({ data });
  }

  /** The connection dropped (network loss, relay restart, ...). */
  drop(): void {
    this.readyState = 3;
    this.onclose?.({ code: 1006 });
  }

  get messages(): ClientToRelay[] {
    return this.sent.map((s) => JSON.parse(s) as ClientToRelay);
  }

  get last(): ClientToRelay | undefined {
    return this.messages.at(-1);
  }
}

export function fakeWebSocket(): { sockets: FakeSocket[]; WebSocket: WebSocketCtor } {
  const sockets: FakeSocket[] = [];
  class Tracked extends FakeSocket {
    constructor(url: string) {
      super(url);
      sockets.push(this);
    }
  }
  return { sockets, WebSocket: Tracked as unknown as WebSocketCtor };
}

export class MemoryStorage implements StorageLike {
  readonly map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
}

export interface FakeDocument {
  doc: DocumentLike;
  setVisibility(state: DocumentVisibilityState): void;
}

export function fakeDocument(initial: DocumentVisibilityState = 'visible'): FakeDocument {
  const target = new EventTarget() as EventTarget & { visibilityState: DocumentVisibilityState };
  target.visibilityState = initial;
  return {
    doc: target as unknown as DocumentLike,
    setVisibility(state) {
      target.visibilityState = state;
      target.dispatchEvent(new Event('visibilitychange'));
    },
  };
}

export function fakeWindow(): { win: EventTargetLike; goOnline(): void } {
  const target = new EventTarget();
  return {
    win: target as unknown as EventTargetLike,
    goOnline() {
      target.dispatchEvent(new Event('online'));
    },
  };
}
