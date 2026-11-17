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
  // One JSON line per connection event, no payloads or IPs (relay SPEC §3.1).
  log: process.env.RELAY_LOG === '1' ? (e) => console.log(JSON.stringify(e)) : undefined,
};

const relay = await createRelay(opts);
console.log(`relay listening on :${relay.port}`);

const shutdown = () => {
  void relay.close().then(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
