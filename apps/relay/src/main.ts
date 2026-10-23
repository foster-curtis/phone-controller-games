// Relay process entry: env vars → createRelay.
import { createRelay, type RelayOptions } from './index';

function envInt(name: string): number | undefined {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0) throw new Error(`${name} must be a non-negative integer`);
  return n;
}

const opts: RelayOptions = {
  port: envInt('PORT'),
  playerReconnectMs: envInt('PLAYER_RECONNECT_MS'),
  hostReclaimMs: envInt('HOST_RECLAIM_MS'),
  pingIntervalMs: envInt('PING_INTERVAL_MS'),
  maxMissedPings: envInt('MAX_MISSED_PINGS'),
};

const relay = await createRelay(opts);
console.log(`relay listening on :${relay.port}`);

const shutdown = () => {
  void relay.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
