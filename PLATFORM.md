# Phone Controller Games — PLATFORM

> Repo-wide spec: what every game and the relay share. Only **decided** items go here.
> Each game's design lives in `apps/<game>/SPEC.md`; the relay and its protocol in [`apps/relay/SPEC.md`](apps/relay/SPEC.md).
> Last updated: 2026-10-26

## 1. Overview

A series of same-room party games. A shared screen (TV/laptop browser) runs the game (the **host**); phones act as controllers via a web page (room code or QR, no install). Host and phones never talk directly: every message goes through one shared, game-agnostic **relay**.

| Game | App | Status |
| --- | --- | --- |
| Sunny Side Shove | `apps/sunny-side` | Shipped (v1) |
| Fort Frenzy | `apps/fort-frenzy` | Planning |

## 2. Architecture (settled)

- **Same-room only.** No remote/online play.
- **Host-authoritative.** Host browser runs the full simulation and rendering.
- **Phones send input state only** (joystick vector + button bits) at ~20–30 Hz or on change. Never discrete move commands.
- **Game-agnostic relay server**: rooms, join codes, host↔phone pairing, message forwarding, reconnects. No game rules. Rooms namespaced by game ID. In-memory only; no accounts, no DB. Spec: [`apps/relay/SPEC.md`](apps/relay/SPEC.md).
- **Transport:** WebSockets. WebRTC DataChannels are a possible later optimization (relay doubles as signaling; WebSocket as fallback, no TURN).

## 3. Phone controller requirements (settled)

- `touch-action: none`, locked viewport
- Wake Lock
- Robust reconnect handling
- Large, simple controls (players watch the TV)
- No reliance on vibration (unsupported on iOS Safari)
- Gyro, if ever used, needs HTTPS + iOS permission prompt

## 4. Hosting & repo (settled)

- **Relay:** one deployment shared by all games at `relay.fostercurtis.dev` (hosting details: relay SPEC §2).
- **Frontends:** static Vite builds on Vercel, one subdomain of fostercurtis.dev per game. Each game's spec names its domain and its game ID (the relay namespace).
- **Repo:** pnpm monorepo:

```
apps/
  relay/            Node WebSocket server → Fly.io
  <game>/           Vite multi-page app → Vercel
    index.html        host (TV)
    play.html         controller (phone): never loads the host's engine
    src/host/  src/controller/  src/shared/
    SPEC.md  BUILD_PLAN.md
packages/
  net-client/       protocol types + host & controller clients
PLATFORM.md  tsconfig.base.json  pnpm-workspace.yaml
```

- Controller is a separate Vite entry (not a route) so phones never download the host's engine (`check:bundle` enforces this for Phaser). QR → `/play?code=XXXX`.
- Relay lives under `apps/` (deployable), not `packages/`.
- **Shared code:** `packages/` only holds code that two or more apps really use. Sunny Side kept `controller-kit` / `game-kit` as folders inside the game; extract them when the second game shows what's actually common.
- **Docs:** this file for repo-wide rules; `apps/relay/SPEC.md` for the relay; each game keeps its own `SPEC.md` (design) and `BUILD_PLAN.md` (build plan) in its app folder.
- **Scripts:** per-game root scripts (`dev:<game>`, `dev:lan:<game>`, `build:<game>`, `e2e:<game>`, `check:<game>`). Work on one game runs only that game's build, e2e and check; the full `pnpm check` + `pnpm e2e` run before anything lands on `main`. Work that touches the relay or `packages/` affects every game and always runs the full set.

## 5. Decision log

| # | Date | Decision | Choice | Why |
| --- | --- | --- | --- | --- |
| 1 | 2026-10-22 | Repo layout | `apps/relay`, `apps/<game>` (multi-page host + controller), `packages/net-client`; kits deferred; relay at `relay.fostercurtis.dev` | Relay contract is the one settled shared boundary; everything else waits for a second consumer. Separate controller entry keeps phone joins fast. (Was Sunny Side #7.) |
| 2 | 2026-10-26 | Spec split | Repo-wide spec at root `PLATFORM.md`; relay at `apps/relay/SPEC.md`; each game's `SPEC.md` + `BUILD_PLAN.md` in its app folder | A second game is starting; the shared architecture and the relay protocol shouldn't live inside one game's spec. |
| 3 | 2026-10-26 | Per-game scripts | `dev:` / `build:` / `e2e:` / `check:<game>`; full `pnpm check` + `pnpm e2e` only before landing on `main` (or after touching shared code) | Work on one game shouldn't pay for, or be blocked by, another game's build and e2e. |
