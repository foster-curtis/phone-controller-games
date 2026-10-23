# BUILD_PLAN: Sunny Side Shove

Orchestration plan for building `SPEC.md`. The orchestrator reads **only this file**. Subagents read their
milestone entry plus the spec sections it names. All commands are POSIX sh (Git Bash on Windows), run
from the repo root unless they say otherwise.

## 0. Sessions

The user runs `/clear` between sessions and pastes the §10 kickoff prompt to start each one.

| Session | Runs | Ends at |
| --- | --- | --- |
| S1 | Pre-flight → **M0** (main checkout) → **M1 ∥ M2 ∥ M3 ∥ M4 ∥ M5** (worktrees). Merge M1 before M2 (M2's integration check is pending M1). | **C1**: controller on real phones (M5) |
| S2 | C1 notes → **M5-fix-k** ∥ **M6** (worktrees; disjoint: controller vs host). If C1 has no notes, M6 alone in the main checkout. | **C2**: LAN play-test of a full match |
| S3 | C2 notes routed per §5 rule 9 → fix milestones (sim/match/controller/host wiring) ∥ **M7** (TV presentation; visual notes fold into M7) | **C3**: TV presentation review |
| S4 | C3 notes → **M7-fix-k** → final test-runner pass on `main` → print §9 Final handoff | Final handoff printed |

## 1. Pre-flight checklist

| Item | Check command | Blocks |
| --- | --- | --- |
| On `main`, clean tree | `test "$(git branch --show-current)" = main && test -z "$(git status --porcelain)"` | all |
| Node ≥ 22 (global `WebSocket`) | `node -e "process.exit(+process.versions.node.split('.')[0]>=22?0:1)"` | all |
| pnpm 10.x | `pnpm --version` prints `10.` | all |
| npm registry reachable | `npm view phaser@4 version` prints `4.` | M0, any milestone adding a dep |
| Install + Standard checks green on `main` | `pnpm install --frozen-lockfile && pnpm check` | M1+ (skip until M0 is merged) |
| Worktrees gitignored | `git check-ignore -q .claude/worktrees/x` | parallel milestones (after M0) |
| Docker daemon running | `docker info >/dev/null 2>&1` | M1 |
| Playwright Chromium installed | `pnpm --filter @pcg/sunny-side exec playwright install chromium` (one-time download, ~150 MB) | M6, M7 |
| Dev/test ports free (4173 5173 5174 8787 8788 8789) | command (P) below the table | M0, M1, M6, M7 |
| Unattended permissions | Session is in auto mode, **or** `.claude/settings.local.json` has the allowlist below | all |
| LAN firewall rule (user, admin PowerShell: `netsh advfirewall firewall add rule name=pcg-dev dir=in action=allow protocol=TCP localport=5173,8787 profile=private`) | `netsh advfirewall firewall show rule name=pcg-dev` | C1, C2, C3 |
| PC + phones on the same Wi-Fi, Windows network profile = Private | user confirms | C1, C2, C3 |
| flyctl, Vercel CLI, accounts, DNS access for `fostercurtis.dev` | `fly version && vercel --version` | Final handoff only |

(P) ports check, which must print nothing:

```sh
netstat -ano | grep LISTENING | grep -E ':(4173|5173|5174|8787|8788|8789) '
```

Allowlist (only needed if not running in auto mode):

```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm *)", "Bash(node *)", "Bash(npm view *)", "Bash(docker build *)", "Bash(docker run *)",
      "Bash(docker rm *)", "Bash(docker info*)", "Bash(curl -s*)", "Bash(git status*)", "Bash(git log*)",
      "Bash(git diff*)", "Bash(git add *)", "Bash(git commit *)", "Bash(git switch *)", "Bash(git checkout *)",
      "Bash(git rebase *)", "Bash(git merge --ff-only *)", "Bash(git worktree *)", "Bash(git branch*)",
      "Bash(git check-ignore *)", "Bash(netstat *)", "Bash(grep *)", "Bash(ls *)", "Edit", "Write"
    ],
    "deny": ["Bash(git push*)"]
  }
}
```

## 2. Branches, merging, verification

- The orchestrator stays on `main`. Nothing is pushed until the Final handoff (the user pushes).
- Each milestone works on `build/mN-<slug>` (slugs are in the §3 table). Fixes after checkpoint feedback go on `build/mN-fix-<k>`.
- Subagent flow: commit → run Acceptance → tick its own Progress items in this file → `git rebase main` → rerun Acceptance if the rebase pulled anything in → report.
- Orchestrator merges with `git merge --ff-only build/mN-<slug>`. If that fails, it resumes the same subagent (SendMessage) to rebase and rerun Acceptance.
- Rebase conflict rules:
  - `BUILD_PLAN.md` Blockers / Build decisions: keep both sides.
  - Additive edits to a frozen contract file (both sides appended): keep both sides, then rerun Acceptance.
  - `pnpm-lock.yaml`: take `main`'s version, run `pnpm install`, commit the regenerated lockfile.
- Parallel milestones run in git worktrees (`isolation: "worktree"`, under `.claude/worktrees/`). M0 gitignores that directory and excludes it from ESLint, Prettier, Vitest and tsc.
- **Standard checks** (part of every milestone's Acceptance; CI only runs on push):
  `pnpm install --frozen-lockfile && pnpm check`
  where `pnpm check` = `typecheck && lint && format:check && test && build && check:bundle && check:routes` (all defined by M0).
- **E2E checks** (from M6 on): `pnpm e2e` (Playwright, Chromium only; it starts its own relay on 8788 and Vite on 5174).
- **Deferred checks**: a milestone may report "done, checks pending M#". The orchestrator merges M# first, then resumes the milestone to rebase and run its full Acceptance before merging it.

## 3. Milestones

| # | Milestone (branch slug) | Model | Parallel with | User checkpoint |
| --- | --- | --- | --- | --- |
| M0 | Scaffold + contracts (`scaffold`) | opus | none (serial) | no |
| M1 | Relay server (`relay`) | opus | M2, M3, M4, M5 | no |
| M2 | net-client (`net-client`) | opus | M1, M3, M4, M5 (integration check pending M1) | no |
| M3 | Match flow (`match`) | opus | M1, M2, M4, M5 | no |
| M4 | Simulation (`sim`) | opus | M1, M2, M3, M5 | no |
| M5 | Controller UI (`controller`) | sonnet | M1, M2, M3, M4 | **C1**: phone layout and touch feel in offline dev mode |
| M6 | Host app + wiring + e2e (`host`) | opus | M5-fix-k | **C2**: full LAN play-test (feel, flow, reconnect) |
| M7 | TV presentation (`presentation`) | sonnet | C2 fix milestones outside `src/host/scenes`, `src/host/render` | **C3**: TV visuals and readability |

**Dependency graph** (every edge points back):
`M0 → {M1, M2, M3, M4, M5}` · `M1 → M2 (integration check only)` · `{M1, M2, M3, M4, M5} → M6 → C2 → M7 → C3`.
C1 gates only M5-fix-k, not M6 (M6 never edits `src/controller/`).

**File ownership in the parallel wave** (all disjoint):
M1 `apps/relay/**` · M2 `packages/net-client/**` · M3 `apps/sunny-side/src/host/match/**` ·
M4 `apps/sunny-side/src/host/sim/**`, `apps/sunny-side/src/host/loop/**` · M5 `apps/sunny-side/src/controller/**`, `apps/sunny-side/play.html`.
`src/shared/**`, package manifests and the lockfile are M0's. Wave milestones may change them only additively (see Freeze points); conflicts resolve per §2.

**Freeze points** (after the merge, later milestones may only **add** to these, and log `- [M#] contract+: …` under Build decisions):

- **F0 (M0 merged):** `packages/net-client/src/protocol.ts`, `packages/net-client/src/api.ts`, `apps/relay/src/index.ts` (`createRelay` / `RelayOptions` signature), `apps/sunny-side/src/shared/messages.ts`, `apps/sunny-side/src/shared/theme.ts` (token names), `apps/sunny-side/src/host/sim/types.ts`, `apps/sunny-side/src/host/match/types.ts`, ESLint boundary rules.
- **F1 (M1 merged):** relay wire behavior and env var names (`PORT`, `PLAYER_RECONNECT_MS`, `HOST_RECLAIM_MS`, `PING_INTERVAL_MS`, `MAX_MISSED_PINGS`).
- **F2 (M4 merged):** `SimSnapshot` field meanings (M6/M7 render from them).
- Tuning constants (`src/host/sim/config.ts`, `src/host/match/config.ts`) are **never** frozen; checkpoints tune them.

---

### M0: Scaffold + contracts

- **Goal:** pnpm monorepo per SPEC §4 with all tooling, all anticipated deps, check scripts and the F0 contract files, so M1–M5 build in parallel against a fixed surface.
- **Read:** SPEC §2, §4, §5, §6.7 (state list), §6.8, §7.1, §7.2, §7.3, §8; this file's §2, §3 (Freeze points) and §8 Build decisions.
- **Depends on:** Pre-flight.
- **Order:** commit 1 = scaffold + tooling + deps; commit 2 = contract files; commit 3 = SPEC.md edits.
- **Deliverables:**
  - Root: `package.json` (`engines.node >=22`; scripts `check typecheck lint format format:check test build check:bundle check:routes dev dev:lan e2e`), `pnpm-workspace.yaml`, `tsconfig.base.json` (strict), `eslint.config.js` (flat + typescript-eslint), `.prettierrc`, `.prettierignore`, `.gitignore` (`node_modules dist .claude/worktrees/ playwright-report test-results apps/sunny-side/e2e/__screens__`), `.github/workflows/ci.yml` (Standard checks on push), `README.md` (dev, `dev:lan`, test commands).
  - Exact-pinned deps (latest compatible): `typescript@5.9.x`, `vite@8`, `vitest@5`, `jsdom`, `eslint`, `typescript-eslint`, `prettier`, `tsx`, `concurrently`, `ws` + `@types/ws` (relay), `phaser@4.2.x`, `matter-js@0.20` + `@types/matter-js`, `qrcode` + `@types/qrcode`, `@playwright/test`.
  - `apps/relay` (`@pcg/relay`): `src/index.ts` exporting `RelayOptions` + `createRelay(opts): Promise<{ port: number; close(): Promise<void> }>` (stub throws), `src/main.ts` (reads env, calls `createRelay`), `dev`/`start` scripts, 1 placeholder test.
  - `packages/net-client` (`@pcg/net-client`, consumed as TS source via `exports`): `src/protocol.ts` (§7.1 envelope + Build decisions additions, `ROOM_CODE_ALPHABET`, `RelayErrorCode`, `RosterEntry`), `src/api.ts` (`HostClient`, `ControllerClient`, `ConnectionStatus`, `createHostClient`, `createControllerClient`, `getPlayerKey` with stub bodies; WebSocket ctor, storage and document injectable), `src/index.ts`.
  - `apps/sunny-side` (`@pcg/sunny-side`): `index.html` (`<body data-entry="host">`), `play.html` (`<body data-entry="controller">`, viewport `user-scalable=no`), `vite.config.ts` (MPA inputs, `build.manifest: true`, `server.host: true`, middleware rewriting `/play` → `/play.html` in dev **and** preview), `vercel.json` (`cleanUrls: true`), `src/shared/messages.ts` (`GAME_ID`, `EMOJI`, `InputTuple`, `isInput`, `ControllerMsg` per §7.3, `HostMsg` with a `Screen` union holding one variant per host-driven §6.7 state: lobby, countdown, playing, eliminated, ghost, spectating, results, matchEnd, gamePaused, left; the payload carries `isLeader`, standings, round and colors), `src/shared/theme.ts` (placeholder tokens incl. 8 player colors, `toCssVars()`), `src/shared/relayUrl.ts`, `src/host/sim/types.ts` (`Sim`, `SimEvent`, `SimSnapshot`, `createSim` stub), `src/host/match/types.ts` (`Match`, `MatchDeps { sim, send, kick, storage }`, `MatchView`, `MatchEvent`, `createMatch` stub), `src/host/main.ts` (boots an empty Phaser 4 scene), `src/controller/main.ts` (placeholder), Vitest config (node env; jsdom for `src/controller/**`).
  - `scripts/check-bundle.mjs` (reads the Vite manifest; fails if any chunk reachable from `play.html` contains Phaser), `scripts/check-routes.mjs` (starts `vite preview` programmatically on 4173; asserts `/`→host marker, `/play` and `/play?code=ABCD`→controller marker).
  - ESLint boundaries (`no-restricted-imports`): `src/host/sim/**` and `src/host/match/**` must not import `phaser` or `@pcg/net-client`; `src/controller/**` must not import `phaser` or `src/host/**`; `packages/**` must not import from `apps/**`.
  - SPEC.md: §5 says standalone `matter-js` (Phaser renders only); decision-log row 12 says "matching by player key"; add rows 26–27 for the two spec-changing Build decisions (standalone matter-js; relay `host` status event + `room-closed`).
- **Acceptance:**
  - Standard checks pass.
  - `ls apps/sunny-side/dist/index.html apps/sunny-side/dist/play.html` succeeds.
  - Negative probes (run once, then revert): adding `import 'phaser'` to `src/controller/main.ts` makes `pnpm check:bundle` exit non-zero; a file `src/host/sim/__probe.ts` importing `phaser` makes `pnpm lint` exit non-zero.
  - `git check-ignore -q .claude/worktrees/x && echo ok` prints `ok`.
  - `grep -n "matter-js" SPEC.md` shows the updated §5 line; `grep -c "^| 2[67] " SPEC.md` prints `2`.
- **Risks / fallbacks:**
  - Vite may not serve `/play` for MPAs → custom `configureServer` + `configurePreviewServer` middleware (required, not optional).
  - typescript-eslint requires TS < 6.1 → pin TS 5.9 (do not use TS 7).
  - Phaser 4 ESM import shape: use `import * as Phaser from 'phaser'` if the default import fails; log it.
  - Windows: scripts use `node:path`/`node:url`, no shell globs or `rm -rf`.
- **Leave out:** any real logic (rooms, reconnect, sim, match, UI), Dockerfile / fly.toml (M1).

### M1: Relay server

- **Goal:** game-agnostic WebSocket relay per SPEC §7.1 plus the relay Build decisions, deployable to Fly.
- **Read:** SPEC §2, §4 (relay bullets), §7.1; `packages/net-client/src/protocol.ts`; `apps/relay/src/index.ts`; §8 Build decisions tagged relay.
- **Depends on:** M0.
- **Order:** test-first per behavior group; fly.toml + Dockerfile last.
- **Deliverables:** `apps/relay/src/{index,rooms,codes,heartbeat,http,main}.ts`; `apps/relay/test/{rooms,admission,reconnect,host-reclaim,heartbeat,robustness}.test.ts`; `apps/relay/Dockerfile` (build context = repo root); `.dockerignore`; `apps/relay/fly.toml` (app `pcg-relay`, `primary_region = "den"`, `internal_port = 8080`, `auto_stop_machines = "off"`, `min_machines_running = 1`, HTTP check `GET /healthz`).
- **Acceptance:**
  - Standard checks pass.
  - `pnpm --filter @pcg/relay test` passes, with at least one `it` for each of the following: code has 4 chars from `ROOM_CODE_ALPHABET`; codes are scoped per game (join with the wrong game → `no-room`); join → `joined` + host gets `peer joined` with `playerKey`; a phone's `send` reaches the host with `from` = relay-assigned id (any spoofed `from` is ignored); host `send` with `to` reaches only that phone; broadcast reaches all phones and not the host; `room-full` at `maxPlayers`; locked → new join gets `room-locked` while a token reconnect succeeds; `unlock`; `kick` → `kicked` + socket closed + token no longer reclaims the slot; phone drop → `peer left`; token rejoin inside the window → same `playerId` + `peer rejoined`; after the window → new `playerId` + `peer joined`; host drop → phones get `host away`; reclaim inside the window → `reclaimed` with roster + phones get `host back`; after the window → phones get `error room-closed` and are closed, and the code then returns `no-room`; a client that never answers pings (`ws` option `autoPong: false`) is dropped after `maxMissedPings` intervals; malformed JSON or unknown `t` → `error bad-request` and the socket stays open; a payload larger than `maxPayloadBytes` → socket closed; a phone sending host-only messages (`create`/`lock`/`kick`) → `error bad-request`; `GET /healthz` → 200.
  - `docker build -f apps/relay/Dockerfile -t pcg-relay .` succeeds.
  - `docker run --rm -d -p 8789:8080 --name pcg-relay-test pcg-relay && sleep 3 && curl -sf localhost:8789/healthz; docker rm -f pcg-relay-test` prints a 2xx body.
- **Risks / fallbacks:**
  - Fake timers with real sockets are flaky → use real timers with tiny `createRelay` opts (e.g. ping 50 ms, windows 200 ms).
  - The pnpm workspace inside Docker → `pnpm deploy --filter @pcg/relay --prod`, or bundle with esbuild into one file; pick whichever builds first try and log it.
  - Fly HA defaults create 2 machines, which would split in-memory rooms → fly.toml as above + Final handoff runs `fly scale count 1`.
  - Code collisions: retry generation (24⁴ ≈ 330k codes).
- **Leave out:** game rules, persistence, auth, origin allowlist, rate limiting beyond `maxPayloadBytes`, WebRTC (SPEC §2).

### M2: net-client

- **Goal:** browser host and controller clients over the relay with reconnect behavior per SPEC §3 and §7.1.
- **Read:** SPEC §3, §7.1, §7.2 (encoding note only); `packages/net-client/src/{protocol,api}.ts`; `apps/relay/src/index.ts` (signature only).
- **Depends on:** M0. Integration test pending M1.
- **Order:** unit tests with a fake WebSocket first; `integration.test.ts` last. If M1 isn't merged yet, report "done, checks pending M1".
- **Deliverables:** `packages/net-client/src/{codec,host-client,controller-client,player-key,backoff}.ts`; `test/{codec,host-client,controller-client,player-key}.test.ts`; `test/integration.test.ts` (real `createRelay` on port 0 with tiny timeouts, Node's global `WebSocket`); `@pcg/relay` as a devDependency.
- **Acceptance:**
  - Standard checks pass (after M1 is merged).
  - Unit tests cover: codec round-trip, and decoding non-JSON returns an error instead of throwing; host `create` stores `hostToken` in the injected storage; on host reconnect the client sends `reclaim` and emits the roster; controller `join` sends `playerKey` + stored token; the token is saved to the injected session storage; an unexpected close → status `reconnecting` + exponential backoff (250 ms → 4 s cap, jitter); `kicked` / `room-closed` / `no-room` → no reconnect, status `closed` with a reason; `visibilitychange`→visible and `online` trigger an immediate reconnect attempt; `getPlayerKey` is stable per (game, code) and differs across codes.
  - `pnpm --filter @pcg/net-client exec vitest run test/integration.test.ts` passes: host + 2 controllers exchange messages; a force-closed controller socket returns with the same `playerId`; a force-closed host socket reclaims and the roster lists both controllers.
- **Risks / fallbacks:** keep the WebSocket ctor, storage and `document` injectable (no globals in tests); the input send-rate logic belongs to M5, not here.
- **Leave out:** sunny-side message types, binary encoding, WebRTC.

### M3: Match flow

- **Goal:** headless match state machine covering roster, profiles, leader, rounds, scoring, disconnect/leave/rejoin, per-phone screens, spectator emoji and host-refresh restore.
- **Read:** SPEC §6.1, §6.2 (Scoring bullet), §6.3, §6.5, §6.6 (emoji rules), §6.7, §7.3, §8 (Host visibility); `src/shared/messages.ts`, `src/host/match/types.ts`, `src/host/sim/types.ts`; §8 Build decisions tagged match.
- **Depends on:** M0.
- **Order:** test-first, using a `FakeSim` in `src/host/match/__tests__/fakeSim.ts`.
- **Deliverables:** `apps/sunny-side/src/host/match/{index,roster,leader,scoring,flow,screens,emoji,persist,config}.ts`; `__tests__/{roster,leader,scoring,flow,disconnect,rejoin,screens,emoji,persist}.test.ts`.
- **Acceptance:**
  - Standard checks pass.
  - Tests cover: the first joiner is leader; Start is ignored with fewer than 2 players and from non-leaders; host-side Start works; leader disconnect/leave → next-earliest connected player, with no snap-back on return; name trimmed to ≤10 chars (empty → "Egg N"); taken colors are rejected and listed in the lobby screen; a mid-match joiner spectates until the next round starts; round start passes only eligible players to `sim.startRound`; 3 s countdown screen; elimination with `creditTo` → +1, with `null` → +0; sole survivor → +3; round-end rule and target table per Build decisions; tie at the top → another round; match-end screen; rematch resets scores and keeps the roster; Back to lobby; `peer left` mid-round → `sim.setControl(id,'frozen')`; `peer rejoined` → `'active'`; a join with a known `playerKey` restores name/color/score and spectates; `{t:"leave"}` → `deps.kick(id)`, egg stays, name greyed in standings; self-pause → frozen, resume → active; elimination → eliminated screen with a 5→1 countdown, then the ghost screen after 5 s; spectator emoji is rate-limited to 1/s and ignored from non-spectators; host hidden → every phone gets `gamePaused` and `step()` does nothing; persist → restore puts roster/scores/leader/round back and lands on results; every `Screen` variant is emitted by at least one test.
  - `grep -rnE "from ['\"](phaser|@pcg/net-client)" apps/sunny-side/src/host/match` prints nothing.
- **Risks / fallbacks:** time = fixed steps × 1000/60, with no `Date.now()` in logic (inject `now` if needed); for spec gaps not covered in §8, pick the simplest option and log it.
- **Leave out:** physics (M4), rendering (M6/M7), sockets (M6).

### M4: Simulation

- **Goal:** headless matter-js sim for SPEC §6.2 and §6.4 in §8 step order, plus the fixed-step accumulator and interpolation helpers.
- **Read:** SPEC §5, §6.1 (Arena bullet), §6.2, §6.4, §8; `src/host/sim/types.ts`, `src/shared/messages.ts` (`InputTuple`); §8 Build decisions tagged sim.
- **Depends on:** M0.
- **Order:** test-first per mechanic; tunneling test before tuning.
- **Deliverables:** `apps/sunny-side/src/host/sim/{index,world,egg,ghost,arena,lastTouch,inputs,config}.ts`; `src/host/loop/{fixedStep,interpolate}.ts`; tests in `src/host/sim/__tests__/` and `src/host/loop/__tests__/`.
- **Acceptance:**
  - Standard checks pass.
  - Tests cover: steering is a force (speed builds over steps and decays on a neutral stick); a hit egg's knockback is not overwritten by its own input over the next 10 steps; a dash fires only on a `dashCount` increment, uses facing on a neutral stick, and has a 1.5 s cooldown; a counter jump of more than 1 in one step → one dash; slam charge caps at 1 s, steering force is reduced while charging, the release impulse increases with charge, and the mass boost lasts 0.3 s and then restores the original mass; `charge` (0..1) and the max-charge flash are in the snapshot; ring-out only when the **center** passes the radius; shrink timeline (constant 10 s → warning flag → linear 45 s to the minimum → hold); start radius strictly increases with player count; last touch credits within 3 s and gives `null` after; ghost pulses never set or reset last touch; `ghostSpawned` comes 5 s after elimination; ghosts pass through eggs (sensor); a pulse has a 0.4 s wind-up visible in the snapshot, an impulse ≈ ⅓ of a dash, and a 4 s cooldown, and a held button gives exactly one pulse; frozen control zeroes velocity once, ignores input, and the egg can still be hit and eliminated; a max-charge slam from 36 evenly spaced angles never passes through a target egg; identical input sequences produce identical snapshots; `fixedStep` runs `floor(acc/step)` steps capped at 5, drops the excess, and has alpha in [0, 1); angle interpolation takes the shortest path.
  - `grep -rn "setVelocity" apps/sunny-side/src/host/sim --include='*.ts' | grep -v __tests__ | wc -l` prints `1` (the disconnect freeze only).
  - `grep -rnE "from ['\"](phaser|@pcg/net-client)" apps/sunny-side/src/host/sim apps/sunny-side/src/host/loop` prints nothing.
- **Risks / fallbacks:**
  - Gravity off (`engine.gravity.scale = 0`).
  - Tunneling → first 2 substeps of 1000/120 per fixed step, then a speed cap; log which.
  - `applyForce` scales with the timestep, so keep all constants in `config.ts` and log the starting values.
  - Mass boost via `Body.setMass`, restored afterwards.
  - Last touch comes from `collisionStart` egg–egg pairs.
- **Leave out:** rendering, network, scoring/match flow (M3), power-ups (SPEC §6.1).

### M5: Controller UI

- **Goal:** the `play.html` phone controller: every SPEC §6.7 screen driven by host `screen` messages, the §7.2 joystick/DASH/SLAM/pause layout, the input sender, and an offline dev mode.
- **Read:** SPEC §3, §6.3 (Lobby bullet), §6.7, §6.8, §7.2, §7.3; `src/shared/{messages,theme,relayUrl}.ts`; `packages/net-client/src/api.ts`.
- **Depends on:** M0.
- **Deliverables:** `apps/sunny-side/src/controller/{main,app,storage,wakeLock,orientation,dev}.ts`, `src/controller/screens/*.ts`, `src/controller/input/{joystick,buttons,sender,holdToPause}.ts`, `src/controller/controller.css` (theme CSS vars only); tests in `src/controller/__tests__/`. `main.ts` uses `createControllerClient` from `@pcg/net-client` (a stub until M2; tests use a fake client).
- **Acceptance:**
  - Standard checks pass (including `check:bundle`: no Phaser on the phone).
  - Tests (jsdom, fake timers) cover: the joystick origin is the first touch point, with radius clamp, deadzone, and ints −100..100; the stick sends on change at ≤30 Hz, button edges send immediately, keepalive is 5 Hz when idle, and counters are monotonic and increment once per press; joystick and button touches work at the same time (separate pointerIds); hold-to-pause fires at 600 ms and is cancelled by a release at 500 ms; each `Screen` variant renders `[data-screen=<name>]`; the self-paused overlay's Resume/Leave send `resume`/`leave`; client status `reconnecting` shows the reconnecting overlay; Start/Next/Rematch/Lobby are shown only when `isLeader` and send the matching `leader` action; the name is prefilled from `localStorage` and saved on submit; the emoji hotbar has a 1 s local cooldown; the ghost screen adds the dampened class; the SLAM fill height tracks hold time; a missing Wake Lock API doesn't throw.
  - `grep -rn "touch-action: none" apps/sunny-side/src/controller` and `grep -n "user-scalable=no" apps/sunny-side/play.html` both match.
  - `play.html?dev=1` runs with no relay: a live readout of the input tuple + a screen switcher for every `Screen` variant and overlay (verified at C1).
- **Risks / fallbacks:**
  - iOS Safari has no orientation lock → show a "rotate your phone" overlay in portrait.
  - Use Pointer Events + `setPointerCapture`; `100dvh`; `-webkit-user-select: none; -webkit-touch-callout: none`.
  - Wake Lock and fullscreen are skipped on insecure (LAN http) origins.
- **Leave out:** vibration and gyro (SPEC §3), branding/audio (SPEC §6.8), host code.
- **User checkpoint C1:** user runs `pnpm dev:lan`, opens `http://<PC-LAN-IP>:5173/play?dev=1` on an iPhone and an Android phone if available, and approves: landscape/rotate overlay, no scroll/zoom/selection, the floating joystick tracks the thumb, DASH/SLAM zones are large enough, the SLAM liquid fill, the hold-to-pause ring, and every screen and overlay in the switcher looks right. Notes become M5-fix-k.

### M6: Host app + wiring + e2e

- **Goal:** playable end to end over LAN. The Phaser host creates a room, shows a lobby with QR, and wires HostClient ↔ match ↔ sim through the fixed-step loop with interpolation and basic rendering; the controller is wired to the real ControllerClient; host controls, visibility pause, Wake Lock and Playwright e2e are in place.
- **Read:** SPEC §2, §5, §6.3, §6.5, §6.6 (Screens line), §8; all F0 contract files; the public exports (index files only) of `src/host/match`, `src/host/sim`, `src/host/loop`, `packages/net-client`.
- **Depends on:** M1, M2, M3, M4, M5 merged.
- **Deliverables:** `apps/sunny-side/src/host/{main,game,net,wakeLock,visibility,debug}.ts`; `src/host/scenes/{Boot,Lobby,Round,Results,Winner}.ts` (minimal: arena circle, colored circles with names, text scoreboard, host buttons for Start/Next/Rematch/Lobby, QR via `qrcode`); controller `main.ts` connected for real; `apps/sunny-side/playwright.config.ts` (webServer: relay on 8788 with `PLAYER_RECONNECT_MS=2000`, Vite on 5174 with `VITE_RELAY_URL=ws://localhost:8788`); `e2e/{smoke,reconnect,pause}.spec.ts`; `window.__pcg` debug hooks (`phase()`, `players()`, `debug.eliminate(id)`) enabled only in dev or with `?debug=1`.
- **Acceptance:**
  - Standard checks + E2E checks pass.
  - `smoke.spec.ts`: the host shows a 4-letter code and a QR encoding `${origin}/play?code=CODE`; 2 controller pages open that URL and submit names; the host lobby lists both; the leader phone shows Start and the other shows "Waiting for"; leader Start → `__pcg.phase() === 'playing'` and both phones show `[data-screen=playing]`; `__pcg.debug.eliminate(p2)` → p2 shows `eliminated`, then `ghost` within 6 s; the round ends → `results` on both; leader Next → round 2 `playing`.
  - `reconnect.spec.ts`: a controller `page.reload()` mid-round → same `playerId`, `playing` again; a new browser context seeded with the same `playerKey` joining after the window → `spectating` with the restored score.
  - `pause.spec.ts`: forcing the host's `visibilityState` to hidden → phones show `gamePaused`; visible → they leave it.
  - `pnpm dev:lan` prints the host URL with the LAN IP (verified at C2).
- **Risks / fallbacks:**
  - Phaser 4 differs from the Phaser 3 examples → check the types in `node_modules/phaser`.
  - A host opened via `localhost` produces a useless QR → show a banner telling the user to open the LAN URL.
  - Phaser's own Matter plugin must not be enabled (physics is `src/host/sim`).
- **Leave out:** M7 presentation (slam ring, squash/glow, jiggle, emoji floaters, shrink pulse styling, styled screens); audio/branding.
- **User checkpoint C2:** user runs `pnpm dev:lan`, opens the printed LAN host URL on the TV/laptop, joins with ≥2 phones (3+ if possible) via QR, plays a full match, and judges: steering feel, dash/slam weight, ring-out fairness, shrink pacing, ghost pulse strength, KO credit, match length, leader controls, reconnect (lock a phone ~10 s mid-round, then unlock), Leave + rejoin, and switching away from the host tab. Notes become fix milestones (§5 rule 9).

### M7: TV presentation

- **Goal:** SPEC §6.6 HUD and screens plus §6.0 egg visuals, with every color/font/radius taken from `theme.ts`.
- **Read:** SPEC §6.0, §6.6, §6.8; `src/shared/theme.ts`; `src/host/sim/types.ts` (`SimSnapshot`); `src/host/match/types.ts` (`MatchView`, `MatchEvent`); `src/host/scenes/*.ts` (files this milestone edits); C2 notes routed here.
- **Depends on:** M6 merged, C2 approved.
- **Deliverables:** updated `apps/sunny-side/src/host/scenes/*.ts`; `src/host/render/{egg,arena,ghost,slamRing,emojiLayer,hud,names}.ts`; tests in `src/host/render/__tests__/`; `e2e/screens.spec.ts` writing `apps/sunny-side/e2e/__screens__/{lobby,round,slam,results,winner}.png`.
- **Acceptance:**
  - Standard checks + E2E checks pass.
  - Unit tests: the emoji layer caps at 12 and drops the oldest; emoji rise and fade over a fixed lifetime; slam ring fill = `charge`; the max-charge flash fires once per charge; egg squash and yolk glow are monotonic in charge; egg jiggle triggers on a hit.
  - `ls apps/sunny-side/e2e/__screens__/{lobby,round,slam,results,winner}.png` succeeds after `pnpm e2e`.
  - `grep -rnE "#[0-9a-fA-F]{3,8}\b|rgba?\(" apps/sunny-side/src/host/render apps/sunny-side/src/host/scenes` prints nothing (theme tokens only).
- **Risks / fallbacks:** emoji in Phaser Text depends on system fonts → use a system emoji font stack in theme; if glyphs fail on the host machine, log it and render them via DOM overlay.
- **Leave out:** audio, logo/brand (SPEC §6.8), new mechanics or tuning outside what C2 notes route here.
- **User checkpoint C3:** user opens the 5 PNGs in `apps/sunny-side/e2e/__screens__/`, then plays one match over `pnpm dev:lan` on the actual TV, and approves: QR/code readable from the couch, scoreboard and round number, names over eggs, shrink warning pulse, slam ring + squash/glow + max flash, hit jiggle, ghost steam look, emoji float-up, results and winner screens. Notes become M7-fix-k.

### Fix milestones (`MN-fix-k`)

Same model as MN. **Read:** the checkpoint notes + MN's Read. **Acceptance:** MN's Acceptance + one runnable check per note where possible (a test, a config value, a grep); notes that are pure feel/visual are re-judged at the next checkpoint or in S4.

## 4. Subagent brief template

```text
You are building {M#}: {milestone name} for Sunny Side Shove.
Goal: {Goal}
Branch: create `{build/mN-slug or build/mN-fix-k}` from `main` and work only there.

Read ONLY: BUILD_PLAN.md §2, §3 entry for {M#}, §8 Build decisions; {Read list}.
{For fix milestones: Checkpoint notes: …}

Deliverables: {Deliverables}
Acceptance (build until every item passes; run them yourself): Standard checks
(`pnpm install --frozen-lockfile && pnpm check`) {+ E2E checks} + {Acceptance items}.
Order: {Order or "none"}
Leave out: {Leave out}
Risks / fallbacks: {Risks / fallbacks}

Rules:
- Frozen contracts ({freeze points in force}): additive changes only. When you add, update the
  contract file + the matching SPEC.md section + one line `- [M#] contract+: …` under Build decisions.
- A choice the spec and this plan don't cover: pick the simplest option, log one line under Build decisions.
- Blocked: write `- [M#] YYYY-MM-DD: …` under Blockers, commit, stop. Don't guess.
- Don't edit files owned by another milestone (§3 File ownership).
- Done: tick your Progress items in BUILD_PLAN.md, commit, `git rebase main`, rerun Acceptance if the
  rebase pulled anything in. Don't merge, don't push.
- If a dependency isn't merged yet and only its checks are missing, finish everything else and report
  "done, checks pending M#".
- Reply in 150 words or fewer: what was built, what was deferred, blockers, branch name.
```

## 5. Orchestrator rules

1. Read only BUILD_PLAN.md. Never read source code. Trust subagent reports and the checklist.
2. To resume: read §6 Progress, §7 Blockers and `git log --oneline -15`, then run §1 pre-flight.
3. One subagent per milestone via the Agent tool with the §3 `model`. Run parallel milestones in the same turn with `isolation: "worktree"`; run the others in the main checkout.
4. Merge per §2, in dependency order (M1 before M2; M0 first; M6 after all of M1–M5).
5. After each merge, spawn a `test-runner` agent (`model: "haiku"`) on `main` with that milestone's Acceptance commands; only failures come back. On failure, resume that milestone's subagent with the output.
6. Stop at user checkpoints and unresolved Blockers. Tell the user exactly what's needed (file to open, command to run, question to answer). Checkpoint notes become a fix subagent.
7. No extra reviews, audits or re-exploration unless an Acceptance check fails.
8. When everything is checked, print the §9 Final handoff list.
9. Route checkpoint notes by owner directory: controller → M5-fix; host wiring/flow → M6-fix (or M3-fix for match rules); feel/tuning → M4-fix (`sim/config.ts`) and M3-fix (`match/config.ts`); TV visuals → M7 brief (before M7 runs) or M7-fix. Fix milestones touching disjoint directories run in parallel in worktrees.
10. Before spawning the parallel wave, confirm §1 "Worktrees gitignored" passes on `main`.

## 6. Progress checklist

- [ ] Pre-flight passed (S1)
- **M0**
  - [ ] Scaffold, tooling, pinned deps, CI workflow
  - [ ] Contract files (F0) + ESLint boundaries
  - [ ] check:bundle / check:routes scripts + negative probes verified
  - [ ] SPEC.md §5 + decision log updated
  - [ ] Merged to `main`
- **M1**
  - [ ] Rooms, codes, admission, lock/kick
  - [ ] Reconnect, host reclaim, heartbeat, robustness tests
  - [ ] Dockerfile + fly.toml + healthz verified in Docker
  - [ ] Merged to `main`
- **M2**
  - [ ] Codec + HostClient
  - [ ] ControllerClient + reconnect/backoff + player key
  - [ ] Integration test vs real relay
  - [ ] Merged to `main`
- **M3**
  - [ ] Roster, profiles, leader + handoff
  - [ ] Round flow, scoring, target, match end/rematch/lobby
  - [ ] Disconnect, pause, leave, late rejoin, host-refresh restore
  - [ ] Screens for every §6.7 state + emoji rate limit
  - [ ] Merged to `main`
- **M4**
  - [ ] World, steering, dash, slam, mass boost
  - [ ] Arena shrink, ring-out, last touch
  - [ ] Ghosts (sensor, wind-up, pulse, cooldown)
  - [ ] Freeze rule, tunneling + determinism tests, fixedStep + interpolate
  - [ ] Merged to `main`
- **M5**
  - [ ] Joystick, buttons, hold-to-pause, input sender
  - [ ] All screens + overlays, name prefill, emoji hotbar
  - [ ] Wake Lock / orientation handling + `?dev=1` mode
  - [ ] Merged to `main`
  - [ ] **User approved C1 (controller on real phones)**
- **M6**
  - [ ] Host boot, room + lobby QR, net ↔ match ↔ sim wiring, fixed-step loop + interpolation
  - [ ] Basic scenes + host controls, visibility pause, Wake Lock
  - [ ] Controller wired to real client
  - [ ] Playwright smoke / reconnect / pause specs
  - [ ] Merged to `main`
  - [ ] **User approved C2 (LAN play-test)**
- **M7**
  - [ ] Egg / arena / ghost render, slam ring + anticipation + flash, jiggle
  - [ ] HUD, names, shrink pulse, emoji layer
  - [ ] Styled lobby / results / winner + screenshot spec
  - [ ] Merged to `main`
  - [ ] **User approved C3 (TV presentation)**
- [ ] Final test-runner pass on `main` (Standard + E2E checks)
- [ ] Final handoff printed

## 7. Blockers

_None._

Format: `- [M#] YYYY-MM-DD: what's blocked, what was tried, what's needed from whom.`

## 8. Build decisions

Format: `- [M#] decision: one line, with the reason.`

- [plan] Physics: standalone `matter-js` in `src/host/sim` (no Phaser imports); Phaser only renders. Gives headless Vitest coverage and a parallel sim/render build. User-approved 2026-10-22; M0 updates SPEC §5 + the decision log.
- [plan] Device testing over LAN http via `pnpm dev:lan` (Vite `--host` on 5173 + relay on 8787). Wake Lock/fullscreen/orientation lock are feature-detected and skipped on insecure origins. User-approved 2026-10-22.
- [plan] Late rejoin matches by **player key** (SPEC §6.3, §7.1, decision #15); decision-log row 12's "name/color" is an error, and M0 fixes it.
- [plan] Packages: `@pcg/relay`, `@pcg/net-client`, `@pcg/sunny-side`. net-client ships as TS source (no build step).
- [plan] Tooling: TypeScript 5.9 strict (typescript-eslint needs TS < 6.1), Vite 8, Vitest 5 + jsdom, ESLint flat + typescript-eslint, Prettier, Playwright (Chromium only), `tsx` for relay dev.
- [plan] Ports: dev Vite 5173 / relay 8787; preview 4173; e2e Vite 5174 / relay 8788; Docker smoke 8789. Fly `internal_port` 8080.
- [plan] Relay URL: `VITE_RELAY_URL`, else `ws://${location.hostname}:8787` (LAN dev).
- [plan] relay: additive to SPEC §7.1: relay→phones `{ t: "host", status: "away" | "back" }`; error codes `room-closed`, `bad-request`; `GET /healthz`. Phones need to show the host-away overlay and to learn when the room dies.
- [plan] relay: defaults are a 30 s player window, 60 s host reclaim, 5 s ping, drop after 2 missed, `maxPayloadBytes` 16 KB, `maxPlayers` clamped 1–16. All overridable via `createRelay` opts and env. `maxPlayers` = 8 counts spectators.
- [plan] relay: role is fixed per socket (`create`/`reclaim` → host, `join` → phone); a message from the wrong role → `bad-request`.
- [plan] match: Leave = host calls `kick` after `{t:"leave"}`, which frees the relay slot and invalidates the token; the phone shows the `left` screen and ignores the following `kicked`.
- [plan] match: 8 placeholder player colors in `theme.ts`, unique per player; the first free color is auto-assigned on join.
- [plan] match: names are trimmed, max 10 chars; empty → "Egg N". Phones learn leadership via `isLeader` in the screen payload.
- [plan] match: round start = 3 s countdown with eggs frozen. Eggs go to connected, non-left, non-spectating players; a self-paused player gets an egg in the frozen state; disconnected players get none.
- [plan] match: a round ends when ≤1 egg remains on the pan, or no remaining egg belongs to a connected/reconnecting player. +3 goes to the sole survivor only if they haven't left; if everyone is out in the same step, no one gets +3.
- [plan] match: target score table (starting values, tuned at C2) is n=2→15, 3→13, 4→12, 5–8→11. At round end, the highest score ≥ target wins; a tie for highest → another round.
- [plan] match: on host refresh, the match persists roster/scores/leader/round to `sessionStorage` on change; on reclaim it restores them and goes to results (in-round state is discarded).
- [plan] sim: knockout credit comes from any egg–egg `collisionStart`, which sets each egg's last toucher to the other with a timestamp; credit counts if ≤3 s old at elimination.
- [plan] sim: start radius ∝ √n (constant area per egg), minimum radius = 40% of start; ghosts spawn at the arena center and are clamped inside the current radius. Constants live in `sim/config.ts`.
- [plan] host: 1920×1080 logical canvas, Phaser `Scale.FIT`. Debug hooks `window.__pcg` only in dev or with `?debug=1`.
- [plan] CI: GitHub Actions runs Standard checks on push. Nothing is pushed until the Final handoff. No relay origin allowlist in v1 (generic, in-memory, no data at rest).

## 9. Final handoff

Manual steps, in order. No secrets are needed in v1. Milestones that add secrets must add steps here.

1. Review `git log --oneline`, then `git push origin main`; confirm the GitHub Actions run is green.
2. **Fly (relay):** install flyctl (PowerShell: `iwr https://fly.io/install.ps1 -useb | iex`), `fly auth login`, `fly launch --no-deploy --copy-config --config apps/relay/fly.toml` (if `pcg-relay` is taken, rename it in fly.toml), `fly deploy --config apps/relay/fly.toml --dockerfile apps/relay/Dockerfile`, then **`fly scale count 1 --config apps/relay/fly.toml`** (rooms are in memory, so there must be exactly one machine).
3. `fly certs add relay.fostercurtis.dev --config apps/relay/fly.toml`; create the DNS records that `fly certs show relay.fostercurtis.dev` lists; verify with `curl -sf https://relay.fostercurtis.dev/healthz`.
4. **Vercel (game):** New Project → import `foster-curtis/phone-controller-games` → Root Directory `apps/sunny-side`, framework Vite → env var `VITE_RELAY_URL=wss://relay.fostercurtis.dev` (Production + Preview) → Deploy.
5. Vercel → Domains → add `sunny-side.fostercurtis.dev`; create the DNS CNAME Vercel shows; wait for the certificate.
6. Smoke test: open `https://sunny-side.fostercurtis.dev` on the TV/laptop; join from an iPhone and an Android via QR (`/play?code=…`). Confirm the phones stay awake (Wake Lock now works over HTTPS), landscape works, a full match plays, a phone locked for ~10 s mid-round reconnects, and `/play` loads without Phaser (DevTools Network).

## 10. Kickoff prompt

```text
You are the build orchestrator for this repo. Read ONLY BUILD_PLAN.md (never source code) and follow
it exactly.

1. Run every §1 pre-flight check. If anything blocks the next milestone, stop and tell me exactly what
   to fix.
2. Read §6 Progress, §7 Blockers and `git log --oneline -15` to find where the build stands.
3. Run the next unchecked milestone(s) per §5, using the §4 brief and the §3 models:
   M0 alone (opus, main checkout); then M1, M2, M3, M4 (opus) and M5 (sonnet) in parallel in the same
   turn with isolation "worktree"; then M6 (opus), in parallel with any M5-fix; then M7 (sonnet), in
   parallel with C2 fix milestones in other directories.
4. Merge per §2 (`git merge --ff-only`, dependency order, M1 before M2). After each merge, spawn a
   test-runner agent (model "haiku") on main with that milestone's Acceptance commands; on failure,
   resume that milestone's subagent with the output.
5. Stop at user checkpoints (C1, C2, C3) and unresolved Blockers, and tell me exactly what is needed:
   the command to run, the URL/file to open, what to judge.
6. Route checkpoint notes to fix milestones per §5 rule 9.
7. If everything in §6 is checked, print the §9 Final handoff.

{Optional: "Checkpoint approved: C1" / "C2 notes: …"}
```
