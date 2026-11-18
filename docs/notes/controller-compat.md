# Controller compatibility: diagnosis and contracts

Branch `fix/controller-compat`, written at F0 (2026-11-17). Two play-test findings from Sunny Side Slam:

1. One player on **DuckDuckGo 5.302.0 (Pixel 10, Android)** kept getting disconnected; everyone else was fine.
2. On Apple devices, automatic full screen never showed anything.

## 1. Diagnosis: the DuckDuckGo disconnects (ranked)

Nothing here was reproduced on the device yet; the ranking is from the code and from platform research.
Checkpoint A (the LAN harness, the `?debug=1` overlay and the relay log) is where it gets confirmed.

| #   | Cause                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Likelihood      | Evidence                                                                                                                                                                                                                                                              |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **The screen sleeps because Wake Lock is missing.** DuckDuckGo on Android draws pages with the system WebView, not Chrome. Wake Lock support in WebView is unconfirmed (caniuse has no WebView row; Chrome for Android has it). Without it, the phone dims and locks during quiet stretches (lobby, between rounds, watching the TV). The page is then backgrounded, it stops answering the relay's pings, and the relay drops it after 10–15 s (`PING_INTERVAL_MS` 5 000 × `MAX_MISSED_PINGS` 2). | High            | `controller-kit/src/platform/wakeLock.ts` skips silently when `navigator.wakeLock` is missing, and nothing tells the player. Chrome players held the lock, so their screens never slept. That explains "only that player" and "kept" (it repeats every idle stretch). |
| 2   | **The phone never notices that its socket is dead.** It amplifies #1 and is proven in the code. After the relay drops a sleeping phone, the phone often gets no `close` event (a half-open socket), so its status stays `open`. When the phone wakes, `visibilitychange` retries only if the status is already `reconnecting`. The phone keeps sending input into a dead socket, with no "Reconnecting…" overlay, until the OS gives up on the TCP connection, which can take minutes.             | High            | `net-client/src/connection.ts`: no app-level ping and no timeout; `wake()` returns early unless the status is `reconnecting`; no `pageshow`, `resume` or `focus` handling.                                                                                            |
| 3   | **The reconnect window runs out.** A phone asleep for more than 30 s (`PLAYER_RECONNECT_MS`) loses its relay slot. Its token rejoin gets a new player id, and Sunny Side matches it by player key: the score is kept, but the player spectates until the next round (Sunny Side SPEC §6.3). To the player that looks like being dropped.                                                                                                                                                           | Medium          | `apps/relay/src/rooms.ts` `join()` falls through to a new slot once the player has been removed; Sunny Side SPEC §6.3 / decision #12.                                                                                                                                 |
| 4   | **The token is lost when WebView is recreated.** If DuckDuckGo throws away a background tab's WebView, `sessionStorage` (the reconnect token) goes with it, and the rejoin becomes a new join (as in #3).                                                                                                                                                                                                                                                                                          | Low–medium      | `controller-client.ts` keeps the token in `sessionStorage`. Unverified whether DuckDuckGo discards tabs on a Pixel 10.                                                                                                                                                |
| 5   | **Full screen on every tap inside WebView.** Every `pointerup` called `requestFullscreen`. In a WebView without full-screen support it is rejected (and that was caught). In one with support, full screen goes through the app's custom view, and the layout jumps on every tap. Removed in this branch anyway.                                                                                                                                                                                   | Low             | `controller-kit/src/platform/fullscreen.ts` (guarded: feature-detected, `.catch`, `try`).                                                                                                                                                                             |
| 6   | **Unguarded APIs break startup.**                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Low (ruled out) | Every Wake Lock, full-screen, orientation and storage call is already feature-detected or wrapped. No vibration or motion APIs are used anywhere.                                                                                                                     |
| 7   | **Fly proxy idle timeout or autostop.**                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Low (ruled out) | `fly.toml` has `auto_stop_machines = "off"`, and the relay pings every 5 s, so a socket is never idle. It would have hit everyone, not one browser.                                                                                                                   |
| 8   | **Tracker blocking (DuckDuckGo, Brave, Firefox ETP).**                                                                                                                                                                                                                                                                                                                                                                                                                                             | Low (ruled out) | The relay is `relay.fostercurtis.dev`, the same site as every game (first party). The controller page loads no third-party scripts: fonts come from Google Fonts CSS, and analytics are on the gallery only.                                                          |

### Which fix covers which cause

