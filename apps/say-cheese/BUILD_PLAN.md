# BUILD_PLAN: Say Cheese!

Orchestration plan for building `apps/say-cheese/SPEC.md`. The orchestrator reads **only this file**.
Subagents read their milestone entry, §2, §4, §8 and the spec sections and files the entry names.
Commands are POSIX sh, run from the repo root. `SPEC §` = `apps/say-cheese/SPEC.md`; `PLATFORM §` =
`PLATFORM.md`; `relay SPEC §` = `apps/relay/SPEC.md`.

**Event: Wednesday 2026-11-11.** Core is done by Sun 2026-11-08; Mon 11-09 and Tue 11-10 are buffer
(merge to `main`, production deploy, real-device smoke test). Playable early, polish last, cuts
pre-decided (§3 cut order).

**Inputs already in the repo (read-only for every milestone):** the brand kit
`apps/say-cheese/say-cheese-brand-kit.zip`, unpacked by SC0 into `src/styles/brand.css`, `public/*`
(favicon, PWA icons, `site.webmanifest`), `brand/head.html`, `brand/mark*.svg`, `brand/preview.html`.
Take colors, fonts, sizes, the 8 player colors and the tag ring sizes from `brand.css` variables,
never from literals. Don't edit the kit.

**Shared kits:** `@pcg/controller-kit`, `@pcg/game-kit` and `@pcg/net-client` are on `main` and
frozen (additive only). SC0 merges `origin/main` into `say-cheese` once; Say Cheese uses the kits as
they are and never edits `packages/**`.

## 0. Sessions

Each session is a fresh cloud session started with the §10 kickoff prompt.

| Session | Runs | Ends at | Target date |
| --- | --- | --- | --- |
| S1 | Pre-flight → **SC0** (main checkout) → **SC1 ∥ SC2 ∥ SC3 ∥ SC4** (worktrees) | **C1**: camera spike on real iPhone + Android through the deployed relay (+ glance at phone dev mode and TV gallery) | Wed 11-04 (may start Tue 11-03) |
| S2 | C1 fixes (by owner dir) → **SC5** (main checkout) | **C2**: vertical slice, one round, 3 people on 3 phones in a room | Thu 11-05 |
| S3 | C2 fixes → **SC6 ∥ SC7 ∥ SC8** (worktrees) | **C3**: full match, shared phone, disconnects, host refresh, sound | Fri 11-06 |
| S4 | C3 fixes → **SC9 ∥ SC10** (worktrees) | **C4**: event rehearsal, full match with 5+ players on the TV | Sat 11-07 |
| S5 | C4 fixes → Full gate → print §9 Final handoff | Final handoff printed | Sun 11-08 |
| — | Buffer: you merge to `main`, deploy, smoke test (§9) | — | Mon 11-09 – Tue 11-10 |

## 1. Pre-flight checklist

