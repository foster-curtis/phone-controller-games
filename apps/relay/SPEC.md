# Relay — SPEC

> Spec for the shared, game-agnostic relay (`apps/relay`) and the client half of its protocol (`packages/net-client`).
> Every game depends on this contract: changes are **additive only**. Repo-wide rules: [`PLATFORM.md`](../../PLATFORM.md).
> Moved out of Sunny Side's `SPEC.md` §7.1 (plus the relay entries in its `BUILD_PLAN.md` §8) on 2026-10-26.
> Last updated: 2026-10-26

## 1. Role (settled)

- Rooms, join codes, host↔phone pairing, message forwarding, reconnects. **No game rules**: game payloads (`data`) are opaque to the relay and to `net-client`.
- Rooms are namespaced by game ID. In-memory only; no accounts, no DB, no origin allowlist.
- Transport: WebSockets. WebRTC DataChannels are a possible later optimization (relay doubles as signaling; WebSocket as fallback, no TURN).

## 2. Hosting & config (settled)

- **Fly.io**, one shared-cpu-1x machine, Dallas (`dfw`): Fly deprecated Denver (`den`), and Dallas is the nearest open region. Rooms live in memory, so **exactly one machine** (`fly scale count 1`).
- **Domain:** `relay.fostercurtis.dev` (custom domain on Fly), shared by all games.
- **Deploy** from the repo root: `fly deploy --config apps/relay/fly.toml --dockerfile apps/relay/Dockerfile .`. The image runs an esbuild single-file bundle (`pnpm --filter @pcg/relay bundle`), no `node_modules`.
- **HTTP:** `GET /healthz` → `200 ok` (Fly checks, Playwright readiness). Everything else is a WebSocket upgrade or 404.
- **Config** (`createRelay` options; env vars in `src/main.ts`):

| Option | Env | Default |
| --- | --- | --- |
| `port` | `PORT` | 8787 (Fly: 8080) |
| `playerReconnectMs` | `PLAYER_RECONNECT_MS` | 30 000 |
| `hostReclaimMs` | `HOST_RECLAIM_MS` | 120 000 |
| `pingIntervalMs` | `PING_INTERVAL_MS` | 5 000 |
| `maxMissedPings` | `MAX_MISSED_PINGS` | 2 |
| `maxPayloadBytes` | — | 16 KB |

## 3. Protocol

Exact types: `packages/net-client/src/protocol.ts` (frozen: additive changes only).