| Fix                                                                                                                                                                                          | Milestone | Covers |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------ |
| App-level ping/pong on both ends. A phone counts its socket as dead when a ping goes unanswered for 12 s, then reconnects.                                                                   | F1        | #1, #2 |
| Probe on `visibilitychange`→visible, `pageshow`, `online`, `resume` and `focus`: an open socket must answer a ping within 3 s or it is replaced at once; a reconnecting one retries at once. | F1        | #1, #2 |
| Connect timeout (8 s) for sockets stuck while connecting after a network change.                                                                                                             | F1        | #2     |
| A token rejoin takes over the slot even while the relay still thinks the old socket is alive (existing behavior, now covered by tests), so there are no duplicate players.                   | F1        | #2     |
| Wake Lock taken again on every return to visible, plus a one-time "Keep your screen on" hint where it's missing or refused.                                                                  | F2        | #1, #3 |
| `?debug=1` diagnostics overlay with **Copy diagnostics**, plus a per-socket relay log in dev, to confirm #1 and #4 on the real phone.                                                        | F2, F1    | all    |
| No automatic full screen; a manual button instead.                                                                                                                                           | F3, F5    | #5     |

Not changed: the 30 s reconnect window and the `sessionStorage` token (#3, #4). Both are relay and
game decisions (relay SPEC decision #4; Sunny Side's late-rejoin rule). If Checkpoint A shows #3 is
still common after the fixes, that's a decision for the user, not this branch.

## 2. Contracts (frozen at F0: additive changes only; log every addition below)

### Relay protocol (`packages/net-client/src/protocol.ts`, relay SPEC §3)

- Client → relay `{ t: "ping", n }`: allowed from any socket, in any state. The relay answers that socket with `{ t: "pong", n }`.
- Handshake replies (`created`, `reclaimed`, `joined`) carry `heartbeat: true` from relays that answer `ping`.
- **Compatibility:** clients ping only after seeing `heartbeat: true`, so a new client against the old relay behaves exactly as before. Old clients never ping, so they never see a `pong`, and the extra field is ignored by the old decoder. **`PROTOCOL_VERSION` is unchanged**; there is no relay-wide version, and Fort Frenzy's game protocol is untouched. Deploy the relay first.
- Relay: any inbound frame or WS pong counts as liveness for the existing ping-frame heartbeat.

### `@pcg/net-client` (`api.ts`)

- `HeartbeatOptions { intervalMs 5000, timeoutMs 12000, probeTimeoutMs 3000, connectTimeoutMs 8000 }`, `HEARTBEAT_DEFAULTS`, and `ClientEnv.heartbeat` / `ClientEnv.now`.
- `getStats(): ConnectionStats` on both clients: `status`, `reconnects`, `failedAttempts`, `lastClose { cause, code, reason, wasClean, at }`, `rttMs`, `heartbeat`, `lastMessageAt`, `openSince`.
- `CloseCause = socket | heartbeat-timeout | probe-timeout | connect-timeout | local`.
- `ConnectionStatus` is unchanged (`reconnecting` already drives the phone overlay).
- Resume: unchanged. A token rejoin within the window keeps the same `playerId` (`peer rejoined`) and takes over a socket that is still open.
- Heartbeat rules (F1): one outstanding ping at a time. A ping counts as dead only if it is older than `timeoutMs` **and** nothing has arrived since it was sent. It is never measured from the last frame received, so a throttled background tab can't trip it. Lifecycle events probe or wake the connection, and repeated events never open a second socket.

### `@pcg/relay` (`createRelay` / `RelayOptions`)

- `log?: (e: RelayLogEvent) => void`, and `RelayLogEvent` (kinds `connect`, `create`, `reclaim`, `join`, `rejoin`, `close`, `kick`, `player-expired`, `room-closed`, `error`; a per-socket `conn` number; the user agent on `connect` only; no payloads and no IP addresses).
- `main.ts`: `RELAY_LOG=1` prints one JSON line per event.

### `@pcg/game-kit`

- `capabilities.ts` (written at F0): `detectCapabilities()`, `isStandalone()`, `fullscreenApi()` (standard + `webkit`; never throws or rejects).
- `fullscreen.ts` (F3): `createHostFullscreenButton({ parent, … })` → `{ element, supported, setVisible, toggle, destroy }`, `bindFullscreenShortcut()` (`F`), and the label constants.
- `webapp.ts`, exported from `@pcg/game-kit/vite` (F3): `webApp()` generates `/play.webmanifest` (`start_url` `/play`, `display` `fullscreen`, `display_override` `[fullscreen, standalone]`), points `play.html` at it, and adds the home-screen meta tags to both pages.
- `e2e.ts` (F4, additive): phone context options per browser, and the hostile-environment fixtures.

### `@pcg/controller-kit`

- `widgets/fullscreenButton.ts` (F3): `createFullscreenButton({ variant: 'inline' | 'corner', corner?, landscape?, text?, overlayHost? })` → `{ element, mode, destroy }`, plus `FULLSCREEN_TEXT`.
- `shell/installSheet.ts` (F3): `openInstallSheet(host, text)`.
- `platform/keepAwake.ts` (F2): `createKeepAwakeHint({ host, wakeLock })`, `KEEP_AWAKE_TEXT`, `KEEP_AWAKE_SEEN_KEY`.
- `platform/wakeLock.ts` (F2, additive): `WakeLock.supported` and `WakeLock.held` getters.
- `diagnostics/overlay.ts` (F2): `createDiagnosticsOverlay()`, `diagnosticsEnabled()` (`?debug=1`), `formatDiagnostics()`, and the `DiagnosticsReport` shape.
- `platform/toast.ts` (written at F0): `showToast(host, text)`.
- Shell (written at F0): automatic full screen is off (`platform.fullscreen` is deprecated, default false). New options `fullscreenButton` (default on), `fullscreenCorner` (default `top-right`), `keepAwakeHint`, `diagnostics`, `fullscreenText`, `keepAwakeText`, `game`, `version`. The `landscape` option now locks only after the player enters full screen. `AppShell` gains `fullscreenButton` and `toast()`. `controller-kit` now depends on `@pcg/game-kit` (phones already bundle it for `relayUrl`).

### Styling

The kits set layout only (position, size of at least 44 px, stacking, safe-area insets). Each game
styles the class hooks `.pcg-fullscreen-btn`, `.pcg-fullscreen-corner`, `.pcg-sheet`,
`.pcg-sheet-card`, `.pcg-hint`, `.pcg-toast` and `.pcg-diag*` with its brand tokens (F5).

## 3. File ownership

| Milestone         | Owns                                                                                                                                                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1                | `packages/net-client/**`, `apps/relay/**` (code and tests; F0 wrote the relay SPEC lines)                                                                                                                                                        |
| F2                | `controller-kit`: `src/platform/wakeLock.ts`, `src/platform/keepAwake.ts`, `src/diagnostics/**`, `src/dev.ts` (`getStats` on the dev fake), and new tests for those                                                                              |
| F3                | `controller-kit`: `src/platform/fullscreen.ts`, `src/platform/orientation.ts`, `src/widgets/fullscreenButton.ts`, `src/shell/installSheet.ts`; `game-kit`: `src/fullscreen.ts`, `src/webapp.ts`; `scripts/check-routes.mjs`; new tests for those |
| F4                | `game-kit/src/e2e.ts` (+ new `src/e2e-*.ts`), `apps/*/playwright.config.ts`, `apps/*/e2e/helpers.ts` (fixtures only), root `package.json`, `pnpm-lock.yaml`, `scripts/dev-https.mjs`, `.github/workflows/ci.yml`                                 |
| F5                | `apps/<game>/**`, one agent per game (after F2, F3 and F4 merge)                                                                                                                                                                                 |
| F0 / orchestrator | both kits' `index.ts`, `shell/app.ts`, `platform/toast.ts`, `game-kit/src/capabilities.ts`, `protocol.ts` / `api.ts` declarations, `PLATFORM.md`, relay `SPEC.md`, this note                                                                     |

## 4. Contract additions after F0

| Milestone | Addition                                                                                                                                                                                                                                         | Why                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| F2        | `WakeLock.supported`, `WakeLock.held` (planned at F0)                                                                                                                                                                                            | The hint and the diagnostics need to know whether the lock is held.                                                        |
| F2        | `createWakeLock(nav, secure, doc, win?)`: a fourth optional `win`                                                                                                                                                                                | It re-takes the lock on `pageshow` and `focus` too, and needs the window to listen on.                                     |
| F2        | `DiagnosticsReport.extra?`                                                                                                                                                                                                                       | It carries `DiagnosticsOptions.extra` rows into the copied report.                                                         |
| F3        | none public. `buildControllerManifest`, `transformWebAppHtml` and their types are exported from `webapp.ts` for tests only, not from `@pcg/game-kit/vite`                                                                                        | They keep the plugin's transforms unit-testable without Vite.                                                              |
| F4        | `@pcg/game-kit/e2e`: `phoneContextOptions`, `PhoneBrowser`, `removeApis`, `RemovableApi`, `installSocketControl`, `dropSockets`, `halfOpenSockets`, `setVisibility`, `setOffline`, `simulateBfcacheRestore`, `collectPageErrors` (planned at F0) | The cross-browser and hostile-environment e2e. The socket fixtures leave Vite's `vite-hmr` / `vite-ping` sockets alone.    |
| F2-fix-1  | `KEEP_AWAKE_HINT_MS` (8 000): the hint hides itself, and only its dismiss button takes taps                                                                                                                                                      | In e2e, the hint covered and blocked Say Cheese's Ready button. On a phone without Wake Lock it would block real controls. |