| Item | Check command | Blocks |
| --- | --- | --- |
| On `say-cheese`, up to date | `git fetch origin say-cheese && test "$(git branch --show-current)" = say-cheese && test "$(git rev-parse HEAD)" = "$(git rev-parse origin/say-cheese)"` | all |
| Clean working tree | `test -z "$(git status --porcelain)"` | all |
| Push access | `git push --dry-run origin say-cheese` exits 0 | all |
| No leftover milestone branches | `git branch --list 'build/sc*' --no-merged say-cheese` prints nothing (if it prints: a crashed session; check the Progress checklist, then delete it with `git branch -D` or resume it) | next milestone |
| Plan is current | `test -f apps/say-cheese/BUILD_PLAN.md` | all |
| Node ≥ 22, pnpm 10 | `node -e "process.exit(+process.versions.node.split('.')[0]>=22?0:1)" && pnpm --version \| grep -q '^10\.'` | all |
| Install + existing gate green | `pnpm install --frozen-lockfile && pnpm check` (once per session; before SC0 this is Sunny Side + relay + net-client, after SC0 it includes Fort Frenzy and Say Cheese) | next milestone |
| npm registry reachable | `npm view vite@8.3.5 version` prints `8.3.5` | SC0 |
| Playwright Chromium usable | `pnpm --filter @pcg/sunny-side exec playwright install --dry-run chromium \| grep -o '/opt/pw-browsers/[a-z_]*-[0-9]*' \| xargs -n1 test -e` exits 0. **If not:** the CDN is blocked in the sandbox, so link the preinstalled build: read the wanted dirs from the dry run and `ls /opt/pw-browsers` for the present ones, then e.g. `cd /opt/pw-browsers && ln -sfn chromium-1243 chromium-1248 && ln -sfn chromium_headless_shell-1243 chromium_headless_shell-1248 && ln -sfn ffmpeg-1011 ffmpeg-1013` (wanted ← present). Verified working on 2026-11-03 (fake camera included). Never `playwright install` a different version. | SC0, every e2e |
| Fake camera works | after SC0: `pnpm e2e:say-cheese` (its smoke spec opens `getUserMedia` with `--use-fake-device-for-media-stream`) | SC1, SC5+ e2e |
| Google Fonts reachable (screenshots only) | `curl -sfI "https://fonts.googleapis.com/css2?family=Bungee" >/dev/null` (if blocked, e2e blocks fonts like Sunny Side's `blockFonts`; not a blocker) | none |
| Docker (relay image) | `docker info >/dev/null 2>&1` (unavailable in the cloud sandbox 2026-11-03; the Dockerfile listing check in SC0 replaces it) | none |
| Worktrees ignored | `git check-ignore -q .claude/worktrees/x && grep -q '.claude/worktrees' .prettierignore && grep -q "'.claude/worktrees/\*\*'" eslint.config.js` | parallel waves |
| Ports free (4173 5173 5174 8787 8788) | `(ss -ltn 2>/dev/null \|\| netstat -ltn) \| grep -E ':(4173\|5173\|5174\|8787\|8788) '` prints nothing | e2e, check:routes |
| Unattended permissions | the session runs in auto mode, or `.claude/settings.json` allows `Bash(git:*)`, `Bash(pnpm:*)`, `Bash(node:*)`, `Bash(npx:*)`, `Edit`, `Write` (otherwise the run stalls on prompts) | all |
| Preview deploy exists (from C1 on) | §9 steps 1–4 done: the say-cheese branch preview URL loads `/` and `/play` on a phone without a Vercel login wall | C1–C4 |

## 2. Branches, merging, verification

- The orchestrator stays on `say-cheese` in the main checkout. Each milestone works on
  `build/sc<N>-<slug>` cut from `say-cheese`; fixes after checkpoint feedback go on
  `build/sc<N>-fix-<k>` (same model and file ownership as milestone N; notes that span owners split
  into one fix branch per owner).
- **Subagent flow:** commit as it goes → run acceptance → tick its Progress items → commit → `git rebase
  say-cheese` → rerun acceptance if the rebase pulled anything in → report. It never merges or pushes.
  (SC0 contains a merge commit from `origin/main`; nothing lands on `say-cheese` while SC0 runs, so it
  needs no rebase. If it ever must, use `git rebase --rebase-merges`.)
- **Orchestrator merge:** `git merge --ff-only build/sc<N>-<slug>`. If that fails, resume the same
  subagent (SendMessage) to rebase and rerun acceptance. Conflicts in this file's Blockers / Build
  decisions resolve by keeping both sides. Then `git branch -d` the milestone branch.
- **Push `say-cheese` after every merge and after every BUILD_PLAN.md update**
  (`git push origin say-cheese`): the sandbox is ephemeral, and each push makes a Vercel preview.
  Milestone branches are never pushed. Nothing goes to `main` (that is a §9 step for the user).
- **Parallel milestones** run in git worktrees (`isolation: "worktree"`). `.claude/worktrees/` is
  ignored by git, ESLint and Prettier (pre-flight checks it). Two milestones run in parallel only when
  their Deliverables own disjoint paths; the ownership is written in each entry. `BUILD_PLAN.md`
  checklist ticks are separate lines and merge cleanly.
- **e2e files in parallel waves:** each milestone adds its own `e2e/<milestone>.spec.ts`; shared helpers
  in `e2e/helpers.ts` (SC0) are additive-only, and a parallel milestone puts new helpers in its own spec
  file or `e2e/helpers-sc<N>.ts`.
- **Check sets** (all run locally in the sandbox):
  - **SC checks:** `pnpm check:say-cheese` (typecheck, lint, format:check, test, build, check:bundle,
    check:routes).
  - **SC e2e:** `pnpm e2e:say-cheese` (Playwright: own relay on 8788 with a 2 s player window, Vite on
    5174, Chromium with `--use-fake-device-for-media-stream --use-fake-ui-for-media-stream` and the
    `camera` permission granted; one host page plus several phone contexts in one browser).
  - **Full gate:** `pnpm check && pnpm e2e`. Required for SC0 (root wiring) and once at the end (S5).
- **Never touched by any milestone:** `packages/**`, `apps/relay/src/**`, `apps/sunny-side/**`,
  `apps/fort-frenzy/**`, the brand kit files. Root files only where an entry says so (only SC0).

## 3. Milestones

### Dependency graph

```
SC0 ──┬─ SC1 (camera + blob transfer + spike) ──┐            ┌─ SC6 (robustness) ─┐
      ├─ SC2 (match state machine + seats) ─────┼─ SC5 slice ┼─ SC7 (shared UI) ──┼─ SC9 (TV polish)
      ├─ SC3 (phone screens) ───────────────────┤   [C2]     └─ SC8 (audio) ──────┤  SC10 (emoji)
      └─ SC4 (TV views) ────────────────────────┘                     [C3]        └──── [C4]
           [C1 = SC1 spike on real phones]
```

| # | Milestone | Model | Parallel with | User checkpoint | Cut priority |
| --- | --- | --- | --- | --- | --- |
| SC0 | Merge `main`, scaffold, brand kit, root wiring, contracts | opus | — (serial) | no | core |
| SC1 | Camera capture, blob transfer, camera spike page | opus | SC2, SC3, SC4 | **C1**: spike on real iPhone + Android via the deployed relay | core |
| SC2 | Match state machine, scoring, tags, turn queue, seats, leader | opus | SC1, SC3, SC4 | no | core |
| SC3 | Phone controller shell and screens (single seat) | sonnet | SC1, SC2, SC4 | C1 (glance: `/play?dev=1` on a phone) | core |
| SC4 | TV views and host controls | sonnet | SC1, SC2, SC3 | C1 (glance: `/?gallery=1` on the TV) | core |
| SC5 | Vertical slice wiring (host ↔ match ↔ views ↔ phones ↔ photos) | opus | — (serial) | **C2**: one round, 3 people, 3 phones, in a room | core |
| SC6 | Disconnects, late rejoin, leave/remove, host refresh, photo retry | opus | SC7, SC8 | C3 | core |
| SC7 | Shared devices UI: seats on a phone, pass screen, TV grouping | sonnet | SC6, SC8 | C3 | cut-if-late |
| SC8 | Audio: Web Audio synth on TV and phone | sonnet | SC6, SC7 | C3 | core (phone click: cut-if-late) |
| SC9 | TV polish: flash, developing, podium, rules illustrations | sonnet | SC10 | **C4**: rehearsal | cut-if-late |
| SC10 | Emoji reactions | sonnet | SC9 | C4 | cut-if-late |

**Cut order** (first dropped first; the orchestrator proposes, the user approves, rule 8):

1. **SC10 emoji** (SPEC §6.6 names it the first cut). Spectators see "Watch the TV".
2. **SC9 TV polish.** The SC4 views stay as they are (brand-styled, no animations, plain text podium).
3. **SC8 phone shutter click** (TV sounds stay; SPEC §3 says the phone sound is a nice-to-have).
4. **SC7 shared devices UI.** One phone per player; the seat model (SC2) stays, so it can come back
   after the event. The lobby hides "Add another player".
5. **SC6 host-refresh replay** only (disconnects, rejoin and photo retry stay): a host refresh mid-match
   returns the room to the lobby with the roster restored.

Never cut: SC0–SC5, the rest of SC6, SC8 TV sounds, the rules overview (built in SC2–SC4).

### Freeze points

| Contract | Frozen when merged | Later changes |
| --- | --- | --- |
| `src/shared/messages.ts` (GAME_ID, phone→host messages, `Screen` union, limits) | SC0 | additive only; log under Build decisions; update SPEC §7.3 |
| `src/host/match/types.ts` (phases, `MatchState`, `TvView`, `PersistedMatch`, events) and `src/host/match/config.ts` names (values are tuning, free) | SC0 | additive only, logged |
| `src/shared/blob-transfer/types.ts` (chunk format, `CHUNK_B64_MAX = 12000`, ack) | SC0 | additive only, logged; SPEC §7.4 |
| `src/shared/seats/types.ts` (seat id `p3#1`, `Seat`, seat-key storage key) | SC0 | additive only, logged |
| `src/controller/camera/types.ts` (`Camera` interface), `src/shared/sfx.ts` (`Sfx` interface + `SfxName`) | SC0 | additive only, logged |
| Blob-transfer API (`createBlobSender`, `createBlobReceiver`) | SC1 | additive only |
| Seat model behavior (`src/shared/seats/index.ts`) | SC2 | additive only |

---

### SC0: Merge main, scaffold, brand kit, root wiring, contracts

- **Goal:** a buildable, deployable `@pcg/say-cheese` skeleton on the kits, with every shared contract in code so SC1–SC4 build in parallel against a fixed surface.
- **Read:** this file §2, §8; SPEC §2–§5, §6.1, §6.2, §6.3 (model only), §6.3.1, §6.4, §6.7, §7, §8, §9, §10; `PLATFORM.md` §4; `AGENTS.md` ("Adding or starting a game", Contracts); `apps/relay/SPEC.md` §2–§3; `packages/controller-kit/src/index.ts`, `packages/game-kit/src/index.ts`, `packages/game-kit/src/vite.ts`; Fort Frenzy as the layout model: `apps/fort-frenzy/{package.json,vite.config.ts,vercel.json,playwright.config.ts,index.html,play.html,tsconfig.json,vitest.config.ts}`.
- **Depends on:** pre-flight.
- **Order:**
  1. First commit: `git merge origin/main` (resolve the `AGENTS.md` and `PLATFORM.md` game-table conflicts by keeping both sides' rows; Say Cheese row status "In build"). Run `pnpm install --frozen-lockfile && pnpm check` before going on.
  2. Unpack the brand kit at the repo root (`unzip -o apps/say-cheese/say-cheese-brand-kit.zip`), `git rm` the zip.
  3. Scaffold + root wiring, then contracts, then the smoke e2e.
- **Deliverables:**
  - App: `apps/say-cheese/package.json` (`@pcg/say-cheese`; scripts `dev`, `build`, `preview`, `typecheck`, `test`, `e2e` = `playwright test --pass-with-no-tests`; deps `@pcg/net-client`, `@pcg/controller-kit`, `@pcg/game-kit` as `workspace:*`; exact-pinned dev deps matching Fort Frenzy's versions, incl. `@playwright/test` 1.64.1, `jsdom`, `vitest`, no Phaser), `tsconfig.json`, `vitest.config.ts` (`src/controller/**` in jsdom, rest in node), `vite.config.ts` (inputs `index.html`, `play.html`; `build.manifest: true`; `playRoute()` + `lanUrl()` from `@pcg/game-kit/vite`), `vercel.json` (copy Fort Frenzy's: `cleanUrls` + `ignoreCommand`), `index.html` (`<body data-entry="host">`) and `play.html` (`data-entry="controller"`, portrait viewport), both with `brand/head.html` pasted into `<head>`.
  - Entry stubs: `src/host/main.ts` (renders the wordmark), `src/controller/main.ts` (renders "Say Cheese!"; imports nothing from `host/`), `src/styles/base.css` (resets, body background from tokens).
  - `playwright.config.ts`: Fort Frenzy's (relay 8788 with `PLAYER_RECONNECT_MS=2000`, Vite 5174) plus `launchOptions.args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream']` and `permissions: ['camera']`.
  - `e2e/helpers.ts`: `test` with a fullscreen stub, `openHost(browser, query?)` (polls `window.__pcg.code()`), `newPhone(browser, {seed?})` (own context per phone, portrait 390×844, camera permission), `joinPhone(browser, code, name)`, `screen(page, kind)` (`[data-screen=kind]`), `blockFonts`, `closeContexts`. `e2e/smoke.spec.ts`: host page loads with `data-entry="host"`; `/play` loads; a phone page on the app origin gets a fake-camera `MediaStream` with a live video track.
  - Contracts (file headers say "Frozen at SC0 (BUILD_PLAN §3): additive changes only"):
    - `src/shared/messages.ts`: `GAME_ID = 'say-cheese'`, `MAX_PHONES = 10`, `MAX_SEATS = 8`, `MIN_PLAYERS = 3`, `NAME_MAX = 10`, `EMOJI = ['📸','😂','😱','🙈','👀']`; every SPEC §7.3 phone→host message as a discriminated union with a runtime guard `isPhoneMsg`; the additions in §8 Build decisions (`hello`, leader `skip` / `howToPlay`, round id `r`, `endsInMs`, photo `aspect`); the host→phone `Screen` union (`joining`, `lobby`, `rules`, `pass`, `announce`, `scatter`, `shoot`, `upload`, `review`, `results`, `matchEnd`, `spectating`, `left`), each carrying `leaderName`, `isLeader`, `seats: {seat, name, color}[]`, `canEmoji`, plus phase data; `photoAck`.
    - `src/host/match/types.ts`: `Phase` (`lobby | rules | pass | announce | scatter | shoot | upload | review | results | matchEnd`), `Player` (seat id, phone id, player key, name, color, score, connected, camera, ready, joinIndex, spectator, left), `Round` (r, photographer, photos `{index, aspect, url?}`, tags `{tagId, photo, x, y, playerId|null}`), `MatchState`, `TvView` (per-phase view model the TV renders), `MatchEvent` inputs (phone message, peer change, timer, host control), `Effect` outputs (send screen, ack, kick, start/clear timer, persist), `PersistedMatch` (v1).
    - `src/host/match/config.ts`: `SCATTER_MS 10000`, `SHOOT_MS 20000`, `MAX_SHOTS 15`, `SHUTTER_COOLDOWN_MS 400`, `UPLOAD_GRACE_MS 10000`, `TAG_SIZE_FRAC 0.12`, `PERSIST_KEY 'say-cheese:match'`, `timeScale` (1; debug `?timeScale=` override for e2e).
    - `src/shared/blob-transfer/types.ts`: `Chunk {t:'chunk', r, photo, i, n, b64}`, `CHUNK_B64_MAX = 12000`, `RELAY_MAX_PAYLOAD = 16384`, `Ack {t:'photoAck', r, photo}`.
    - `src/shared/seats/types.ts`: `SeatId` (`${playerId}#${seat}`), `Seat {seat, name, color, seatKey}`, `SEAT_KEYS_STORAGE = 'say-cheese:seats:<code>'`.
    - `src/controller/camera/types.ts`: `Camera {enable(): Promise<'ok'|'denied'|'unavailable'>; attach(video): void; capture(): Promise<{blob, width, height}>; release(): void; readonly state}`.
    - `src/shared/sfx.ts`: `SfxName` (`beep`, `beepFinal`, `startBuzz`, `endBuzz`, `shutter`, `develop`, `sting`), `Sfx {unlock(): Promise<void>; play(name): void; readonly unlocked}`, `noopSfx`.
  - Root wiring (small, additive; the `fort-frenzy` work on `main` edits the same files):
    - `package.json`: `dev:say-cheese`, `dev:lan:say-cheese`, `build:say-cheese`, `e2e:say-cheese`, `check:say-cheese` (copy Fort Frenzy's five, swap names).
    - `pnpm-lock.yaml` (from `pnpm install`).
    - `apps/relay/Dockerfile`: `COPY apps/say-cheese/package.json apps/say-cheese/` beside the other app lines.
    - `scripts/check-bundle.mjs`: `'say-cheese': 40` in `PLAY_JS_LIMIT_KB` (the script fails for any app with a `play.html` and no entry; no Phaser, so only the size check applies).
    - `.prettierignore`: `apps/say-cheese/src/styles/brand.css`, `apps/say-cheese/public/`, `apps/say-cheese/brand/`, `apps/say-cheese/index.html`, `apps/say-cheese/play.html`.
    - Tables: `PLATFORM.md` §1, `README.md`, `AGENTS.md` (status "In build"; `AGENTS.md` `pnpm --filter` list gains `@pcg/say-cheese`).
  - Spec: SPEC §9 → mark both items settled (brand kit, synth audio), §8 timer note (`endsInMs`), new decision-log rows 16–19 for the §8 Build decisions tagged `[SC0]`; header "Last updated".
- **Acceptance:**
  - Full gate: `pnpm check && pnpm e2e` (includes `check:say-cheese` and `e2e:say-cheese` smoke).
  - `pnpm check:say-cheese` and `pnpm e2e:say-cheese` pass on their own.
  - Dockerfile lists every workspace package: `for f in apps/*/package.json packages/*/package.json; do grep -q "^COPY $f " apps/relay/Dockerfile \|\| echo "missing $f"; done` prints nothing.
  - `test ! -e apps/say-cheese/say-cheese-brand-kit.zip && test -f apps/say-cheese/src/styles/brand.css && test -f apps/say-cheese/public/site.webmanifest`.
  - `git diff --stat origin/main...HEAD -- packages apps/relay/src apps/sunny-side apps/fort-frenzy` prints nothing (no shared-code edits beyond the merge).
  - `grep -q '"say-cheese"' apps/say-cheese/src/shared/messages.ts` and a unit test `src/shared/__tests__/messages.test.ts` (guards accept every sample message, reject junk).
  - Every contract file header contains "Frozen at SC0".
- **Risks / fallbacks:**
  - Merge conflicts beyond the two tables → resolve by keeping `main`'s side for shared files (`main` is the source of truth there); log it.
  - `main`'s full gate red before any Say Cheese change → Blocker (not ours to fix; shared code is off-limits).
  - Playwright version mismatch → pre-flight symlink.
  - `check:routes` needs the six `public/` files and Google Fonts in `<head>`: both come from the kit.
- **Leave out:** any gameplay, screens or styling beyond the stubs; extraction into `packages/`; edits to `packages/**`, the relay, Sunny Side, Fort Frenzy, the brand kit.
- **User checkpoint:** none.

### SC1: Camera capture, blob transfer, camera spike page

- **Goal:** prove the riskiest path end to end: rear camera → frame → JPEG → chunks through the real relay → `<img>` on a host page; ship the real modules SC5 will use.
- **Read:** SPEC §3 (Camera), §6.3 (Lobby camera bullet), §7.4, §10 #3 #8; `apps/relay/SPEC.md` §2 (`maxPayloadBytes`) §3; contracts `src/shared/blob-transfer/types.ts`, `src/controller/camera/types.ts`, `src/shared/messages.ts`; `packages/net-client/src/api.ts`; `packages/game-kit/src/index.ts` (`relayUrl`, `qrMatrix`).
- **Depends on:** SC0.
- **Owns:** `src/shared/blob-transfer/**` (types.ts additive), `src/controller/camera/**` (types.ts additive), `spike.html`, `src/spike/**`, `vite.config.ts` (adds the `spike` input only), `e2e/sc1-spike.spec.ts`.
- **Order:** test-first for blob transfer (chunking, envelope size, reassembly, retry), then camera, then the spike.
- **Deliverables:**
  - `src/shared/blob-transfer/`: no game imports (extraction candidate). `chunkBase64(b64)`; `createBlobSender({send, onProgress})` (queue per `(r, photo)`, sends in shot order, keeps every blob until acked, `resendUnacked()` from chunk 0, `dropRound(r)`); `createBlobReceiver({onComplete, onProgress})` (collects per `(sender, r, photo)`, tolerates out-of-order and duplicate chunks, `discardFrom(sender)` on `peer left`, `revokeAll()`), base64 helpers that work on `Blob`/`ArrayBuffer` in browsers and Node 22.
  - `src/controller/camera/`: `createCamera()` implementing `Camera`: `getUserMedia({video: {facingMode: {ideal: 'environment'}, width: {ideal: 1280}}, audio: false})`, `<video playsinline muted autoplay>`, `capture()` draws the current frame to a canvas with long edge `min(800, source)` and `toBlob('image/jpeg', 0.7)`; `fitLongEdge()` pure helper; denied vs unavailable mapping; stream kept alive until `release()`; re-acquires when the track has ended.
  - `spike.html` + `src/spike/`: `/spike` (TV) creates a room under `GAME_ID`, shows code + QR + every received photo with stats (KB, chunks, ms from `shot` to complete); `/spike?code=ABCD` (phone) has Enable camera, a preview, a Shoot button (0.4 s cooldown), and per-photo ack status. Throwaway: SC5 deletes it.
- **Acceptance:**
  - SC checks.
  - Unit tests (`src/shared/blob-transfer/__tests__/`): every chunk's `b64.length ≤ 12000`; **16 KB test**: for a 300 KB random blob, `JSON.stringify({t:'send', data: chunk})` with the largest field values (`r: 9999, photo: 14, i: 99, n: 100`) is `< 16384` bytes for every chunk; reassembly in order, reversed, shuffled and with duplicates yields byte-identical output; a missing chunk never completes; `discardFrom` drops partials; `resendUnacked` resends only unacked photos, from chunk 0; an ack stops resends; `dropRound` forgets a round.
  - Unit test `fitLongEdge` (landscape, portrait, already small = no upscale).
  - SC e2e `e2e/sc1-spike.spec.ts`: host `/spike` + phone `/spike?code=…` with the fake camera; phone takes 3 shots; host shows 3 `<img>` whose `naturalWidth`/`naturalHeight` long edge is `≤ 800` and `> 0`; the phone shows 3 acks; the phone's relay socket was never closed (no 1009).
  - `pnpm build:say-cheese && ls apps/say-cheese/dist/spike.html`.
- **Risks / fallbacks:**
  - iOS Safari: `<video>` needs `playsinline` + `muted`, and `play()` after attaching; draw only after `loadeddata`. Permission is per page load on iOS; a reload re-prompts. **Fallback (logged):** keep the stream alive from Enable camera for the page's life; if the track ended (backgrounded tab), re-acquire on the announce screen, where the photographer still has eyes open for a prompt.
  - `facingMode: 'environment'` unsupported/ignored on a laptop → falls back to any camera (`ideal`, not `exact`).
  - `toBlob` returns null on some Android builds for a 0×0 frame → wait for `videoWidth > 0`; error out with a visible message.
  - A frame over the relay limit closes the socket (ws 1009) and reconnect would loop: the 16 KB test guards it; never send a photo in one message.
  - Fake camera is 640×480: no upscale, so e2e asserts `≤ 800`.
- **Leave out:** match logic, real screens, styling beyond legible; binary frames; moving blob transfer into `packages/`.
- **User checkpoint (C1):** after `say-cheese` is pushed and the preview is built: open `<preview>/spike` on the TV or laptop; on **one iPhone (Safari)** and **one Android phone (Chrome)**, scan the QR (or open `<preview>/spike?code=XXXX`), tap Enable camera, allow, check the preview is the **rear** camera, take ~10 shots while moving. Report: did each photo arrive on the TV, are they sharp enough to tell whose elbow it is, the KB per photo and arrival time shown, any errors. Also lock the phone for 10 s, unlock, take 2 more shots (re-acquire path). Optional glance: `<preview>/play?dev=1` on a phone (SC3) and `<preview>/?gallery=1` on the TV (SC4). Notes become fix milestones.

### SC2: Match state machine, scoring, tags, turn queue, seats, leader

- **Goal:** the whole match as a pure, headless state machine: lobby → rules → (pass → announce → scatter → shoot → upload → review → results)×N → matchEnd → rematch/lobby, with seats.
- **Read:** SPEC §6.1–§6.5, §6.7, §7.3, §8, §10 #4–#6, #11–#15; contracts `src/host/match/types.ts`, `src/host/match/config.ts`, `src/shared/messages.ts`, `src/shared/seats/types.ts`; this file §8. Reference only: `apps/sunny-side/src/host/match/{leader.ts,roster.ts,persist.ts}`.
- **Depends on:** SC0.
- **Owns:** `src/host/match/**` (types.ts/config.ts additive), `src/shared/seats/**` (types.ts additive).
- **Order:** test-first: write the transition table tests, then implement. No DOM, no `@pcg/net-client`, no timers of its own (timers are `Effect`s; the clock is injected).
- **Deliverables:**
  - `src/shared/seats/index.ts` (extraction candidate, no game imports): seat id make/parse, per-phone seat lists, add/remove seat with the 8-seat room cap, color assignment from the 8 brand player colors (unique, lowest free), controller-side seat-key store over `StorageLike` (`load/save/add/remove` scoped by room code).
  - `src/host/match/`: `createMatch({rng, now})` → `dispatch(event): Effect[]`, `state`, `tvView()`, `screenFor(phoneId)`; modules `roster.ts` (seats, phones, joinIndex, camera, ready), `queue.ts` (shuffled turn order, skip no-camera, disconnected → next connected goes first and they move to the end, skip if still gone when the queue runs out), `round.ts` (phases, shot count, photos, upload complete/grace), `tags.ts` (validation), `scoring.ts`, `leader.ts` (earliest-joined connected phone, no snap-back), `screens.ts` (per-phone `Screen` and `TvView`), `persist.ts` (serialize/restore `PersistedMatch`), `rng.ts` use of game-kit `rngStream` allowed (plain TS).
  - Rules overview phase (5 cards, `next` / `skip`, last `next` = Let's play; skipped on Rematch; `howToPlay` from lobby returns to lobby).
- **Acceptance:**
  - SC checks.
  - Unit tests in `src/host/match/__tests__/` and `src/shared/seats/__tests__/`, at least one test per rule:
    - **Transitions:** every edge of the phase graph, including invalid-event no-ops in each phase; Start only by the leader (or host) with ≥3 seats, every connected phone ready, ≥1 camera phone; rules shown on the room's first match only; Rematch skips rules, reshuffles, resets scores; Back to lobby; scatter → shoot on timer; shoot ends at `SHOOT_MS` or the 15th shot or `shootDone`; upload ends when all `count` photos arrived or after `UPLOAD_GRACE_MS`; 0 photos → results with no score; review → results only on `finishReview` from the photographer's phone (or leader/host `skipReview` while the photographer is disconnected); results → next photographer or matchEnd after the last.
    - **Pass screen:** `pass` phase only when the photographer's phone has ≥2 seats; `seatConfirm` for the right seat advances; single-seat phones go straight to announce.
    - **Scoring:** +1 per tagged photo per player, −1 per tag to the photographer, Unknown scores nothing, a player tagged in 4 photos gets +4, standings sort lowest first, ties share the win (all tied lowest are winners).
    - **Tag validation:** only from the photographer's phone; photo must exist; target must be a current, non-spectator seat and not the photographer; one tag per player per photo (re-tagging with a different player changes the tag; a duplicate player is rejected); `untag` removes; x, y clamped to 0..1; tags only in `review`.
    - **Turn queue:** every seat photographs exactly once; no-camera phones' seats are skipped; a disconnected photographer at turn start is swapped with the next connected and moved to the end; still gone at the end → skipped; match ends when the queue is empty.
    - **Seats:** add/remove seat, 8-seat cap across phones (the 9th `addSeat` and a 9th phone's profile are refused), colors unique, Ready and camera are per phone and cover all its seats, mid-match joiners are spectators (not tagged, not in the queue) and join the next match.
    - **Leader:** first joiner; handoff to the next-earliest connected phone; no snap-back; only the leader's phone can send leader actions; leader `remove` per seat.
    - **Persist:** `serialize → restore` round-trips roster, scores, queue, round number.
  - `pnpm exec eslint apps/say-cheese/src/host/match apps/say-cheese/src/shared/seats` clean (boundary rule: no DOM types used, no `phaser` / `@pcg/net-client`).
- **Risks / fallbacks:** disconnect/rejoin/leave/refresh behavior beyond "connected flag" is SC6's: leave TODO-free hooks (`peer` events update `connected`; nothing else yet). Choices the spec doesn't cover: simplest, logged.
- **Leave out:** DOM, rendering, networking, timers implementation, emoji, audio; late-rejoin matching and refresh replay (SC6).
- **User checkpoint:** none.

### SC3: Phone controller shell and screens (single seat)

- **Goal:** every phone screen in SPEC §6.7 for a single-seat phone, rendered from `Screen` messages, on the controller-kit app shell, with an offline dev mode.
- **Read:** SPEC §3, §6.2, §6.2.1, §6.4, §6.5, §6.7, §6.8 (first bullet); `PLATFORM.md` §3; contracts `src/shared/messages.ts`, `src/controller/camera/types.ts`, `src/shared/sfx.ts`; `packages/controller-kit/src/index.ts` and `src/shell/app.ts`, `src/dev.ts`; `src/styles/brand.css`; `brand/preview.html` (look only).
- **Depends on:** SC0.
- **Owns:** `src/controller/**` except `src/controller/camera/**`; `src/styles/controller.css`.
- **Deliverables:**
  - `src/controller/main.ts` + `app.ts`: `createAppShell` (Wake Lock, fullscreen on tap, overlays for reconnecting / host away / kicked / room closed), portrait; screen router keyed by `Screen.kind`; `send` through an injected client; camera and sfx injected (`Camera` fake + `noopSfx` in dev and tests).
  - `src/controller/screens/`: joining (name, prefilled from `localStorage`), lobby (name, color chip, Enable camera with the "no camera" badge + hint, Ready, leader Start / How to play), rules (leader Next/Skip/Let's play, else "Watch the TV"), announce (photographer: live preview + I'm ready, which calls `sfx.unlock()` and sets `navigator.audioSession.type = 'playback'` where present; dodger: "Get ready to dodge!"), scatter (photographer dark "Eyes closed! Starting in…"; dodger "Scatter! Pocket your phone and keep moving."), shoot (whole screen is the shutter, faint big counter "7 / 15", cooldown and the 15-shot cap and local end-of-shoot enforced on the phone from `endsInMs`), upload/review/results/matchEnd/spectating/left.
  - `src/controller/review/`: photo view over local blobs (injected `photoUrl(r, photo)`), tag circles at normalized positions (`--tag-size`, `--tag-stroke-phone`), bottom sheet (players + Unknown, greyed ✓ for already tagged, Remove on an existing circle, tap outside discards a new circle), Prev / Next / Finish review with an "Are you sure?" step. Pure helpers (`shutter.ts` cooldown/cap, `tagSheet.ts` options) unit-tested.
  - `src/controller/dev.ts`: `?dev=1` via `createDevHarness` / `createLocalClient`: a switcher through every screen with sample data and a fake camera (canvas test pattern).
  - Only player-facing words "dodge"/"scatter", never "hide" (SPEC §6.1).
- **Acceptance:**
  - SC checks (includes `check:bundle say-cheese`: play.html JS ≤ 40 KB gzip).
  - jsdom tests (`src/controller/__tests__/`): each `Screen.kind` renders `[data-screen=<kind>]`; shutter: two taps 300 ms apart = 1 shot, 500 ms apart = 2, no shot after 15 or after the local deadline; tag sheet: tagged players disabled, Unknown present, Remove only on existing circles, new circle discarded on outside tap; Finish needs confirm; leader buttons only when `isLeader`; I'm ready calls `sfx.unlock`.
  - `! grep -rniw "hide" apps/say-cheese/src/controller` (player-facing text never says "hide"; don't name code `hide` either).
  - `! grep -rnE "from '(\.\./)+host/|phaser" apps/say-cheese/src/controller` prints nothing.
- **Risks / fallbacks:** iOS ignores `touch-action` in some cases → `user-scalable=no` viewport + `preventDefault` on the shutter's `touchstart`; fullscreen is a no-op on iPhone (expected). Wake Lock unsupported (iOS < 16.4) → shell ignores it; the photographer's dark screen still keeps updating while touched.
- **Leave out:** shared-device UI (Players on this phone, Add another player, pass screen: SC7; render `pass` as a plain placeholder), emoji bar (SC10), real camera and network wiring (SC5), audio synthesis (SC8).
- **User checkpoint:** C1 glance only (see SC1).

### SC4: TV views and host controls

- **Goal:** every TV screen in SPEC §6.6 rendered from `TvView`, with host-side leader controls and an offline gallery.
- **Read:** SPEC §6.2, §6.2.1 (cards), §6.4 (TV side), §6.5, §6.6, §6.8; `PLATFORM.md` §2–§4; contracts `src/host/match/types.ts` (`TvView`), `src/shared/messages.ts`, `src/shared/sfx.ts`; `packages/game-kit/src/index.ts` (`qrMatrix`, `joinUrl`, `installDebug`); `src/styles/brand.css`; `brand/preview.html` (look only).
- **Depends on:** SC0.
- **Owns:** `src/host/**` except `src/host/match/**`; `src/styles/tv.css`.
- **Deliverables:**
  - `src/host/view/`: `renderTv(root, view: TvView, controls)` with one module per phase: lobby (QR via `qrMatrix` + room code, players with color/ready/no-camera badge, leader name, a "🔊 Sound on" button that calls `sfx.unlock()`), rules (5 cards from SPEC §6.2.1, progress dots, "Leader: Next / Skip"), pass ("Pass the phone to {name}"), announce, scatter (name + huge countdown from `endsInMs`), shoot (timer + "📸 7 / 15", white flash element toggled per shot, never photos), upload ("Developing photos… n / N"), review (photo as large as fits, tag circles at normalized x/y sized `--tag-size` of the short side with player color + name label, Unknown "?" grey, "Caught this round" strip, "Photo 4 / 15 · {name}"), results (round catches + standings lowest first), matchEnd (winners, "Hardest to photograph", plain podium).
  - `src/host/controls.ts`: host leader controls as buttons + keyboard (Enter/→ = primary, Esc = Skip, R = Rematch, L = Back to lobby), no hover; emits host-control events.
  - `src/host/gallery.ts`: `/?gallery=1` cycles every phase with fixture `TvView`s (including 8 players, 15 photos with many tags, ties) using generated placeholder images (canvas or inline SVG data URLs).
  - `src/host/main.ts`: gallery mode or the placeholder lobby; `installDebug` with `window.__pcg` (filled by SC5).
- **Acceptance:**
  - SC checks.
  - Node/jsdom tests (`src/host/view/__tests__/`): each phase renders `[data-tv=<phase>]`; tag circle at `x=0.25, y=0.5` lands at 25%/50% of the photo box; standings sorted lowest first with ties marked; shoot view contains no `<img>`; QR renders for a code; keyboard controls emit the right events.
  - `! grep -rniw "hide" apps/say-cheese/src/host/view` (the rules card's "no hiding behind couches" is spec copy and allowed; the word "hide" is not).
  - `pnpm build:say-cheese` and `pnpm check:bundle say-cheese` (host code never in play.html).
- **Risks / fallbacks:** TV distance legibility: sizes from brand tokens, minimum body text from the kit's TV scale. Photo aspect differs (portrait vs landscape shots): fit inside the stage, tags positioned relative to the image box, not the stage.
- **Leave out:** animations beyond the flash toggle (SC9), emoji layer (SC10), audio (SC8), net wiring (SC5), shared-seat grouping in the lobby (SC7).
- **User checkpoint:** C1 glance only (see SC1).

### SC5: Vertical slice wiring

- **Goal:** a real, full match on real phones: host client ↔ match ↔ TV view ↔ phones ↔ camera ↔ photo transfer, with debug hooks and a full-round e2e; delete the spike.
- **Read:** SPEC §6.2, §6.3 (lobby), §6.4, §7, §8; this file §8; `packages/net-client/src/api.ts`; `packages/game-kit/src/index.ts` (`relayUrl`, `watchVisibility`, `createHostWakeLock`, `installDebug`); the public exports of SC1–SC4 modules (`src/shared/blob-transfer/index.ts`, `src/controller/camera/index.ts`, `src/host/match/index.ts`, `src/host/view/index.ts`, `src/controller/app.ts`).
- **Depends on:** SC1, SC2, SC3, SC4 merged; C1 approved (C1 fixes merged).
- **Owns:** `src/host/game.ts`, `src/host/net.ts`, `src/host/timers.ts`, `src/host/main.ts`, `src/host/debug.ts`, `src/host/sfx.ts` (returns `noopSfx`), `src/controller/net.ts`, `src/controller/photos.ts`, `src/controller/sfx.ts` (returns `noopSfx`), `src/controller/main.ts`; deletes `spike.html`, `src/spike/**` and the spike input in `vite.config.ts`; `e2e/sc5-*.spec.ts`; additive helpers in `e2e/helpers.ts`.
- **Deliverables:**
  - Host: `createHostClient({game: GAME_ID, maxPlayers: 10})`; `onMessage` → `isPhoneMsg` → `match.dispatch`; chunks → blob receiver → `photoAck` + match photo-arrived event; `Effect`s executed (send per phone, timers with `performance.now()` deadlines scaled by `timeScale`, paused while the tab is hidden via `watchVisibility`); TV re-render on every change; Wake Lock; object URLs revoked at match end; `sfx.play` calls at every SPEC §6.8 moment (no-op until SC8).
  - Phone: `createControllerClient`; `hello` on every open; camera from SC1 (Enable camera in the lobby, preview on announce); photos captured on shutter, stored locally per round, sent via the blob sender as they are taken, `shot` + `shootDone`; review uses local blobs; `sfx.play('shutter')` per shot (no-op until SC8).
  - `window.__pcg` (dev or `?debug=1`): `code()`, `phase()`, `state()`, `tv()`, host controls, `setTimeScale(n)`.
- **Acceptance:**
  - SC checks.
  - SC e2e `e2e/sc5-round.spec.ts` (fake camera, `?debug=1&timeScale=0.1`): host + 3 phones join, enable camera, ready; leader Start; Skip rules; announce → photographer taps I'm ready → scatter → shoot: 5 taps; upload completes (TV shows 5 / 5); review on the photographer's phone: tag player B on photo 1 and 2, Unknown on photo 3, change a tag, remove a tag; the TV shows each circle as it is placed (count of `[data-tag]` matches); Finish review → results show B +2, photographer −2; Next photographer twice more → matchEnd with the lowest score as winner; Rematch returns to announce without rules.
  - SC e2e `e2e/sc5-limits.spec.ts`: 15th shot ends the shoot early; 0 photos (photographer taps nothing until the timer) → results with no score; a non-photographer phone's `tag` message is ignored (send raw via the page's client hook); a 9th player's join is refused.
  - `test ! -e apps/say-cheese/spike.html && ! grep -rq spike apps/say-cheese/src apps/say-cheese/vite.config.ts`.
  - `pnpm check:bundle say-cheese` (≤ 40 KB gzip; if over, log the measured size and raise the limit by ≤ 20% in a Build decision, never by touching other apps' limits).
- **Risks / fallbacks:**
  - Upload stalls on slow Wi-Fi → the 10 s grace moves on with what arrived (SPEC §6.2.4).
  - A sleeping dodger phone shows as disconnected; the match must not change (SC6 adds the full rules; SC5 only keeps them in the roster).
  - Host tab hidden → timers pause (SPEC §8); the TV is always visible at the event.
- **Leave out:** disconnect/rejoin/leave/refresh rules beyond the connected flag (SC6), shared seats UI (SC7), sound (SC8), polish (SC9), emoji (SC10).
- **User checkpoint (C2):** after the push and the preview build: TV or laptop opens `<preview>/` (fullscreen, sound irrelevant). **3 people, 3 phones** (≥1 iPhone, ≥1 Android) scan the QR, enter names, Enable camera, Ready. Leader taps Start, skips or reads the rules. Play **one full round in a real room**: photographer closes eyes, scatter, shoot, review with tagging (try Unknown, change and remove a tag), results. Then play the remaining two rounds to matchEnd if time allows. Report: anything confusing, photo quality on the TV, tag circle placement, timing (scatter 10 s, shoot 20 s), any stuck screen (with which phone and what was on it).

### SC6: Disconnects, late rejoin, leave/remove, host refresh, photo retry

- **Goal:** SPEC §6.3's disconnect, rejoin, leave and refresh rules, so sleeping phones, iOS tab kills and a host refresh never break a match.
- **Read:** SPEC §3 (Sleeping phones), §6.3, §6.3.1 (Disconnects, Leaving), §6.5, §7.1, §7.4 (Retry); `apps/relay/SPEC.md` §3 (Identity & reconnect); `packages/net-client/src/api.ts`; this file §8; module exports of `src/host/match/index.ts`, `src/shared/seats/index.ts`, `src/shared/blob-transfer/index.ts`, `src/host/game.ts`, `src/controller/net.ts`, `src/controller/photos.ts`.
- **Depends on:** SC5; C2 approved (C2 fixes merged).
- **Owns:** `src/host/match/**`, `src/host/game.ts`, `src/host/net.ts`, `src/controller/net.ts`, `src/controller/photos.ts`, `src/controller/screens/leave.ts` (new: Leave game + Remove a player list), `e2e/sc6-*.spec.ts`.
- **Order:** test-first in `src/host/match/__tests__/` for every rule below.
- **Deliverables:** match rules + wiring for: disconnected dodger stays taggable with turn and score; photographer gone in pass/announce/scatter → round cancelled, no score, moved to the queue end (skipped if still gone at the end); gone in shoot/upload/review → keep arrived photos, review waits, leader/host get Skip review; turn comes up while disconnected → next connected goes first; late rejoin by player key (seat 0 = relay `playerKey`, other seats from `hello.seats[].seatKey`) restores name, color, score, turn for every seat; `leave` and leader/host `remove` = full removal (tags already scored stay in the photographer's score; same key later = new spectator); host refresh restores roster, scores, queue, round number from `sessionStorage` and **replays** an in-progress round with the same photographer under a new `r`; phone resends unacked photos after reconnect, drops them when it sees `review` / a new `r`; host drops chunks of a finished upload phase or a stale `r`; review on a phone that lost its local photos shows an empty frame with the host-sent `aspect` and "Look at the TV".
- **Acceptance:**
  - SC checks.
  - Unit tests, one per rule above (incl.: dodger disconnect during shoot is still taggable; photographer disconnect in scatter cancels and requeues; photographer disconnect in review enables Skip review for leader + host only, and Skip review scores tags so far; rejoin by key after the relay window restores all seats; leader handoff on leader disconnect, no snap-back on return; leave removes from queue and standings but the photographer keeps the −1s; persisted state → restore → replay round with a new `r`; stale-`r` chunks ignored).
  - SC e2e `e2e/sc6-reconnect.spec.ts` (fake camera, `timeScale` 0.1, relay `PLAYER_RECONNECT_MS=2000`): (a) a dodger's context goes offline during shoot and returns: still in the match, taggable; (b) the photographer's page is closed mid-upload and reopened with the same `localStorage` after > 2 s: rejoins by key, unacked photos arrive, review proceeds; (c) host page reload mid-shoot: same room code, scores and queue intact, the round replays with the same photographer; (d) leader removes a player from the host controls: gone from standings.
- **Risks / fallbacks:** the relay's 30 s window vs iOS tab kills: player key handles it. Host refresh can't reclaim after 120 s (relay SPEC #4): out of scope. If host-refresh replay is late, cut it per cut order item 5 (refresh returns to the lobby with the roster).
- **Leave out:** relay or net-client changes; shared-device lobby UI (SC7).
- **User checkpoint:** C3 (see SC8).

### SC7: Shared devices UI

- **Goal:** SPEC §6.3.1 on the phone and the TV: several players per phone, pass screen, TV grouping.
- **Read:** SPEC §6.3.1, §6.7, §7.3 (`addSeat`, `removeSeat`, `seatConfirm`, `profile`); contracts `src/shared/seats/types.ts`, `src/shared/messages.ts`; `src/shared/seats/index.ts` exports; `src/controller/screens/lobby.ts`; `src/host/view/lobby.ts`.
- **Depends on:** SC5; C2 approved.
- **Owns:** `src/controller/screens/lobby.ts`, `src/controller/screens/seats.ts` (new), `src/controller/screens/pass.ts`, dodger screens' name lists (`src/controller/screens/dodger.ts`), `src/host/view/lobby.ts`, `src/host/view/pass.ts`, `e2e/sc7-*.spec.ts`.
- **Deliverables:** lobby "Players on this phone" chips (name + color, ✕), "+ Add another player on this phone" (name step; disabled at 8 seats), collapsible "Why share a phone?" with the spec copy; seat keys saved per seat via the seats store; pass screen "Pass the phone to {name}" + big "I'm {name}"; dodger screens list every seat ("Ana, Leo, Mia: scatter!"); TV lobby groups shared seats under the phone's first player with a 📱 marker; TV pass view.
- **Acceptance:**
  - SC checks.
  - jsdom tests: add/remove seat sends the right messages; Add disabled at 8; pass screen only for a multi-seat photographer; dodger copy lists all seats.
  - SC e2e `e2e/sc7-shared.spec.ts`: phone A has 3 seats, phones B, C have 1 (5 players); a full match runs with `timeScale` 0.1; each of A's seats sees the pass screen before its turn; B and C never do; a seat on A can be tagged and scored separately; removing one seat on A leaves the other two.
- **Risks / fallbacks:** a one-phone game (all seats on one phone): the leader controls and the photographer screens share the phone; test it in e2e with 3 seats on one phone and no other phone.
- **Leave out:** relay changes; extracting seats into `controller-kit`.
- **User checkpoint:** C3 (see SC8).

### SC8: Audio (Web Audio synth)

- **Goal:** every SPEC §6.8 sound, synthesized in code, on the TV and the photographer's phone.
- **Read:** SPEC §3 (audio bullet), §6.2 (when each sound plays), §6.8; contract `src/shared/sfx.ts`; `src/host/sfx.ts`, `src/controller/sfx.ts` (SC5 no-op stubs).
- **Depends on:** SC5; C2 approved.
- **Owns:** `src/shared/audio/**`, `src/host/sfx.ts`, `src/controller/sfx.ts`.
- **Deliverables:** `src/shared/audio/synth.ts` (one shared `AudioContext`, unlock on a user gesture, short envelopes: beep, final beep, start buzz, end buzz, shutter click (noise burst), develop chime, results sting; master gain), `createSfx()` implementing `Sfx`; `navigator.audioSession.type = 'playback'` where present; host `sfx.ts` unlocks on the lobby "Sound on" button and on any host click/keydown; phone `sfx.ts` unlocks on I'm ready.
- **Acceptance:**
  - SC checks.
  - Unit tests with a fake `AudioContext`: `play` before `unlock` is a silent no-op (no throw); after `unlock`, each `SfxName` schedules nodes; `audioSession` set when present and skipped when absent.
  - SC e2e `e2e/sc8-audio.spec.ts`: on the host, a click on Sound on makes `window.__pcg.sfxUnlocked()` true and a round plays without console errors.
- **Risks / fallbacks:** TV autoplay policy blocks audio until a gesture on the host page → the lobby's "🔊 Sound on" button (and any host key/click) unlocks it; iOS silent switch → `audioSession` (iOS 17+); older iOS stays silent on the phone (the TV has every sound). Phone click is cut-if-late (cut order 3).
- **Leave out:** audio files or SFX packs; music.
- **User checkpoint (C3, covers SC6–SC8):** preview, TV + **4–5 people, one phone shared by 2 players** (the rest one phone each, iOS + Android). Click "Sound on" on the TV. Play a full match. During it: lock a dodger's phone through a whole round; close the photographer's browser tab mid-review and reopen the link; refresh the TV page once mid-round; flip the iPhone silent switch on during the photographer's turn (is the click audible?). Report: anything stuck or lost, the shared phone's pass screens, every sound (too loud, too quiet, annoying), and whether the scores at the end look right.

### SC9: TV polish

- **Goal:** the "say cheese" moments on the TV: flash, developing prints, podium, rules illustrations, transitions, all from the brand kit.
- **Read:** SPEC §6.0, §6.2.1, §6.6; `src/styles/brand.css`; `brand/preview.html` (the instant-print look), `brand/mark*.svg`; `src/host/view/` (structure only).
- **Depends on:** C3 approved (C3 fixes merged).
- **Owns:** `src/host/view/**` except `lobby.ts`, `pass.ts`, `emoji.ts`; `src/styles/tv.css`; `e2e/sc9-*.spec.ts`.
- **Deliverables:** white flash + shot counter pop per shot; "developing" print animation in upload; review photo as an instant print (cream frame, tilt, pink offset shadow per the kit's color rule; tags never pink); results catches animation; matchEnd podium ("Hardest to photograph") with tie handling; simple illustrations for the 5 rules cards (inline SVG/CSS); `prefers-reduced-motion` respected.
- **Acceptance:**
  - SC checks.
  - SC e2e `e2e/sc9-gallery.spec.ts`: `/?gallery=1` renders every phase with no console errors and saves screenshots to `e2e/__screens__/` (gitignored) for C4; a tie of two winners shows both on the podium.
  - `grep -c "#[0-9a-fA-F]\{3,6\}" apps/say-cheese/src/styles/tv.css` prints `0` (colors only from tokens).
- **Risks / fallbacks:** TV GPU on a cheap smart TV browser → animations use `transform`/`opacity` only.
- **Leave out:** lobby and pass views (SC7 owns), emoji (SC10), new brand assets.
- **User checkpoint:** C4 (see SC10).

### SC10: Emoji reactions

- **Goal:** SPEC §6.6 emoji: every non-photographer phone (and spectators) can react during review and results.
- **Read:** SPEC §6.3 (mid-match joiners), §6.6 (emoji bullet), §7.3 (`emoji`); `src/shared/messages.ts` (`EMOJI`, `canEmoji`); `src/host/game.ts` (message routing only).
- **Depends on:** C3 approved.
- **Owns:** `src/host/emoji/**` (cooldown + on-screen cap, plain TS), `src/host/view/emoji.ts`, `src/controller/screens/emojiBar.ts`, one routing line each in `src/host/game.ts` and the review/results/spectating phone screens; `e2e/sc10-*.spec.ts`.
- **Deliverables:** phone emoji bar (📸 😂 😱 🙈 👀) when `canEmoji`; host per-phone 0.5 s cooldown, ~12 on screen (oldest dropped), floating emoji layer on the TV in review/results.
- **Acceptance:**
  - SC checks.
  - Unit tests: cooldown drops a second emoji within 500 ms; the 13th on screen evicts the oldest; the photographer's emoji is ignored; out-of-range index ignored.
  - SC e2e `e2e/sc10-emoji.spec.ts`: in review, a dodger taps 😂 and the TV shows it; the photographer's phone has no bar.
- **Risks / fallbacks:** first to cut (cut order 1).
- **Leave out:** emoji in other phases; custom emoji.
- **User checkpoint (C4, covers SC9–SC10):** the event rehearsal on the preview, on the **actual TV or the laptop you will use at the event**, **5+ people**, a full match + a Rematch. Check from across the room: rules cards readable, names and tag circles readable, flash/podium moments land, emoji fun not noisy. Answer: is this ready for the event? Notes become the last fixes (S5).

## 4. Subagent brief template

```text
You are building milestone {SC#}: {Milestone name}, of Say Cheese! (apps/say-cheese).
Goal: {Goal}

Setup: in your checkout (worktree or main), `git checkout -b {build/sc<N>-<slug> | build/sc<N>-fix-<k>} say-cheese`.
Read ONLY: apps/say-cheese/BUILD_PLAN.md §2, §4, §8 and your milestone entry; {Read list}. Read other
files only where your Deliverables require it. {For fixes: "User notes: <verbatim notes>"}

Owns (write only here): {Owns}
Deliverables: {Deliverables}
Order: {Order, if any}
Acceptance (build until every command passes; run them yourself): {Acceptance}
Leave out: {Leave out}

Rules:
- Contracts: change frozen files (BUILD_PLAN §3 Freeze points) only additively; when you do, update the
  contract file, the SPEC section it implements, and add a line under BUILD_PLAN §8 Build decisions.
- Never touch packages/**, apps/relay/src/**, apps/sunny-side/**, apps/fort-frenzy/**, the brand kit
  (src/styles/brand.css, public/**, brand/**). Root files only if your entry lists them.
- Follow AGENTS.md: conventions, lint boundaries, tests next to code in __tests__/, a spec citation in
  every new source file's header comment (e.g. `// Turn queue (SPEC §6.1, §6.3)`), exact-pinned deps
  with the lockfile, LF endings, Prettier.
- If you can spawn agents, hand side work to cheaper helpers: `haiku` for file lookups, running commands
  and digesting long logs; `sonnet` for researching browser APIs, drafting tests or fixtures, and
  mechanical multi-file edits. Keep the milestone's hard logic for yourself.
- A choice the spec doesn't cover: pick the simplest option and log one line under BUILD_PLAN §8 Build
  decisions as `- [{SC#}] decision: …, because ….`
- Blocked: write it under BUILD_PLAN §7 Blockers in the given format, commit, stop. Don't guess.
- Done: tick your items in BUILD_PLAN §6 (not "Merged" or "User approved"), commit, `git rebase
  say-cheese`, rerun acceptance if the rebase pulled anything in. Don't merge, don't push.
- Reply in 150 words or fewer: what was built, what was deferred, blockers, branch name.
```

## 5. Orchestrator rules

1. Read only `apps/say-cheese/BUILD_PLAN.md`. Never read source code. Trust subagent reports and the
   Progress checklist.
2. Start every session: `git fetch origin say-cheese && git checkout say-cheese && git pull --ff-only
   origin say-cheese`; read §6 Progress, §7 Blockers and `git log --oneline -15`; then run §1
   pre-flight (via a `haiku` helper).
3. One subagent per milestone via the Agent tool with the milestone's model from §3. Run the
   milestones marked parallel in the same turn with `isolation: "worktree"`; serial milestones (SC0,
   SC5) run in the main checkout. Fill the §4 brief from the milestone entry.
4. Everything that isn't milestone work goes to cheaper helpers: `haiku` for reading and summarizing
   files, logs, diffs or command output, running pre-flight and check commands, ticking the checklist
   and logging Blockers / Build decisions; `sonnet` for research and for drafting checkpoint
   instructions for the user. Ask each helper for only the answer you need. A helper may read source
   code to answer a narrow question; you don't.
5. Merge per §2 (`git merge --ff-only`), in dependency order, and push `say-cheese` after each merge.
6. After each merge, spawn a `test-runner` agent (`model: "haiku"`) on `say-cheese` with the
   milestone's acceptance commands; only failures come back. On a failure, resume that milestone's
   subagent (SendMessage) with the output, then merge its fix the same way.
7. Stop at user checkpoints (C1–C4) and unresolved Blockers. Tell the user exactly what's needed: the
   preview URL (the `say-cheese` branch preview, §9), which devices, how many people, what to try, the
   question to answer. Checkpoint notes become fix subagents (`build/sc<N>-fix-<k>`, owner's model).
8. Track the schedule: at each session start compare today's date with §0 targets. If behind, propose
   the next cut from the §3 cut order and wait for the user's yes before dropping it. Log approved cuts
   under §8 and mark the milestone's checklist items `~~cut~~`.
9. No extra reviews, audits or re-exploration unless an acceptance check fails.
10. When every non-cut item is checked, run the Full gate (`pnpm check && pnpm e2e`) via a test-runner,
    tick it, and print §9 Final handoff.

## 6. Progress checklist

- [x] Pre-flight green (S1)
- **SC0**
  - [x] `origin/main` merged; kits available; tables resolved
  - [x] Brand kit unpacked, zip removed
  - [x] App scaffold, Vite/Vercel/Playwright configs, smoke e2e
  - [x] Contracts: messages, match types + config, blob-transfer types, seats types, camera + sfx interfaces
  - [x] Root wiring: scripts, lockfile, Dockerfile, check-bundle limit, .prettierignore, tables; SPEC §8/§9/§10 updated
  - [x] Full gate green
  - [x] Merged to `say-cheese` and pushed
- **SC1**
  - [x] Blob transfer module + tests (incl. 16 KB envelope test)
  - [x] Camera module + tests
  - [x] Spike page + spike e2e
  - [x] Merged to `say-cheese` and pushed
  - [x] User approved C1 (camera spike on iPhone + Android)
- **SC2**
  - [x] Seats module + tests
  - [x] Match state machine (phases, rules, rounds, matchEnd, rematch) + transition tests
  - [x] Scoring, tags, turn queue, leader, persist + tests
  - [x] Merged to `say-cheese` and pushed
- **SC3**
  - [x] App shell + router + dev mode
  - [x] Lobby, rules, photographer, dodger, results screens
  - [x] Review + tag sheet + shutter helpers + tests
  - [x] Merged to `say-cheese` and pushed
- **SC4**
  - [x] TV views for every phase + tests
  - [x] Host controls (buttons + keyboard) + gallery
  - [x] Merged to `say-cheese` and pushed
- **SC5**
  - [x] Host wiring (client, match, receiver, timers, debug)
  - [x] Phone wiring (client, camera, photos, sender)
  - [x] Spike removed; round + limits e2e
  - [x] Merged to `say-cheese` and pushed
  - [ ] User approved C2 (one round, 3 people in a room)
- **SC6**
  - [ ] Disconnect + turn-queue rules + tests
  - [ ] Late rejoin (all seats), leave/remove + tests
  - [ ] Host refresh replay, photo retry, stale-round drops + tests
  - [ ] Reconnect e2e
  - [ ] Merged to `say-cheese` and pushed
- **SC7**
  - [ ] Phone seats UI + pass screen + tests
  - [ ] TV lobby grouping + pass view
  - [ ] Shared-device e2e
  - [ ] Merged to `say-cheese` and pushed
- **SC8**
  - [ ] Synth + `Sfx` + tests
  - [ ] Host and phone unlock wiring + audio e2e
  - [ ] Merged to `say-cheese` and pushed
  - [ ] User approved C3 (full match, shared phone, disconnects, refresh, sound)
- **SC9**
  - [ ] Flash, developing, print review, results, podium, rules illustrations
  - [ ] Gallery e2e + screenshots
  - [ ] Merged to `say-cheese` and pushed
- **SC10**
  - [ ] Emoji host module + TV layer + tests
  - [ ] Phone emoji bar + e2e
  - [ ] Merged to `say-cheese` and pushed
  - [ ] User approved C4 (event rehearsal)
- [ ] Full gate green (`pnpm check && pnpm e2e`)
- [ ] Final handoff printed

## 7. Blockers

_None._

Format: `- [SC#] YYYY-MM-DD: what's blocked, what was tried, what's needed from whom.`

## 8. Build decisions

Format: `- [SC#] decision: one line, with the reason.`

- [plan] Event date Wed 2026-11-11; core done by Sun 11-08, two buffer days. User's date.
- [plan] Kits: merge `origin/main` into `say-cheese` once (SC0) and use `@pcg/controller-kit` / `@pcg/game-kit` as they are (both are on `main`, frozen at FF0). SPEC §4 rule; user approved. Nothing is copied from Sunny Side; `fort-frenzy` branch code is never used.
- [plan] Brand kit: unpack `say-cheese-brand-kit.zip` in SC0 (read-only like Sunny Side's), delete the zip; settles SPEC §9.1. User approved.
- [plan] Sounds: synthesized with Web Audio, no files; settles SPEC §9.2. User approved.
- [plan] Extraction candidates (stay in the app, no game imports, logged here): `src/shared/blob-transfer/` (→ `net-client` `sendBlob`/`onBlob`, SPEC §7.4), `src/shared/seats/` + the pass screen (→ `controller-kit`, SPEC §6.3.1).
- [plan] Root edits limited to SC0: five scripts, lockfile, Dockerfile COPY line, `check-bundle.mjs` limit entry (`'say-cheese': 40` KB gzip; the script fails without one), `.prettierignore` brand + entry-HTML lines, the game tables. `check:bundle`'s Phaser check is skipped for a non-Phaser app; `check:routes` passes with the kit's `head.html`, `public/` files, `data-entry` markers and game-kit's `playRoute()`.
- [plan] No relay or protocol change: each chunk envelope stays < 16 KB (12,000 base64 chars + ~80 bytes); an oversize frame would make ws close the socket with 1009, so the SC1 unit test guards it.
- [plan] Spec gaps settled for `messages.ts` (SC0 writes them into SPEC §7.3/§8 and the decision log): leader actions add `skip` (rules) and `howToPlay` (lobby); `{t:"hello", seats:[{seat, seatKey, name}]}` on every (re)connect so the host can restore extra seats (seat 0's key is the relay `playerKey`); every photo message (`shot`, `chunk`, `shootDone`, `photoAck`) carries round id `r` so replayed/cancelled rounds never mix photos; review screens carry each photo's `aspect`.
- [plan] Timers: screens carry `endsInMs`; the phone sets its local deadline on receipt (error = one-way relay latency, ≪ ±100 ms needed) instead of a clock-offset handshake. Simplest equivalent of SPEC §8.
- [plan] Start needs ≥3 seats, every connected phone Ready, and ≥1 phone with a camera (otherwise no one can be photographer).
- [plan] Chunks for an upload phase that has ended, or for a stale `r`, are dropped; the phone stops resending when it sees `review` or a new `r`. Keeps SPEC §6.2.4 "moves on with whatever arrived" simple.
- [plan] A photographer phone that lost its local photos (tab killed) reviews over an empty frame of the right aspect with "Look at the TV"; no host→phone photo transfer in v1.
- [plan] Camera stream stays open from Enable camera for the page's life and is re-acquired on the announce screen if the track ended (iOS re-prompts per page load; the photographer's eyes are open there).
- [plan] Real-phone testing only on Vercel previews (HTTPS); LAN dev with phones is not supported for the camera (no trusted cert). Local work uses `?dev=1`, `?gallery=1` and the fake camera in e2e.
- [plan] e2e speed: debug `?timeScale=` scales scatter/shoot/upload timers; e2e runs at 0.1.
- [plan] Sandbox Playwright: the preinstalled Chromium is linked to the version `@playwright/test` 1.64.1 expects (pre-flight); the CDN is blocked.
- [plan] Docker is unavailable in the sandbox: SC0 checks that every workspace `package.json` is COPYed in `apps/relay/Dockerfile` instead of building the image.
- [SC0] decision: `git merge origin/main` was a fast-forward (`main` already held `say-cheese` via PR #1, kits included), so there is no merge commit and no table conflicts; the Say Cheese table rows move to "In build" in the SC0 commit, because there was nothing to merge.
- [SC0] decision: `shot` carries the frame's `aspect` (width / height) and the host copies it into `Round.photos` and the review screens, because the frozen `Chunk` has no room for it and the phone knows the size at capture.
- [SC0] decision: host → phone is `{t:'screen', screen}` with `screen.kind` as the discriminator and the `data-screen` value, plus `isHostMsg` (a shallow guard) for the phone, because it matches Sunny Side and e2e `screen(page, kind)`.
- [SC0] decision: `seats/types.ts` types `Seat.color` as a plain string and adds `seatId`/`parseSeatId`/`seatKeysStorageKey(code)`, because the folder stays free of game imports (extraction-ready); `messages.ts` narrows colors to `PLAYER_COLOR_IDS` (brand.css order, lilac instead of rose).
- [SC0] decision: `config.ts` adds `RULES_CARDS = 5`, `setTimeScale()` and `scaled(ms)` beside `timeScale`, because SC2 and SC5 both need the card count and one place to apply `?timeScale=`.
- [SC0] decision: the match is a reducer `(state, event) → (state, effects)`; `MatchEvent` adds `photo` (receiver finished a photo) and `room` (code), `Effect` adds `releasePhotos` (revoke object URLs), because photo arrival and the room code feed the upload count and the TV lobby.
- [SC4] decision: `renderTv(root, view, {emit, sfx, origin})` takes the join origin as a control field, because `TvView.lobby` carries the code but not the URL the QR encodes.
- [SC4] decision: the QR is an inline SVG path (not canvas), because it renders in jsdom tests and scales crisply on a TV.
- [SC4] decision: view tests opt into jsdom with a `// @vitest-environment jsdom` docblock, because `vitest.config.ts` is root-owned by SC0 and only maps `src/controller/**` to jsdom.
- [SC4] decision: the lobby shows a per-player remove button (emits `remove`) and Enter/→ never Starts while `canStart` is false, because SPEC §6.5 gives the host remove and the match would reject it anyway.
- [SC3] decision: the controller keeps its own `DEFAULT_COOLDOWN_MS = 400` (`controller/ctx.ts`) because `controller/**` can't import `host/match/config`; the cap comes from the screen's `maxShots`.
- [SC3] decision: `main.ts` outside `?dev=1` mounts the app on a local client with a fake camera (`controller/fakeCamera.ts`) until SC5 wires the relay client and real camera; the `hello` message and `photoAck` handling (`onHostMsg`) are SC5's.
- [SC3] decision: a failed capture gives the shot back only if it was the latest, because shot indexes must stay contiguous for the host; the photographer's `shootDone` waits for in-flight captures.
- [SC1] decision: `createBlobSender().add(r, photo, Blob | Uint8Array)` encodes async but sends in `add` order (a promise chain; a failed encode rejects only that photo), because base64 of a `Blob` is async and photos must go in shot order.
- [SC1] decision: `createBlobReceiver` takes an optional `sendAck(sender, ack)` and re-acks an already complete photo when a resend reaches its last chunk, because a lost ack would otherwise leave the phone resending that photo after every reconnect.
- [SC1] decision: the camera captures from its own hidden 1 px `<video>` kept in the DOM; `attach()` only adds previews, because a shot must not depend on which screen's preview is mounted and iOS may stop decoding a detached video.
- [SC1] decision: the spike's "ms" is measured on the TV from the `shot` message's arrival to the photo's last chunk, because phone and TV clocks aren't synced.
- [SC1] decision: `spike.html` is Prettier-formatted (it isn't in `.prettierignore`), because only SC0 edits root files and SC5 deletes the page.
- [SC2] decision: `createMatch({ rng: () => number, now, restored? })` also returns `flush()` (pending screens/snapshot after create or restore) and `phoneIds()`; seatless phones live in a private phone map, not `MatchState`, because the frozen types need no change.
- [SC2] decision: `turns` = the camera-ok seats queued at match start (no-camera seats never count), because "round 3 / N" must be reachable.
- [SC2] decision: How to play (from the lobby) doesn't mark the rules seen; only Start does, because the spec ties "first match only" to Start.
- [SC2] decision: during `pass`, other phones get the dodger `announce` screen; seatless and spectator-only phones get `spectating` from pass to review and the normal results/matchEnd screens, because a spectating leader must still reach Next / Rematch.
- [SC2] decision: a phone gets a `screen` effect only when its screen changed (ignoring `endsInMs`), and again after any `peer` event for it; `persist` only when the snapshot changed, because it keeps the relay quiet without a timer.
- [SC2] decision: photos are released when the next round starts, at match end and on Back to lobby, because nothing shows them after results.
- [SC2] decision: upload completes only once `shootDone` arrived and all its `count` photos did; without `shootDone` the grace timer decides, because the shot count alone may lag the phone.
- [SC2] decision: removing the photographer between pass and review ends the round unscored and starts the next turn; a removed seat's unscored tags are dropped, because SPEC §6.3 keeps only scored tags.
- [SC2] decision: `profile` creates only seat 0 (other seats come from `addSeat`, lobby only, or `hello`); renames only in the lobby; Ready is kept across Rematch and Back to lobby, because these are the simplest rules the spec allows.
- [SC2] decision: `restored` snapshots replay an open round with a new `r` (photographer first in the queue), start the next turn from `results`, and turn `rules` into `lobby`; SC6 refines connection handling.
- [SC5] decision: the match's `now` is the host timers' clock, which stands still while the tab is hidden, so deadlines and the TV/phone countdowns pause together; `timeScale` is applied once, by the match (`scaled`), never again by the timers.
- [SC5] decision: `hello` lists seat 0 only (relay player key, name from the last screen) and is empty before the first profile, because extra seats and their keys are SC7.
- [SC5] decision: the host turns a finished photo into a match `photo` event only when it came from the current photographer's phone (others are revoked), because that event carries no sender.
- [SC5] decision: TV sounds come from diffing consecutive `TvView`s: `beep` at 3 and 2 s and `beepFinal` at 1 s of scatter, `startBuzz` entering shoot, `shutter` per new shot, `endBuzz` leaving shoot, `develop` per review photo shown, `sting` entering results, because SPEC §6.8 names the moments but not the hooks.
- [SC5] decision: the TV repaints when its view changes (countdowns compared in whole seconds) and on a 250 ms ticker during scatter and shoot, because the match has no clock events of its own.
- [SC5] decision: on every `onRoom` the host feeds the relay roster to the match as peer joined/left, the minimum for a socket-drop reclaim; refresh replay stays SC6.
- [SC5] decision: a 9th player's `profile` is simply not seated (their phone stays in the lobby without a chip; the TV lists 8), because the lobby has no "room full" copy yet and the match already refuses at `MAX_SEATS`.
- [SC5] decision: `/play` without `?code=` mounts the joining screen on a local client (no relay), because there is no code-entry screen in v1 (phones scan the QR).
- [SC5] decision: the phone installs `window.__pcg` = `{ playerId, status, send }` in dev or with `?debug=1`, so e2e can send raw messages (the dodger `tag` check).
- [SC5] decision: e2e changes `timeScale` at runtime via `__pcg.setTimeScale` (0.3 for the 5-shot shoot, 1 for the 15-shot shoot), because the phone's 0.4 s shutter cooldown isn't scaled and 0.1 leaves only a 2 s shoot.
- [SC5] decision: "TV shows 5 / 5" is checked as `📸 5 / 15` on the shoot view plus `Photo 1 / 5` and five arrived photos in review, because photos upload while shooting and the TV goes straight past upload when they're all in.
- [SC5] decision: e2e helpers add `joinPlayer` (commits the lobby name with Enter), `cameraAndReady`, `photographerOf`, `sendRaw` and host hook readers; SC0's `joinPhone` stays as it is (it expects a Next button the SC3 lobby doesn't have). Phone buttons are found by `data-action` (SC3's `button` helper).
- [SC5] decision: `play.html` JS measured 15.3 KB gzip (limit 40 KB): no limit change.
- [SC5-fix-1] decision: the limits e2e checks the 15th shot on the host (15 photos in the round), not the phone's shot counter, because the 15th shot ends the shoot and the phone's shoot screen can unmount before the assertion (a test race; the code is right).
- [plan] decision: the full `pnpm e2e:say-cheese` takes close to an hour, so each milestone or fix runs the full suite once; repeat runs (fix loops, post-merge verification of an already-run ff merge) use only the affected spec (`pnpm --filter @pcg/say-cheese exec playwright test e2e/<spec>`), because the user asked for this (2026-11-04).

## 9. Final handoff (and early setup)

Ordered steps only the user can do.

**Before C1 (do these as soon as SC0 is pushed; S1 stops at C1 needing them):**

1. **Vercel project** `say-cheese`, imported from `foster-curtis/phone-controller-games`, set up like
   the Sunny Side / Fort Frenzy projects: Root Directory `apps/say-cheese`, "Include files outside the
   root directory in the Build Step" on, Framework Vite, install and build commands the same as the
   Sunny Side project (default `vite build`, output `dist`), Node 22+. `apps/say-cheese/vercel.json`
   (from SC0) supplies `cleanUrls` and the `ignoreCommand`.
2. **Environment variable** `VITE_RELAY_URL` = `wss://relay.fostercurtis.dev` for **Production and
   Preview** (same name and value as Sunny Side).
3. **Preview deploys for the `say-cheese` branch:** Production Branch stays `main`; Git → preview
   deployments on for all branches (default). Optional but recommended: Domains → add
   `sc-preview.fostercurtis.dev` assigned to Git branch `say-cheese`, so every checkpoint has one stable
   URL.
4. **Deployment Protection:** turn off Vercel Authentication for Preview deployments (or add a
   protection bypass), otherwise phones hit a Vercel login wall.
5. **DNS:** `say-cheese.fostercurtis.dev` → the Vercel project (Domains → add; CNAME
   `cname.vercel-dns.com` at your DNS host), production branch `main`.
6. Send the orchestrator the preview URL (in the kickoff's optional line) when approving C1.

**Relay:** no relay change is needed (chunks fit the unchanged 16 KB limit; game ID `say-cheese` is a
new namespace). No redeploy.

**Before the event (after S5 prints this list; Mon 11-09 – Tue 11-10):**

7. In a fresh session or locally: `git fetch origin && git checkout say-cheese && git merge origin/main`
   (pick up any newer `main` work), then `pnpm install --frozen-lockfile && pnpm check && pnpm e2e`.
   Both must pass.
8. Merge `say-cheese` into `main` and push (production deploy of every game whose files changed; the
   Vercel `ignoreCommand` skips the rest).
9. Check Sunny Side (`sunny-side.fostercurtis.dev`) and Fort Frenzy still load and join (shared kits
   untouched, but `main` moved).
10. **Real-device smoke test on `say-cheese.fostercurtis.dev`:** TV/laptop host; join by QR on an
    iPhone (Safari) and an Android (Chrome); camera permission prompt and rear camera; one phone shared
    by 2 players; Sound on; a reconnect mid-round (lock a phone, close and reopen the photographer's
    tab); a full match with 3+ players; Rematch.
11. At the venue: TV/laptop on power with sleep off, host page fullscreen, Sound on clicked, venue
    Wi-Fi tested with one round (upload time on screen).

Milestones that add env vars must add them to steps 2 and 10.

## 10. Kickoff prompt

```text
You are the orchestrator for building Say Cheese! (apps/say-cheese) in the phone-controller-games
monorepo. You run in an ephemeral cloud sandbox: anything not pushed is lost.

1. `git fetch origin say-cheese && git checkout say-cheese && git pull --ff-only origin say-cheese`.
2. Read ONLY apps/say-cheese/BUILD_PLAN.md (never source code). Follow its §5 Orchestrator rules exactly.
3. Run the §1 pre-flight via a `haiku` helper; stop and tell me if anything blocks the next milestone.
4. From §6 Progress, §7 Blockers and `git log --oneline -15`, work out where the build stands.
5. Check the schedule per rule 8 (compare today with the §0 targets); if behind, propose the next cut
   from the §3 cut order and wait for my yes.
6. Run the next unchecked milestone(s) per §0/§3 with the §4 brief and the model from the §3 table:
   parallel milestones in one turn with isolation "worktree" (S1: SC1 ∥ SC2 ∥ SC3 ∥ SC4 after SC0;
   S3: SC6 ∥ SC7 ∥ SC8; S4: SC9 ∥ SC10), serial ones (SC0, SC5, fixes that share files) in the main
   checkout. Hand everything else to `haiku` / `sonnet` helpers per rule 4.
7. Merge each milestone per §2 with `git merge --ff-only`, push `say-cheese`, then verify with a
   `test-runner` agent (model haiku) running that milestone's acceptance commands.
8. Stop at user checkpoints and unresolved blockers, and tell me exactly what's needed: preview URL,
   which devices, how many people, what to try, what to answer.
9. If every item is checked, run the Full gate and print §9 Final handoff.

{Optional: "Checkpoint approved: C1. Preview URL: https://…" / "C2 notes: …" / "Cut approved: SC10"}
```