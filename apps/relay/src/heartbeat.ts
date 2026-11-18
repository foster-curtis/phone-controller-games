// Relay-driven liveness: WebSocket ping control frames (browsers answer automatically).
// Catches sleeping iOS phones that never close their socket.
import type { WebSocket, WebSocketServer } from 'ws';

export interface Heartbeat {
  stop(): void;
}

/** Called just before a socket is terminated for missed pings (for the connection log). */
export type OnTerminate = (ws: WebSocket) => void;

/**
 * Every `intervalMs`, each socket gets a ping. A socket that has `maxMissed` pings
 * outstanding at the next tick is terminated (its `close` handler then runs as usual).
 */
export function startHeartbeat(
  wss: WebSocketServer,
  intervalMs: number,
  maxMissed: number,
  onTerminate: OnTerminate = () => {},
): Heartbeat {
  const missed = new WeakMap<WebSocket, number>();

  wss.on('connection', (ws) => {
    missed.set(ws, 0);
    ws.on('pong', () => missed.set(ws, 0));
    // Any inbound frame is liveness too (relay SPEC §3, decision #5).
    ws.on('message', () => missed.set(ws, 0));
  });

  const timer = setInterval(() => {
    for (const ws of wss.clients) {
      const n = missed.get(ws) ?? 0;
      if (n >= maxMissed) {
        onTerminate(ws);
        ws.terminate();
        continue;
      }
      missed.set(ws, n + 1);
      try {
        ws.ping();
      } catch {
        onTerminate(ws);
        ws.terminate();
      }
    }
  }, intervalMs);

  return { stop: () => clearInterval(timer) };
}