**Topology:** hub-and-spoke through the host. Phones only talk to the host. The relay stamps `from: playerId` on every forwarded message (phones can't spoof). Host sends to one phone (`to`) or broadcasts (no `to`); phones see host messages with `from: "host"` (`HOST_SENDER`).

**Encoding:** JSON for all messages in v1. Encode/decode lives in `net-client` (`codec.ts`) so inputs can move to binary later as a contained change.

**Rooms:**

- Created by the host with `{ game, maxPlayers }`. Relay enforces capacity (generic config, not a game rule); `maxPlayers` is floored and clamped 1–16, and counts every phone (spectators included).
- Codes: 4 letters, unambiguous alphabet (no I/O; letters only, so no 0/1), scoped per game ID. Join codes are uppercased before lookup.
- Player ids are `p1`, `p2`, … per room (never `host`).

**Roles:** fixed per socket: `create` / `reclaim` → host, `join` → phone. A message from the wrong role → `bad-request`. A failed `create` / `join` / `reclaim` replies `error` and leaves the socket open and unbound (the client may retry on it).

**Admission:** relay **auto-admits**. Host has two generic room controls:

- `lock` / `unlock`: while locked, new joins get `room-locked`; reconnects with a valid token still succeed. No ack.
- `kick(playerId)`: closes that phone's connection and invalidates its token. The phone gets `kicked`; the host gets no `peer` event (it initiated it). Kicking an unknown id is ignored.

Host `send` to an unknown or disconnected `to` is dropped silently.

**Identity & reconnect:**

- Phone join → relay issues `playerId` + reconnect token (phone stores it in `sessionStorage`). Rejoin within the player window (~30 s) reclaims the same slot.
- **Player key:** a random ID the phone generates and keeps in `localStorage`, scoped to the game ID + room code (`getPlayerKey(code, storage?, game?)`). Sent with every join and passed through to the host. Survives iOS killing the tab (which wipes `sessionStorage`), so the host can recognize a late rejoin. Opaque to the relay.
- Host gets a host token. If the host tab drops/refreshes, the room survives the host window (~120 s); the host reclaims it and receives the current roster (`{ playerId, playerKey, connected }[]`). While the host is away, phones get `{ t: "host", status: "away" }`, then `"back"` on reclaim. A phone that joins while the host is away gets `joined` then `host away`; the host learns of it only from the `reclaim` roster. If the window expires, phones get `error room-closed`.
- A token rejoin or host `reclaim` while the old socket is still open takes over the slot (old socket closed 1000, no `left` / `away`).
- Relay emits `peer` events (`joined` / `left` / `rejoined`); **the game decides** what they mean (disconnect rules, late-rejoin matching, …).

**Liveness:** relay-driven heartbeat using WebSocket ping/pong control frames (browsers answer automatically, so the envelope has no ping message). Ping every ~5 s; a socket with 2 unanswered pings at the next tick is terminated and goes through the normal close path (`peer left` / `host away`). Catches sleeping iOS phones that never close the socket.

**Envelope:**

```ts
// client → relay
{ t: "create", game, maxPlayers }              // host
{ t: "reclaim", hostToken }                    // host
{ t: "join", game, code, playerKey, token? }   // phone
{ t: "send", to?: playerId, data }             // either side (phones: `to` ignored)
{ t: "lock" } | { t: "unlock" }                // host
{ t: "kick", playerId }                        // host

// relay → client
{ t: "created", code, hostToken }
{ t: "reclaimed", code, roster }
{ t: "joined", playerId, token }
{ t: "peer", event: "joined" | "left" | "rejoined", playerId, playerKey }   // to host
{ t: "msg", from, data }
{ t: "host", status: "away" | "back" }                                      // to phones
{ t: "kicked" }
{ t: "error", code: "room-full" | "no-room" | "room-locked" | "room-closed" | "bad-request", message? }
```

### 3.1 Clients (`net-client`)

- **Reconnect:** after an unexpected close, status `reconnecting` with exponential backoff (250 ms doubling to a 4 s cap, jitter 75–100% of the ceiling); `visibilitychange`→visible or the window's `online` event retries at once (the window is injectable via `ClientEnv.window`). A socket that never opens keeps retrying with backoff.
- **Stopping for good:** `kicked` / `no-room` / `room-closed` (and `room-full` / `room-locked`) → status `closed`, reason in `closeReason`. Any error before the handshake completes rejects `start()` / `connect()` and closes. Undecodable frames are ignored. Errors surface as `RelayError` (`.code`).
- **Host reclaim:** answered by `no-room` / `room-closed` → clear the stored host token and `create` a new room (`onRoom` fires with `reclaimed: false`). `close()` keeps the host token so a reload can still reclaim.
- **Storage keys:** `pcg:hostToken:<game>`, `pcg:token:<game>:<code>`, `pcg:playerKey:<game>:<code>`. Storage failures are swallowed (the player key falls back to an in-memory key for the page).

## 4. Decision log

| # | Date | Decision | Choice | Why |
| --- | --- | --- | --- | --- |
| 1 | 2026-10-22 | Relay protocol | Hub-and-spoke, JSON, 4-letter codes, token reconnect, heartbeat, auto-admit + `lock`/`kick` | Instant joins and no pending-join state; lock/kick are room mechanics, so the relay stays game-agnostic. Rejected: host-approved joins (pending state, stalls when host is away). (Was Sunny Side #11.) |
| 2 | 2026-10-22 | Host status | Relay → phones `{ t: "host", status: "away" \| "back" }`; error codes `room-closed`, `bad-request`; `GET /healthz` | Phones need to show the host-away overlay and learn when the room dies. (Was Sunny Side #27.) |
| 3 | 2026-10-26 | Own spec | Relay spec moved out of Sunny Side's `SPEC.md` into `apps/relay/SPEC.md` | Every game depends on it; the second game shouldn't have to read the first game's spec for it. |
| 4 | 2026-10-26 | Host reclaim window | 120 s for every game (was 60 s); one relay default, no per-room option | Covers a laptop waking and rejoining Wi-Fi or a TV coming back from standby with margin. Longer buys little: the host token is in `sessionStorage`, so a closed tab or a browser crash can't reclaim at any length (moving it to `localStorage` is a separate decision), and past ~2 min players have given up on the "host away" overlay. Fort Frenzy's spec asked for ~2 min. |
