# BUILD_PLAN: Thieves' Forum

Orchestration plan for building `apps/thieves-forum/SPEC.md` v1. The orchestrator reads **only this
file**. Subagents read their milestone entry, §2, §4, §8 and the spec sections and files the entry
names (from TF0 on, that includes SPEC §12 Technical design). Commands are POSIX sh, run from the repo
root. `SPEC §` = `apps/thieves-forum/SPEC.md`; `PLATFORM §` = `PLATFORM.md`; `relay SPEC §` =
`apps/relay/SPEC.md`; `FF SPEC §` = `apps/fort-frenzy/SPEC.md`.

**No target date.** Risk first (the crowd, hold timing, the tip-off snapshot), then a playable vertical
slice, then growth to the full §8 scope. The §3 cut order exists for when the user asks for cuts; the
orchestrator never cuts on its own.

**Status: planned (2026-11-25).** Nothing built yet. The scaffold (PR #36) is on `main` and on
`thieves-forum`.

**Inputs already in the repo (read-only for every milestone):**

- Brand kit: `src/styles/brand.css`, `public/**`, `brand/**`; Phaser mirror `src/shared/theme.ts`
  (`theme.test.ts` checks parity). Colors, fonts and sizes come from these, never from literals.
- Art sources: `art/forum/**` (SVG cut-out parts, stall layers, map, 34 item icons + `items/items.json`,
  effects, UI) with `art/forum/README.md` (inventory, gap list) and `art/forum/ART_NOTES.md` (rig
  notes, draw order). These SVGs are inputs: never redrawn, re-exported or edited. New production
  files (`art/forum/rigs/*.json`, `art/forum/sprites.json`) are added beside them (TF1).
- Audio: none yet. The user commits licensed files later (§9 step 7); they gate TF19 only.

**Out of scope:** everything in SPEC §9 (pairs mode, noisy distraction, outfit-change stall, full item
set, music, more maps). Its "v1 prep" hooks are built: side-keyed ledger (TF0/TF10), distraction
handler list (TF0/TF13), one mid-round-callable `assignOutfit` (TF0/TF2), items as data and layout as
config (TF0), audio map in config (TF0/TF11), a round-start screen for one or two outfit cards (TF5).

**Shared code:** `@pcg/net-client`, `@pcg/controller-kit`, `@pcg/game-kit` are used as they are
(frozen, additive only, and no milestone edits them). Fort Frenzy's rig renderer, atlas script and
sim helpers and Say Cheese's blob transfer are **copied** into this app's extraction-ready folders
(user decision, §8). No milestone touches `packages/**`, `apps/relay/src/**` or another app.

## 0. Sessions

Each session is a fresh cloud session started with the §10 kickoff prompt.

| Session | Runs | Ends at |
| --- | --- | --- |
| S1 | Pre-flight → **TF0** (main checkout) | **C0**: SPEC §12 + contracts review |
| S2 | C0 fixes → **TF1 ∥ TF2 ∥ TF3 ∥ TF4 ∥ TF5 ∥ TF6** (worktrees) | none (context break) |
| S3 | **TF7 ∥ TF8 ∥ TF9 ∥ TF10 ∥ TF11** (worktrees) | **C1**: crowd spike on a TV with 2–3 phones (+ tip-off spike, phone dev mode, art gallery first look) |
| S4 | C1 fixes → **TF12** (main checkout) | **C2**: vertical slice, 3 players in a room (iOS + Android) |
| S5 | C2 fixes → **TF13 ∥ TF14 ∥ TF15** (worktrees) | **C3**: How to play copy |
| S6 | C3 fixes → **TF16 ∥ TF17 ∥ TF18** (worktrees) | **C4**: economy harness report + proposed §7 fees; **C5**: full 3-round match, 4+ players |
| S7 | C4/C5 fixes (incl. approved §7 values) → **TF19 ∥ TF20 ∥ TF21** (worktrees; TF19 only if the audio delivery exists) | **C6**: audio mix on the TV speakers; **C7**: art gallery on a TV |
| S8 | C6/C7 fixes → Full gate → print §9 Final handoff | Final handoff printed |

If the audio delivery is missing at S7, TF20 ∥ TF21 run, TF19 is logged as a Blocker, and C6 waits
for a later session.

## 1. Pre-flight checklist

| Item | Check command | Blocks |
| --- | --- | --- |
| On `thieves-forum`, up to date | `git fetch origin thieves-forum main && test "$(git branch --show-current)" = thieves-forum && test "$(git rev-parse HEAD)" = "$(git rev-parse origin/thieves-forum)"` | all |
| `main` merged in (AGENTS.md Git) | `git log --oneline HEAD..origin/main` prints nothing. **If it prints:** `git merge --no-edit origin/main`, run the TF checks, push `thieves-forum`; on a conflict stop and ask the user | all |
| Clean working tree | `test -z "$(git status --porcelain)"` | all |
| Push access | `git push --dry-run origin thieves-forum` exits 0 | all |
| No leftover milestone branches | `git branch --list 'build/tf*' --no-merged thieves-forum` prints nothing (if it prints: a crashed session; check §6, then delete with `git branch -D` or resume it) | next milestone |
| Plan is current | `test -f apps/thieves-forum/BUILD_PLAN.md` | all |
| Node ≥ 22, pnpm 10 | `node -e "process.exit(+process.versions.node.split('.')[0]>=22?0:1)" && pnpm --version \| grep -q '^10\.'` | all |
| Install + TF checks green | `pnpm install --frozen-lockfile && pnpm check:thieves-forum` (once per session) | next milestone |
| npm registry reachable | `npm view tsx@4.23.15 version` prints `4.23.15` | TF0 |
| Playwright Chromium usable | `pnpm --filter @pcg/thieves-forum exec playwright install --dry-run chromium \| grep -o '/opt/pw-browsers/[a-z_]*-[0-9]*' \| xargs -n1 test -e` exits 0. **If not:** the CDN is blocked, so link the preinstalled build: read the wanted dirs from the dry run and `ls /opt/pw-browsers` for the present ones, then e.g. `cd /opt/pw-browsers && ln -sfn chromium-1243 chromium-<wanted> && ln -sfn chromium_headless_shell-1243 chromium_headless_shell-<wanted>` (wanted ← present). Never `playwright install` another version. | every e2e |
| Google Fonts (screenshots only) | `curl -sfI "https://fonts.googleapis.com/css2?family=Cinzel" >/dev/null` (blocked is fine: e2e `blockFonts`) | none |
| Worktrees ignored | `git check-ignore -q .claude/worktrees/x && grep -q '.claude/worktrees' .prettierignore && grep -q "'.claude/worktrees/\*\*'" eslint.config.js` | parallel waves |
| Ports free (4173 5173 8787 8794 5178) | `(ss -ltn 2>/dev/null \|\| netstat -ltn) \| grep -E ':(4173\|5173\|8787\|8794\|5178) '` prints nothing | e2e, check:routes |
| Unattended permissions | the session runs in auto mode, or `.claude/settings.json` allows `Bash(git:*)`, `Bash(pnpm:*)`, `Bash(node:*)`, `Bash(npx:*)`, `Edit`, `Write` | all |
| Preview deploy exists (from C1 on) | §9 steps 1–5 done: the `thieves-forum` branch preview loads `/` and `/play` on a phone without a Vercel login wall | C1–C7 |
| Audio delivery (TF19 only) | `ls apps/thieves-forum/audio/forum/bed/*.mp3 apps/thieves-forum/audio/forum/sfx/*.mp3 >/dev/null && grep -q 'audio/forum' apps/thieves-forum/assets/LICENSES.json` | TF19 |
| Economy harness (C4 fixes only) | `test -f apps/thieves-forum/scripts/economy.ts` | C4 balance fixes |

## 2. Branches, merging, verification

- The orchestrator stays on `thieves-forum` in the main checkout. Each milestone works on
  `build/tf<N>-<slug>` cut from `thieves-forum`; fixes after checkpoint feedback go on
  `build/tf<N>-fix-<k>` (same model and file ownership as milestone N; notes spanning owners split into
  one fix branch per owner). Commit prefixes `TF<N>:` and `TF<N>-fix-<k>:`.
- **Subagent flow:** commit as it goes → run acceptance → tick its §6 items → commit → `git rebase
  thieves-forum` → rerun acceptance if the rebase pulled anything in → report. It never merges or pushes.
- **Orchestrator merge:** `git merge --ff-only build/tf<N>-<slug>`. If that fails, resume the same
  subagent (SendMessage) to rebase and rerun acceptance. Conflicts in this file's §7 / §8 resolve by
  keeping both sides. Then `git branch -d` the milestone branch.
- **Push `thieves-forum` after every merge and after every BUILD_PLAN.md update**
  (`git push origin thieves-forum`): the sandbox is ephemeral, and each push makes a Vercel preview.
  Milestone branches are never pushed. Nothing goes to `main` (that is a §9 step for the user, through
  a PR).
- **Parallel milestones** run in git worktrees (`isolation: "worktree"`). Two milestones run in
  parallel only when their **Owns** lists are disjoint. `BUILD_PLAN.md` checklist ticks are separate
  lines and merge cleanly. A small shared piece one milestone needs from a parallel one becomes the
  needing milestone's **first commit** inside its own Owns, or is marked "done, checks pending TF#" in
  §6 and finished after that merge.
- **e2e in parallel waves:** each milestone adds its own `e2e/tf<N>-*.spec.ts`; `e2e/helpers.ts` is
  additive-only, and a parallel milestone puts new helpers in `e2e/helpers-tf<N>.ts`. e2e uses the host
  debug hooks (`window.__pcg`, `?debug=1`) and `?timeScale=` (TF7) to run rounds fast.
- **Append-only registries** (any milestone may append, never reorder or remove; on conflict keep both):
  `src/host/sim/events.ts` (`SimEvent` union), `src/shared/sfx.ts` cue names, `src/content/index.ts`,
  `src/host/net/handlers/*.ts` and `src/host/net/context/*.ts` (one file each, found with
  `import.meta.glob`, from TF12),
  `src/host/debugHooks/*.ts` (one file per hook group, found with `import.meta.glob`, from TF7).
- **Check sets** (all run locally in the sandbox):
  - **TF checks:** `pnpm check:thieves-forum` (typecheck, lint, format:check, test, build, check:bundle,
    check:routes, check:changeset).
  - **TF e2e:** `pnpm e2e:thieves-forum` (own relay on 8794, Vite on 5178, from the app's
    `package.json` `pcg.e2e`). Fix loops rerun only the affected spec:
    `pnpm --filter @pcg/thieves-forum exec playwright test e2e/<spec>`.
  - **Full gate:** `pnpm check:affected && pnpm e2e:affected`. Required for TF0 (lockfile and devDeps)
    and once at the end (S8). No other milestone touches root files.
- **Never touched by any milestone:** `packages/**`, `apps/relay/**`, every other app, the brand kit
  files, `art/forum/**` SVGs, `audio/**` (user deliveries). Root files only in TF0.
- **Versioning:** every milestone that changes shipped code commits a note:
  `pnpm changeset --minor @pcg/thieves-forum -m "<one line>"` for new features, `--patch` for fixes and
  tuning. Tests, e2e, Markdown and scripts-only changes need none. `game.meta.ts` `status` stays
  `hidden` until the user says otherwise (§9). Never edit `version` or `CHANGELOG.md`.

## 3. Milestones

### Dependency graph

```
TF0 [C0] ─┬─ TF1 art pipeline ─────────────┐
          ├─ TF2 sim core + crowd ─────────┼─ TF7 crowd spike wiring ─┐
          ├─ TF5 phone screens ────────────┤                           │
          ├─ TF6 TV DOM UI ────────────────┘                           │
          ├─ TF3 holds + latency ──┬─ TF8 merchants + stalls ──────────┤
          │        (TF2) ──────────┼─ TF9 guards + catches + stocks ───┼─ [C1] ─ TF12 slice [C2]
          │                        └─ TF10 match + ledger + party ─────┤
          ├─ TF4 blob transfer + tip-off viewer + spike ───────────────┤ (spike checked at C1)
          └─ TF11 audio module (S3) ───────────────────────────────────┘
TF12 ─┬─ TF13 economy + coin toss ───────┐
      ├─ TF14 pickpocket + tip-offs (TF4)┼─ [C3] ─┬─ TF16 lifecycle ──────────┐
      └─ TF15 How to play [C3] ──────────┘        ├─ TF17 economy harness [C4]┼─ [C5] ─┬─ TF19 audio integration [C6]
                                                  └─ TF18 TV presentation ────┘        ├─ TF20 art polish [C7]
                                                                                       └─ TF21 hardening
```

Edges (every one points backwards): TF0 → {TF1, TF2, TF3, TF4, TF5, TF6}; TF7 ← TF1, TF2, TF5, TF6;
TF8 ← TF2, TF3; TF9 ← TF2, TF3; TF10 ← TF2; TF11 ← TF0; TF12 ← TF7–TF11, C1; {TF13, TF15} ← TF12, C2;
TF14 ← TF12, TF4, C2; {TF16, TF17, TF18} ← TF13, TF14, TF15, C3; {TF19, TF20, TF21} ← TF16, TF17,
TF18, C4, C5.

| # | Milestone | Model | Parallel with | User checkpoint | Cut priority |
| --- | --- | --- | --- | --- | --- |
| TF0 | Contracts, SPEC §12, content data, devDeps | opus | — (serial) | **C0**: §12 + contracts | core |
| TF1 | Art pipeline: atlases, rigs, pose clips, `?gallery=1` | opus | TF2–TF6 | C1 (first look at the gallery) | core |
| TF2 | Sim core + NPC crowd (headless) | opus | TF1, TF3–TF6 | C1 | core |
| TF3 | Hold actions under latency (host timer + phone estimate) | opus | TF1, TF2, TF4–TF6 | no | core |
| TF4 | Blob transfer (host → phone), tip-off viewer, spike | opus | TF1–TF3, TF5, TF6 | **C1**: snapshot size and arrival on real phones | core |
| TF5 | Phone controller shell and every screen (`?dev=1`) | sonnet | TF1–TF4, TF6 | C1 (glance: `/play?dev=1`) | core |
| TF6 | TV DOM UI: title, lobby, HUD, reveal, podium shells | sonnet | TF1–TF5 | no | core |
| TF7 | Crowd spike wiring: loop, input, renderer, dev overlay, stress | opus | TF8–TF11 | **C1**: can watchers pick out the players? FPS with the full crowd | core |
| TF8 | Merchants + stalls + stall theft (sim) | opus | TF7, TF9–TF11 | no (judged at C2) | core |
| TF9 | Guards, view cones, chase/escape, catches, stocks, escalation (sim) | opus | TF7, TF8, TF10, TF11 | no (judged at C2) | core |
| TF10 | Match flow, ledger (score/payout by side), party, open stalls | opus | TF7–TF9, TF11 | no (judged at C2) | core |
| TF11 | Web Audio module with synthesized placeholders | sonnet | TF7–TF10 | no (judged at C6) | core |
| TF12 | Vertical slice wiring | opus | — (serial) | **C2**: one round, 3 players, iOS + Android | core |
| TF13 | Economy: buy, pawnbroker, NPC selling, rolls, restock, coin toss | opus | TF14, TF15 | no (judged at C5) | core |
| TF14 | Pickpocketing, NPC glances, shout/escape, tip-offs + payouts | opus | TF13, TF15 | no (judged at C5) | core |
| TF15 | How to play cards, illustrations, drafted copy | sonnet | TF13, TF14 | **C3**: copy review | core |
| TF16 | Lifecycle: walk-on joins, disconnect takeover, leave, round transition, 3 rounds + podium flow | opus | TF17, TF18 | C5 | core |
| TF17 | Economy harness (seeded bots) + balance report | opus | TF16, TF18 | **C4**: report + proposed §7 fees | cut-if-late |
| TF18 | TV presentation: HUD, reveal sequence, podium sequence, title | sonnet | TF16, TF17 | **C5**: full match, 4+ players | core (animations: cut-if-late) |
| TF19 | Audio integration with the delivered files + mix | sonnet | TF20, TF21 | **C6**: mix on TV speakers | core (one-shot variety: cut-if-late) |
| TF20 | Art polish: effects, closed stalls, crowns, confetti, fireworks | sonnet | TF19, TF21 | **C7**: `?gallery=1` on a TV | cut-if-late |
| TF21 | Hardening: soak, perf, disguise audit, full-match e2e | opus | TF19, TF20 | no | core |

**Cut order** (first dropped first; the orchestrator proposes only when the user asks, rule 8). Every
SPEC §8 item stays; only polish and tooling are cut:

1. **TF20 extras:** confetti, fireworks, crown spin/bob, coin-shower particles. Crowns and starbursts
   stay as static frames.
2. **TF18 animations:** reveal cards and podium shown all at once (still lowest → highest order, no
   staged pops); round transition fades to black without the guard rush choreography (players simply
   walk off).
3. **TF19 one-shot variety:** ship the bed loop + SFX, with 3 one-shot sounds instead of the full set.
4. **TF17 economy harness:** fees are then set from C5 playtest notes instead of numbers.

Never cut: TF0–TF16, TF21, the disguise invariant tests, and the SPEC §8 list.

### Freeze points

Later milestones may only add to these, and log `- [TF#] contract+: …` under §8 (and update SPEC §12).

| Contract | Frozen when merged |
| --- | --- |
| `src/shared/messages.ts` (GAME_ID, `PROTOCOL_VERSION`, phone→host input state + discrete events, host→phone screens and private events, guards) | TF0 |
| `src/host/sim/types.ts` (World, Character, Npc, Merchant, Guard, Stall, Hold, Phase, PlayerInput, SimCommand, RoundStart) and `src/host/sim/snapshot.ts` types (`WorldView`, `CharacterView`: no player-identifying field) | TF0 |
| `src/host/sim/systems.ts` (fixed step order and each subsystem's step signature) | TF0 |
| `src/content/types.ts` (Item, Shop, Rarity, Balance, Layout: stall slots, lanes, alleys, end passages, entries, gate, stocks) | TF0 |
| `src/shared/viewer/types.ts` (StallView state, TipSnapshot header + hit areas) and `src/shared/blob-transfer/types.ts` (chunk, ack, limits) | TF0 |
| `src/shared/hold.ts` (hold kinds, host hold events, `HoldEstimator` interface) | TF0 |
| `src/host/match/types.ts` (MatchPhase, `Side`, `MatchState`, `RoundResult`) and `src/host/ui/types.ts` (`TvView`) | TF0 |
| `src/shared/sfx.ts` (`SfxCue` names, `Sfx` interface, `noopSfx`) and `src/shared/audio/types.ts` (`AudioMap` config shape) | TF0 |
| Distraction handler list (`src/host/sim/distractions/types.ts`) and ledger API (`src/host/sim/ledger/types.ts`, keyed by `Side`) | TF0 |
| Renderer API `src/host/render/types.ts` and the asset manifest format (`generated/manifest.ts` shape) | TF1 |
| Hold machine API (`src/host/sim/holds/index.ts`), blob-transfer API (`createBlobSender`/`createBlobReceiver`) | TF3, TF4 |
| Host message-handler registry (`src/host/net/handlers/`) | TF12 |

**Layout is config** (`src/content/layout.ts`): stall slots, lanes, alleys, passages, entries, gate and
stocks are data, never constants in sim or render code (SPEC §9 "more maps is config").

---

### TF0: Contracts, SPEC §12, content data, devDeps

- **Goal:** write SPEC §12 Technical design and every fixed surface the parallel waves build against, so
  TF1–TF6 start from one frozen contract set.
- **Read:** this file §2, §3, §8; SPEC (all of it); `PLATFORM.md` §2–§5; `AGENTS.md` (Architecture rules,
  Contracts); `apps/relay/SPEC.md` §2 (`maxPayloadBytes` 16 KiB), §3; `FF SPEC §15` (all; the model for
  §12); `apps/fort-frenzy/src/host/sim/types.ts`, `src/content/{types,balance,map}.ts`,
  `art/neon-knights/README.md` (formats only); `apps/say-cheese/src/shared/blob-transfer/types.ts`;
  `packages/{net-client,controller-kit,game-kit}/src/index.ts`; the scaffold: `src/shared/messages.ts`,
  `src/host/{main,lobby,roster}.ts`, `src/controller/{main,app}.ts`, `e2e/helpers.ts`, `package.json`;
  `art/forum/README.md`, `art/forum/ART_NOTES.md`, `art/forum/items/items.json`,
  `art/forum/map/market-layout-reference.svg` (positions only).
- **Depends on:** pre-flight.
- **Owns:** `SPEC.md`, `src/shared/{messages,hold,sfx}.ts`, `src/shared/viewer/types.ts`,
  `src/shared/blob-transfer/types.ts`, `src/shared/audio/types.ts`, `src/content/**`,
  `src/host/sim/{types,snapshot,systems,events}.ts`, stub `index.ts` + `types.ts` in every subsystem
  folder named below, `src/host/match/types.ts`, `src/host/ui/types.ts`, `assets/LICENSES.json`,
  `src/__tests__/licenses.test.ts`, `src/host/main.ts` and `src/controller/main.ts` (mode routing
  only), stub entry modules `src/host/{gallery,spike}/index.ts`, `src/host/ui/preview.ts`,
  `src/controller/dev.ts`, `package.json` (devDeps only), `pnpm-lock.yaml`.
- **Order:** §12 first (it is the design), then content data, then type contracts, then stubs and tests.
- **Deliverables:**
  - **SPEC §12 Technical design** (new section before nothing else changes numbering; mirror FF
    §15's structure): 12.1 module layout and lint boundaries; 12.2 engine and rendering (Phaser renders
    only, 1920 × 1080 `Scale.FIT`, the §6.3 projection with ground factor 0.6 as one `Camera`
    interface, layers, y-sort by foot point, DOM HUD over the canvas, rigs from tinted cut-out parts,
    clips in code); 12.3 simulation (game-kit fixed 60 Hz loop, ECS-lite typed arrays, one deterministic
    sim per round seeded from `RoundStart`, the fixed system step order, `SimEvent`s split into
    **TV events** and **phone-private events**); 12.4 data and config (balance, items, shops, layout);
    12.5 network protocol (input state at 30 Hz or on change: stick vector + bits `hold`, `catch`; discrete
    events; host → phone screens and private events; hold correction events; `PROTOCOL_VERSION` in the
    `join` handshake); 12.6 viewer formats; 12.7 controller app; 12.8 audio; 12.9 testing (disguise
    invariants, latency tests, seeded crowd run, economy harness); 12.10 assets and licensing; 12.11
    contracts list and a §12 decision log seeded from this file's `[plan]` rows.
  - SPEC edits: §10.4 settled (open-stall rule, §8); §6.17 pawnbroker line fixed to "today's offer per
    item (§6.4 rate of the moment)"; new §11 rows for every `[plan]` decision in §8 that changes or fills
    the design; header "Last updated".
  - `src/content/`: `balance.ts` holds **every SPEC §7 value** plus the build's own tuning numbers
    (merchant glance wind-up ms, NPC purse range, guard speeds, tip snapshot TTL, crowd steering weights)
    with a comment naming the § each comes from; `items.ts` generated by hand from
    `art/forum/items/items.json` (34 items, `grabMs(item)` from the §6.5 rule, rarity, placement);
    `shops.ts` (10 shops, canopy color by theme token name, stock and restock rules); `layout.ts` (one
    map: 10 stall slots in two rows with counter and back-shelf geometry, two lanes, two alleys,
    end passages, four lane entries, the top gate, stocks with N standing slots, walkable polygons and
    blockers for line of sight); `types.ts`; `index.ts`.
  - `src/shared/messages.ts` (replaces the setup shell, keeps `join`/`joined`, `cleanName`):
    `PROTOCOL_VERSION`; phone → host `input {x, y, bits}` (bits `hold`, `catch`), `browse`, `grab {stall,
    slot}` (arms the GRAB hold; the `hold` bit times it), `dialog {pick}`, `buy {item}`, `sell {item,
    to}`, `toss {dir}`, `tipOpen`, `tipSend {target}`, `tipCancel`, `leader` actions (`start`,
    `howToPlay`, `next`, `skip`, `playAgain`), `ready`, `leave`; host → phone `screen` (union:
    `joining`, `lobby`, `rules`, `roundStart`, `play`, `handsUp`, `stocks`, `walkOn`, `matchEnd`,
    `waiting`) and private events (`stallView`, `holdStart`, `holdEnd {result: complete|cancelled|
    caught}`, `toast`, `bag`, `outfit`, `dialog`, `sellSheet`, `pawnSheet`, `caught`, `tipResult`,
    `handsUp`); runtime guards `isPhoneMsg` / `isHostMsg`.
  - `src/shared/hold.ts`: `HoldKind` (`grab`, `pickpocket`), host hold event shapes, `HoldEstimator`
    interface (`press(now)`, `correct(event, now)`, `progress(now)`, `release(now)`).
  - `src/shared/viewer/types.ts` (no game imports): `StallView` (stall id, canopy token, counter and
    back-shelf rows of `{slot, item, price, grabMs, rarity, state: free|takenByOther|tooHeavy|
    outOfReach}`), `TipSnapshot` header (`{id, w, h, mime, bytes}`) + `HitArea {targetId, x, y, w, h}`
    in snapshot pixels. `src/shared/blob-transfer/types.ts`: `Chunk`, `Ack`, `CHUNK_B64_MAX = 12000`,
    `RELAY_MAX_PAYLOAD = 16384` (Say Cheese's shape, keyed by a generic `blobId` instead of photo).
  - `src/host/sim/types.ts` (FF15.3 style: `Character` = body + rig + outfit + facing + gait + state;
    controllers: `player | npc | takeover | walkOn`; `Npc`, `Merchant`, `Guard`, `Stall`, `Hold`,
    `World`, `Phase`, `PlayerInput`, `SimCommand` (discrete events as commands), `RoundStart {seed,
    players, openStalls, guards}`), `snapshot.ts` (`WorldView`/`CharacterView` for the renderer: rig,
    outfit, pose/clip, position, facing; **no `playerId`, `isPlayer` or controller field**; reveal data
    is a separate `RevealView` only produced in the `handsUp` phase; a debug-only `DebugView` for the dev
    overlay), `events.ts` (`SimEvent` union tagged `tv` or `phone`), `systems.ts` (step order: input →
    holds → npc → merchants → guards → pickpocket → distractions → catches → economy → lifecycle →
    movement → separation → hot-hands/timers).
  - Stubs (frozen `index.ts` signature + `types.ts`, a no-op body) for `src/host/sim/{npc,holds,
    merchants,stalls,guards,catches,pickpocket,tipoff,economy,distractions,ledger,lifecycle,bots}/`.
    `distractions/types.ts` = a handler list (`coinToss` first, SPEC §9 prep); `ledger/types.ts` =
    purse, pack, haul and payouts keyed by `Side` (`Side = { kind: 'player', id }` in v1, SPEC §9 prep);
    `lifecycle/` exposes `assignOutfit(rng, pool)` as one function callable mid-round (§9 prep).
  - `src/host/match/types.ts`: `MatchPhase` (`lobby | rules | roundStart | play | handsUp | reveal |
    transition | podium`), `MatchState`, `RoundResult`, per-side round hauls. `src/host/ui/types.ts`:
    `TvView` per phase (HUD data has no names, scores or colors during `play`).
  - `src/shared/sfx.ts`: `SfxCue` = SPEC §6.20 list (`coinClink`, `glanceSwoosh`, `thiefShout`,
    `guardWhistle`, `gateCreak`, `stocksClank`, `roundBell`, `revealPop`, `fanfare`, `firework`) and
    **no grab or pickpocket cue**; `Sfx`, `noopSfx`. `src/shared/audio/types.ts`: `AudioMap` (bed file,
    one-shot pool, cue → file, duck rules; SPEC §9 "audio map in config").
  - `assets/LICENSES.json` (`art/**` as owned, fonts OFL) and `src/__tests__/licenses.test.ts` (every
    file under `art/` and `audio/` has an entry allowing commercial use; FF's test is the model).
  - `package.json` devDeps (exact, FF's versions): `tsx` 4.23.15, `@resvg/resvg-js` 2.6.2,
    `maxrects-packer` 3.0.0; lockfile.
  - Mode routing so wave-A milestones never share an entry file: `src/host/main.ts` dispatches
    `?gallery=1` → `src/host/gallery/index.ts` (TF1), `?spike=tipoff` → `src/host/spike/index.ts` (TF4),
    `?ui=<screen>` → `src/host/ui/preview.ts` (TF6), else the scaffold lobby; `src/controller/main.ts`
    dispatches `?dev=1` → `src/controller/dev.ts` (TF5), `?spike=tipoff` → `src/controller/tipoff/spike.ts`
    (TF4), else the scaffold app. Each target is a stub with a frozen `mount(root)` signature.
  - Interfaces other parallel milestones call before the owner exists: `guards/types.ts`
    `raiseAlert(thief, lane)`, `ledger/types.ts` (purse, pack, pot, payouts), `holds/types.ts`; implementers
    in the same wave use them through fakes in tests.
  - Changeset: `--minor @pcg/thieves-forum` ("Contracts and content data").
- **Acceptance:**
  - Full gate: `pnpm check:affected && pnpm e2e:affected` (the lockfile changed).
  - `pnpm check:thieves-forum` and `pnpm e2e:thieves-forum` pass on their own.
  - `grep -q '^## 12\. Technical design' apps/thieves-forum/SPEC.md`.
  - Unit tests: `src/content/__tests__/` (items match `items.json` field by field; `grabMs` equals the
    §6.5 table for all 34; every §7 row has a `balance.ts` key, checked against a list in the test;
    placement rule: no counter or back shelf empty for any shop; layout: 10 slots, 2 alleys, 4 entries,
    gate in the top row beside the center stall, stocks lower-left); `src/shared/__tests__/messages.test.ts`
    (guards accept a sample of every message, reject junk); a type test that `CharacterView` has no
    `playerId`/`isPlayer`/`controller` key (`expectTypeOf` + an `Object.keys` allowlist on a sample).
  - `git diff --stat origin/main...HEAD -- packages apps/relay apps/sunny-side apps/fort-frenzy apps/say-cheese apps/gallery` prints nothing.
  - Every contract file header contains "Frozen at TF0".
- **Risks / fallbacks:** §12 must not redesign the game: a SPEC conflict found while writing it goes to
  §7 Blockers, not into §12. Contract choices the spec leaves open: simplest, logged `[TF0]`.
- **Leave out:** behavior beyond stubs, rendering, screens, extraction into `packages/`.
- **User checkpoint (C0):** read SPEC §12 and skim `src/shared/messages.ts`, `src/host/sim/types.ts`,
  `src/content/balance.ts`, `src/content/layout.ts` on GitHub (branch `thieves-forum`). Answer: does §12
  match the game you designed (anything redesigned?), any message or state you expected but don't see,
  and are the §8 `[plan]` decisions acceptable. Notes become `build/tf0-fix-<k>`.

### TF1: Art pipeline, rigs, pose clips, art gallery

- **Goal:** the delivered SVGs in the engine: atlases, rigs for citizen / merchant / guard, every pose in
  SPEC §6.21 as a code clip, and a `?gallery=1` page showing all of it.
- **Read:** SPEC §6.0, §6.3, §6.11, §6.21, §12.2, §12.10; `art/forum/README.md`, `ART_NOTES.md`;
  `FF SPEC §15.2` (rigs, layers), §15.10; `apps/fort-frenzy/scripts/build-atlases.ts`,
  `apps/fort-frenzy/src/host/render/{rig,rigMath,clip,clipKit,atlas,split,keys,types,camera}.ts`,
  `apps/fort-frenzy/src/host/render/gallery/`, `apps/fort-frenzy/art/neon-knights/{sprites.json,rigs/footman.json}`
  (format), FF's asset-key test; contracts `src/host/sim/snapshot.ts`, `src/content/layout.ts`.
- **Depends on:** TF0.
- **Owns:** `scripts/build-atlases.ts`, `art/forum/rigs/**`, `art/forum/sprites.json`,
  `src/host/render/**`, `src/host/gallery/**`, `package.json` (scripts only: `assets`, and `pnpm
  assets &&` before dev/build/typecheck/test/e2e, as FF), `tsconfig.json` (include `generated/`),
  `e2e/tf1-*.spec.ts`.
- **Order:** copy the atlas script and renderer with a header naming the FF source ("copied from
  Fort Frenzy, extraction candidate, BUILD_PLAN §8"), adapt to the forum theme, then rigs, then clips,
  then gallery.
- **Deliverables:**
  - `pnpm assets` builds `generated/` (gitignored by the root `apps/*/generated/` rule): manifest, keys,
    atlases at 1× and 2× from `art/forum/**` (citizen, merchant, guard parts; stall layers; map; items;
    effects; ui), validating rigs and `sprites.json`.
  - Rigs `art/forum/rigs/{citizen,merchant,guard}.json` from the SVG part groups (`legs`, `arm`,
    `tunic`, `mantle`, `head`, …) in front, side and back views, with attach points (hand, head-top for
    bubbles and crowns, feet), tint slots `--tunic`, `--mantle`, `--hair`, `--skin`, `--wrap`; the
    delivered point/hands-up/run SVGs as pose overrides where they exist.
  - Clips in `src/host/render/clips/<rig>.ts`: citizen walk, idle, browse/reach (one clip, SPEC §6.21
    "not a tell"), pickpocket reach, throw, point-and-shout, hands-up, run, stocks; merchant walk, idle,
    glance (three stages), fetch, carry-forward, point-and-shout; guard patrol walk, jog, catch, march.
    Views missing from the delivery (e.g. hands-up side) are composed from parts and logged.
  - Renderer API `src/host/render/types.ts` (rig instance, outfit tint, clip play/blend, layers,
    `Camera` from §12.2, effect spawners) and dev-only fallback shapes for any missing frame.
  - `?gallery=1` (dev or `?debug=1`): every rig × view × clip with outfit cycling from the shared pool,
    every stall open/closed with each canopy color, items, effects; a stress view with the full §7 crowd
    count (8 players → 24 NPCs + 4 guards + 10 merchants) walking random paths with an FPS readout.
- **Acceptance:**
  - TF checks.
  - `pnpm --filter @pcg/thieves-forum assets && test -f apps/thieves-forum/generated/manifest.ts`.
  - Unit tests: every rig has every part in every view; every clip names only existing parts; every
    frame key used in `src/host/render/**` exists in `generated/keys.ts` (FF asset-key test); the same
    citizen rig and clip set serve any outfit (no player-only clip exists).
  - TF e2e `e2e/tf1-gallery.spec.ts`: `/?gallery=1&debug=1` renders every section with no console
    errors (fonts blocked) and saves screenshots to `e2e/__screens__/` (gitignored) for C1/C7.
  - `git diff --name-only thieves-forum...HEAD -- apps/thieves-forum/art | grep '\.svg$'` prints nothing.
- **Risks / fallbacks:** a part group not separable in an SVG → a dev shape for that part, logged, and
  listed for the user in §8 (never redraw). resvg differences from browsers → compare against
  `art/forum/index.html` in the gallery screenshot.
- **Leave out:** world scene composition (TF7), effects choreography (TF20), audio.
- **User checkpoint:** C1 first look (see TF7).

### TF2: Sim core + NPC crowd (headless)

- **Goal:** the risk-1 spike in plain TS: a market of NPCs that move like people (all five SPEC §6.10
  techniques), player characters driven by input, churn within ±8%, seeded and replayable.
- **Read:** SPEC §5, §6.2, §6.3, §6.10, §6.11, §7, §12.3–§12.4; contracts `src/host/sim/{types,snapshot,
  systems,events}.ts`, `src/content/**`; `apps/fort-frenzy/src/host/sim/{spatial,hash,body,movement,
  geometry}.ts` (copy helpers); `packages/game-kit/src/{rng,loop}.ts`.
- **Depends on:** TF0.
- **Owns:** `src/host/sim/*.ts` except the TF0 contract files (additive), `src/host/sim/npc/**`,
  `src/host/sim/nav/**`, `src/host/sim/outfits.ts`, `scripts/{crowd,bench}.ts` (run with
  `pnpm --filter @pcg/thieves-forum exec tsx scripts/<name>.ts`; no `package.json` edit, TF1 owns it).
- **Order:** test-first for steering and the NPC state machine.
- **Deliverables:**
  - Core: `createSim(roundStart)` → `step(inputs, commands)`, `view(): WorldView`, `debugView()`,
    `events()`; kinematic circle bodies, spatial hash, soft separation, walkable-area collision from the
    layout, line-of-sight query (stalls block; used later by guards).
  - Navigation from `layout.ts`: lane/alley/passage graph, stall browse points, entries.
  - NPC module `src/host/sim/npc/`: wish list from shops in the open set; states wandering → browsing →
    approaching → buying (stubbed hook for TF13) → leaving; steering blend of seek + wander + separation;
    detours (slow, glance, stop to browse) and forgetting; personality sliders (speed, distractibility,
    browse duration, hurried brisk-walk flag) rolled from the seed; human moments (pause before choosing,
    doubling back, waiting in line, chasing a dropped coin hook for TF13).
  - Churn: planned count `8 + 2 × players`; arrivals and departures through the four entries, keeping
    the live count within ±8% (rounded, ≥ ±1); round-start stream-in after the players-only opening.
  - Player movement: stick magnitude → shuffle … walk … jog (jog faster than every NPC speed); walk band
    inside the NPC speed range. Outfits: one `assignOutfit` for players and NPCs (shared pool, §6.11).
  - `scripts/crowd.ts --seed N --players P --seconds S` prints JSON metrics (live count min/max per
    second, max time any NPC stood still, path curvature histogram, NPC–NPC overlaps);
    `scripts/bench.ts` prints mean and p99 ms per step with 8 players' crowd.
- **Acceptance:**
  - TF checks.
  - Unit tests (`src/host/sim/**/__tests__/`): same seed + same inputs → identical `WorldView` after
    3000 steps; NPC state machine edges; separation keeps bodies apart; churn keeps the live count within
    tolerance every second for 2, 5 and 8 players over 270 s; entries only (never the gate); player jog
    > max NPC speed and player walk band ⊂ NPC speed range; NPCs and players get outfits from the same
    function and pool (chi-square-free check: every piece appears for both over 1000 draws).
  - `pnpm --filter @pcg/thieves-forum exec tsx scripts/crowd.ts --seed 1 --players 8 --seconds 270` exits 0 and reports
    no NPC still for > 8 s and zero overlaps deeper than 50% of a radius.
  - `pnpm --filter @pcg/thieves-forum exec tsx scripts/bench.ts` reports mean step ≤ 2 ms (log the number in §8).
  - `pnpm exec eslint apps/thieves-forum/src/host/sim` clean (no Phaser, net-client, DOM).
- **Risks / fallbacks:** NPCs bunching at stalls → queue slots at each counter (layout data). Robotic
  paths → raise wander weight and add pre-turn pauses; judged at C1.
- **Leave out:** merchants, guards, holds, economy, rendering, network.
- **User checkpoint:** C1 (see TF7).

### TF3: Hold actions under latency

- **Goal:** GRAB and PICKPOCKET holds timed on the host from the input `hold` bit, with a phone progress
  estimate corrected by host events, and the 300 ms catch grace, proven with simulated latency and jitter.
- **Read:** SPEC §3, §6.7, §6.8, §6.13 (catch grace, hot hands), §7; §12.5; contracts
  `src/shared/hold.ts`, `src/shared/messages.ts`, `src/host/sim/types.ts`, `src/host/sim/holds/`.
- **Depends on:** TF0.
- **Owns:** `src/host/sim/holds/**`, `src/controller/hold/**`, `src/shared/__tests__/latency/**`
  (latency simulator test helper).
- **Order:** test-first: write the latency simulator (seeded delay 30–250 ms, jitter ±80 ms, 30 Hz input
  samples, occasional dropped sample), then the host machine, then the phone estimator.
- **Deliverables:** host hold machine (`armGrab(char, stall, slot, ms)`, `armPickpocket(char, target)`,
  start on the first sample with `hold` set after arming, complete after the duration of continuous host
  -observed hold, cancel on bit clear / move / turn / out of reach / merchant back behind counter,
  `caught` hook, emits `holdStart {startedAt, durMs}` and `holdEnd`; records `holdEndedAt` for the catch
  grace and `hotUntil` for hot hands); `isMidSteal(char, now)` with the grace; phone `HoldEstimator`
  (starts locally on press, caps at 95% until host `complete`, re-bases on `holdStart`, snaps to 0 on
  `cancelled`/`caught`).
- **Acceptance:**
  - TF checks.
  - Unit tests with the latency simulator: a press held ≥ grab ms (as the host sees it) completes; a
    release 1 ms early never completes under any jitter seed (200 seeds); a dropped sample doesn't
    cancel; the phone bar never shows 100% before `complete`; it corrects within one event; `isMidSteal`
    is true during the hold and for 300 ms after, false at 301 ms; hot for 5 s after start whatever the
    outcome; back-shelf hold cancels (not caught) when the merchant returns.
  - `pnpm exec eslint apps/thieves-forum/src/host/sim/holds apps/thieves-forum/src/controller/hold` clean.
- **Risks / fallbacks:** stall view input arrives as `grab` (discrete) before the bit: arming waits up
  to 500 ms for the bit, then disarms.
- **Leave out:** merchant glance logic (TF8), UI (TF5 renders the estimator), wiring (TF12).
- **User checkpoint:** none (judged at C2).

### TF4: Blob transfer (host → phone), tip-off viewer, spike

- **Goal:** the risk-3 spike: host canvas → JPEG → chunks under the relay frame limit → one phone, with a
  tappable hit-area overlay; real modules TF14 uses, measured on the deployed relay.
- **Read:** SPEC §2, §6.13 (tip-offs), §6.17 (tip-off screen); §12.5–§12.6; contracts
  `src/shared/blob-transfer/types.ts`, `src/shared/viewer/types.ts`, `src/shared/messages.ts`;
  `apps/say-cheese/src/shared/blob-transfer/**` (copy and generalize); `apps/relay/SPEC.md` §2–§3;
  `packages/net-client/src/api.ts`.
- **Depends on:** TF0.
- **Owns:** `src/shared/blob-transfer/**` (types.ts additive), `src/shared/viewer/**` (types.ts additive),
  `src/controller/tipoff/**`, `src/host/spike/**`, `e2e/tf4-*.spec.ts`. The spike is a query mode
  (`/?spike=tipoff`, `/play?spike=tipoff&code=…`) that TF0's routing already sends to
  `src/host/spike/index.ts` and `src/controller/tipoff/spike.ts`.
- **Deliverables:** blob sender/receiver (Say Cheese's, keyed by `blobId`, host → one phone, acked,
  resend from chunk 0 on reconnect, drop stale ids); `encodeSnapshot(canvas, maxW)` → JPEG blob (long
  edge 960, quality 0.6, retry at 0.45 if > 90 KB) + `HitArea[]` from character screen boxes;
  phone `createTipViewer` (image fitted to the landscape screen, tap → nearest hit area outlined, own
  character excluded, SEND/Cancel callbacks); spike pages: TV shows a canvas test scene with 30 moving
  boxes, code + QR; phone taps "Snapshot" → TV sends one → phone shows it with overlay and the stats
  (KB, chunks, ms from request to complete).
- **Acceptance:**
  - TF checks.
  - Unit tests: every chunk `b64.length ≤ 12000` and the JSON envelope with max field values `< 16384`
    bytes for a 300 KB blob; reassembly in order, reversed, shuffled, duplicated; missing chunk never
    completes; hit-area tap picks the nearest box and never the own character.
  - TF e2e `e2e/tf4-tipoff.spec.ts`: host `/?spike=tipoff&debug=1` + one phone; phone requests 3
    snapshots; each arrives with `naturalWidth > 0`, size ≤ 120 KB, the phone socket never closed (no
    1009); a tap outlines a hit area.
- **Risks / fallbacks:** Phaser WebGL canvas `toBlob` reads blank without `preserveDrawingBuffer` →
  use `game.renderer.snapshot` (callback image) instead; log which. Slow relay → lower the long edge
  to 800.
- **Leave out:** tip-off judging and payouts (TF14), the real market render (TF7).
- **User checkpoint:** C1 (see TF7).

### TF5: Phone controller shell and every screen

- **Goal:** every SPEC §6.17 phone screen, landscape, rendered from host messages on the controller-kit
  shell, with `?dev=1` (fake client, screen switcher, sample data).
- **Read:** SPEC §3, §6.0, §6.4 (luck toast), §6.6–§6.9, §6.13, §6.14, §6.17, §6.18, §6.19; `PLATFORM.md`
  §3; §12.7; contracts `src/shared/{messages,hold,sfx}.ts`, `src/shared/viewer/types.ts`;
  `packages/controller-kit/src/index.ts` (+ `shell/app.ts`, `dev.ts`, `widgets/holdButton.ts`, joystick,
  `rules/`, `platform/toast.ts`); `src/controller/{main,app}.ts` (scaffold); `src/styles/brand.css`,
  `brand/preview.html` (look only); `art/forum/ui/merchant-face.svg`, `art/forum/items/**` (icons).
- **Depends on:** TF0.
- **Owns:** `src/controller/**` except `main.ts`, `src/controller/hold/**` and `src/controller/tipoff/**`;
  `src/styles/controller.css`; `e2e/tf5-*.spec.ts`.
- **Deliverables:** shell + router; screens: join/lobby (name, player color, Ready, leader How to play /
  Start), rules (kit phone screen), round start ("THIS IS YOU" outfit card on a travertine circle +
  countdown), walk-on ("You're walking in at the top left" → "Your turn!"), controller (floating
  joystick left; context main button BROWSE / SELL / PICKPOCKET with priority and hold bar; Toss coin
  with cooldown, Tip guard, Catch!; outfit card; top banner with coin pill), stall view (canopy header,
  counter and back-shelf tile rows, rarity borders, "Too heavy", taken, dim back shelf, hold bars from the
  injected `HoldEstimator`, joystick stays live, walking away closes it), merchant dialog sheet, pawnbroker
  sheet, sell-to-NPC sheet, pack sheet, tip-off screen (mounts an injected viewer; TF4's in wiring),
  stocks (CAUGHT! banner, countdown ring), hands up (Bag, Items, Total), match end (place, total, Give
  feedback via `feedbackUrl`, leader Play again; the round-start screen lays out one **or two** outfit
  cards, SPEC §9 pairs prep), small toasts only (no full-screen flashes; gold-edged
  "Lucky!" toast). Outfit card renders the citizen front-view parts tinted (inline SVG from
  `art/forum/characters/citizen/front.svg` imported as a URL, CSS variables for tints).
- **Acceptance:**
  - TF checks (includes `check:bundle thieves-forum`: play.html JS ≤ 40 KB gzip, no Phaser).
  - jsdom tests: each `screen` kind renders `[data-screen=<kind>]`; main button priority BROWSE > SELL >
    PICKPOCKET; hold tile shows the estimator's progress and never 100% before `holdEnd complete`; toss
    cooldown; back-shelf row dims unless `outOfReach` is false; leader buttons only for the leader;
    stall view closes on a host `stallView null`.
  - `! grep -rnE "from '(\.\./)+host/|phaser" apps/thieves-forum/src/controller` prints nothing.
  - TF e2e `e2e/tf5-dev.spec.ts`: `/play?dev=1` steps through every screen with no console errors and
    saves screenshots.
- **Risks / fallbacks:** play.html over 40 KB → log the measured size and raise the limit by ≤ 20% in a
  Build decision (`scripts/check-bundle.mjs` is root: only with user approval, as a Blocker).
- **Leave out:** network wiring (TF7/TF12), the real tip viewer (TF4), audio (phones are silent).
- **User checkpoint:** C1 glance.

### TF6: TV DOM UI

- **Goal:** every DOM screen and HUD on the TV from `TvView`, couch-drivable, with a `?ui=<screen>` page.
- **Read:** SPEC §6.2, §6.14–§6.16, §6.18, §6.19 (process only); §12.2 (DOM over canvas); contracts
  `src/host/ui/types.ts`, `src/shared/messages.ts`; `packages/game-kit/src/index.ts` (`qrMatrix`,
  rules sequencer and card shell); `src/host/lobby.ts` (scaffold); `src/styles/{brand,tv}.css`;
  `art/forum/ui/{forum-backdrop,podium}.svg`; `packages/catalog` (`feedbackUrl`).
- **Depends on:** TF0.
- **Owns:** `src/host/ui/**` (types.ts additive), `src/host/lobby.ts` (moved into `ui/`),
  `src/styles/tv.css`, `e2e/tf6-*.spec.ts`.
- **Deliverables:** title (backdrop, coin mark, wordmark, tagline, room code card, QR), lobby (players
  with color and ready, leader name, Start state), in-round HUD (bronze timer ring + "ROUND 2 / 3" top
  center, room code bottom right; nothing else), hands-up banner, reveal card component (bag, item icons
  with values, coin-edge haul strip, shrinks to "+haul" tag) positioned from screen coordinates the scene
  provides, podium screen (II/I/III blocks, 4th+ row, "[NAME] WINS!", feedback QR), How to play card
  host (kit card shell, game styling via `--pcg-rules-*`); host controls by keyboard / gamepad / leader
  phone, no hover.
- **Acceptance:**
  - TF checks.
  - jsdom tests: each `TvView` phase renders `[data-tv=<phase>]`; the `play` HUD contains no player
    names, colors or scores (text and computed classes checked); ties on the podium share the block and
    banner; QR renders; keyboard controls emit the right events.
  - `grep -c "#[0-9a-fA-F]\{3,6\}" apps/thieves-forum/src/styles/tv.css` prints `0`.
- **Leave out:** in-world reveal (rings, tags, crowns: TF18 in the scene), animations (TF18), audio.
- **User checkpoint:** none.

### TF7: Crowd spike wiring

- **Goal:** the crowd on the TV with real phones driving characters: loop, input, renderer, world
  scene, dev overlay, stress and perf readout. This is C1.
- **Read:** SPEC §5, §6.2, §6.3, §6.10, §6.11, §6.16; §12.2–§12.5; public exports of TF1
  (`src/host/render/types.ts`), TF2 (`src/host/sim/index.ts`), TF5 (`src/controller/app.ts`), TF6
  (`src/host/ui/index.ts`); `packages/net-client/src/api.ts`; `packages/game-kit/src/{loop,debug}.ts`;
  `apps/fort-frenzy/src/host/{game,main,stress}.ts` (shape only).
- **Depends on:** TF1, TF2, TF5, TF6.
- **Owns:** `src/host/{main,game,debug,stress}.ts`, `src/host/debugHooks/**`, `src/host/net/**`,
  `src/host/scene/**`, `src/controller/{main,net}.ts`, `package.json` `pcg.e2e` (`exclusive: true` if
  the suite proves timing-sensitive, logged), `e2e/tf7-*.spec.ts`.
- **Deliverables:** host: relay client, roster → lobby → "Spike start" (leader or key) → a round of the
  sim with the players; input samples to `PlayerInput`; fixed loop with interpolation; world scene
  (floor tiles, stalls open/closed by the open set with canopy tints, gate, stocks, y-sorted characters
  on their rigs with outfits, merchants idle at counters as placeholders); HUD from TF6; `?timeScale=`;
  `window.__pcg` (`code`, `players`, `phase`, `world`, `setTimeScale`, `registerDebug`) with hook groups
  in `src/host/debugHooks/`; **dev overlay** (`D` key or `?overlay=1`, debug only) labeling players and
  NPC states; `?stress=1` (8-player crowd with bots on the player slots) with FPS and step-time readout;
  phone: join → controller screen; joystick input at 30 Hz or on change.
- **Acceptance:**
  - TF checks.
  - TF e2e `e2e/tf7-spike.spec.ts`: host + 3 phones join, leader starts the spike; each phone's stick
    moves its character (`__pcg.world()` position changes in the stick direction); the TV canvas has
    no console errors; the live NPC count stays within tolerance for 20 s at `timeScale` 2.
  - Disguise test `src/host/scene/__tests__/disguise.test.ts`: the scene builds characters only from
    `WorldView` (no import of player state); the overlay module is only reachable when debug is on.
  - `pnpm build:thieves-forum && pnpm check:bundle thieves-forum`.
- **Risks / fallbacks:** FPS below 50 on the TV with the full crowd → reduce clip blending, batch
  shadows, half-res effects (FF15 bench notes); logged numbers.
- **Leave out:** merchants' AI, guards, holds, economy (TF8–TF12).
- **User checkpoint (C1):** after the push and the preview build (§9 steps 1–5 done): on the **TV**,
  open `<preview>/?debug=1`, scan the QR with **2–3 real phones** (≥1 iPhone, ≥1 Android), Start. With 1–2
  extra people **watching the TV only**, the phone players blend in for 2 minutes and then try to give
  themselves away subtly. Watchers write down which characters they think are players, then press `D`
  for the overlay to check. Then open `<preview>/?stress=1&debug=1` and read the FPS. Also: open
  `<preview>/?spike=tipoff` on the TV and `/play?spike=tipoff&code=XXXX` on each phone, take 5 snapshots
  each and note KB and ms; open `<preview>/play?dev=1` on a phone and flip through every screen; open
  `<preview>/?gallery=1&debug=1` on the TV. Report: how many players watchers spotted and **why** (gait,
  paths, stopping, speed), FPS in stress mode and the TV model, snapshot KB/ms and whether tapping a
  character felt accurate, phone screens that look wrong, any art that reads badly from the couch.

### TF8: Merchants + stalls + stall theft (sim)

- **Goal:** SPEC §6.6–§6.7 in the sim: stock and placement, merchant attention by position, glance with
  wind-up, suspicion, dialog states, Ask about / bring forward / leave on counter, stall theft via holds,
  merchant catch → alert.
- **Read:** SPEC §6.5–§6.7, §6.9 (merchant side), §6.12 (alerts), §7; §12.3–§12.4; contracts
  `src/host/sim/{types,events,systems}.ts`, `src/host/sim/{merchants,stalls}/`, `src/shared/viewer/types.ts`;
  exports of TF2 (`src/host/sim/index.ts`) and TF3 (`src/host/sim/holds/index.ts`).
- **Depends on:** TF2, TF3.
- **Owns:** `src/host/sim/merchants/**`, `src/host/sim/stalls/**`. Calls the ledger and `raiseAlert`
  through their TF0 interfaces (fakes in tests; TF10 and TF9 implement them in the same wave).
- **Order:** test-first per rule.
- **Deliverables:** stall stock from shops (rarity, ~1 rare per stall per round, uncommon slow restock,
  common restock; placement rule and fallback); `stallViewFor(stall, char, now)` → `StallView` (taken,
  too heavy, out of reach); merchant: serving queue, walks along the counter to the served customer,
  glance timer (4–8 s base, ×2 suspicion decaying over ~20 s, wind-up beat then look), states behind
  counter / out (coin, NPC call, guard call, fetch); dialog: just browsing (suspicion +), buy (hook for
  TF13), ask about (turns to fetch, back to counter), leave; bring-forward and maybe-leave-on-counter
  with return-to-shelf; theft: `grab` arms a hold (+500 ms back shelf only while merchant is out), one
  holder per item, complete → item to pack (ledger hook), glance landing mid-grab → `merchantCatch` event
  (item back, alert raised, no money lost); merchants only catch at their own stall.
- **Acceptance:**
  - TF checks.
  - Unit tests, one per rule above (incl.: wind-up always precedes the look by the balance beat; a
    release during the wind-up is safe; suspicion doubles glance rate and decays; back-shelf grab
    impossible while behind counter, cancelled (not caught) on return; second player sees `takenByOther`;
    no `tv` event on a successful grab other than the item leaving the counter (`stallChanged`)).
  - `pnpm exec eslint apps/thieves-forum/src/host/sim/merchants apps/thieves-forum/src/host/sim/stalls` clean.
- **Leave out:** buying and money (TF13), wiring and rendering (TF12), coin toss (TF13).
- **User checkpoint:** judged at C2.

### TF9: Guards, view cones, chase/escape, catches, stocks, escalation (sim)

- **Goal:** SPEC §6.12–§6.13 in the sim except tip-offs and pickpocketing: patrols, cones with line of
  sight, spotting, alerts, chase and escape, guard and in-person catches, pot, stocks, immunity,
  activations and reinforcements.
- **Read:** SPEC §6.3, §6.11–§6.14, §7; §12.3; contracts `src/host/sim/{types,events,systems}.ts`,
  `src/host/sim/{guards,catches,ledger}/types.ts`; exports of TF2 (LOS, nav), TF3 (`isMidSteal`,
  `hotUntil`).
- **Depends on:** TF2, TF3.
- **Owns:** `src/host/sim/guards/**`, `src/host/sim/catches/**`. Pays through the TF0 ledger
  interface (a fake in tests; TF10 implements it in the same wave).
- **Order:** test-first per rule.
- **Deliverables:** patrol loop (upper lane → alley → lower lane → end passage), alley speed 60%; cone
  with stall occlusion; spot = mid-steal in cone with LOS → red cone, "!" event, jog, activation; alert
  API `raiseAlert(thief, lane)` (every guard in the lane, else nearest); chase to live position while seen,
  last-seen otherwise; escape after 3 s out of every chaser's sight; guard catch on reach → pot 25% of bag
  (ledger hook), march to stocks, 20 s, immunity 3 s; locked-in catch API for tip-offs (no escape);
  in-person catch from `catch` bit: nearest in front within reach, right if `isMidSteal` (grace), whole
  pot, no stocks; wrong (or NPC) → wrong-grab penalty; stolen item always back on the counter; starting
  guards per round and player count; activation counter → +1 guard through the gate every 5, cap 4; guards
  never grab NPCs or react to browsing.
- **Acceptance:**
  - TF checks.
  - Unit tests, one per rule above (incl.: a stall between guard and thief blocks the spot; ducking into
    an alley breaks LOS; escape at 3.0 s and not at 2.9 s; no catch while in the stocks or 3 s after;
    catch grace 300 ms; 5 activations → 2nd guard enters through the gate; 4 is the cap; a catch fires a
    `tv` starburst event and pays through the ledger only).
  - `pnpm exec eslint apps/thieves-forum/src/host/sim/guards apps/thieves-forum/src/host/sim/catches` clean.
- **Leave out:** tip-offs, pickpocket and NPC shouts (TF14; use `raiseAlert`), round-end rush (TF16).
- **User checkpoint:** judged at C2.

### TF10: Match flow, ledger, party, open stalls

- **Goal:** the match as a pure state machine (lobby → rules → round start → play → hands up → reveal →
  transition ×3 → podium → lobby), the ledger (purse, pack, hauls, payouts by side), roster/leader, and
  the open-stall rule.
- **Read:** SPEC §6.1, §6.2, §6.4, §6.14, §6.15, §6.18 (lobby, leader, joins timing), §6.19 (when it
  opens), §7, §9 (side); §12.3; contracts `src/host/match/types.ts`, `src/host/sim/ledger/types.ts`,
  `src/shared/messages.ts`; `src/host/roster.ts` (scaffold); `apps/sunny-side/src/host/match/leader.ts`
  (reference only).
- **Depends on:** TF2.
- **Owns:** `src/host/match/**`, `src/host/sim/ledger/**`, `src/host/party/**`, `src/host/roster.ts`
  (moved into `party/`).
- **Order:** test-first (transition table first).
- **Deliverables:** `createMatch({rng, now})` → `dispatch(event): Effect[]`, `tvView()`, `screenFor(id)`;
  leader (earliest connected, no snap-back), Ready, Start needs ≥ `minPlayers`; rules via the game-kit
  sequencer (first Start only; How to play from lobby); open-stall pick once per match (§8 rule);
  `RoundStart` per round (seed, outfits via `assignOutfit`, starting guards); round timer 270 s; hands-up
  freeze; reveal order lowest haul → highest with ties crowned together; podium with ties; Play again →
  lobby with same players. Ledger: 20 d purse per round, pack weight cap 15, haul = bag + items − 20,
  pot = floor(25% of bag), payouts (catcher whole pot; tipper ¼; guard keeps rest), wrong-grab and tip
  fee debits; all keyed by `Side`; match total = sum of hauls (part-round joiners count what they played).
- **Acceptance:**
  - TF checks.
  - Unit tests: every phase edge incl. invalid-event no-ops; Start only by the leader with ≥2 ready;
    rules only on the first Start; open stalls = players + 2 clamped 5–10, pawnbroker + jewelry + one of
    bakery/pottery always, fixed for the match, seeded; haul math incl. negative hauls; pot rounding;
    payout table rows; match total sums; podium ties; leader handoff.
  - `pnpm exec eslint apps/thieves-forum/src/host/match apps/thieves-forum/src/host/sim/ledger apps/thieves-forum/src/host/party` clean.
- **Leave out:** mid-round joins, disconnect takeover, round-transition rush (TF16), wiring (TF12).
- **User checkpoint:** judged at C2.

### TF11: Web Audio module with synthesized placeholders

- **Goal:** SPEC §6.20's player as a reusable module: bed loop with crossfade, one-shot scheduler (2–6 s,
  random pan, pitch and volume, no immediate repeats), ducking (−8 dB ~1 s; out under reveal/podium),
  cue playback, all driven by an `AudioMap`; placeholder sounds synthesized in code until TF19.
- **Read:** SPEC §6.20, §7 (ambience rows), §9 (audio map); §12.8; contracts `src/shared/sfx.ts`,
  `src/shared/audio/types.ts`; `apps/say-cheese/src/shared/audio/synth.ts` (unlock, fake context
  tests); `apps/fort-frenzy/src/host/audio/` (cue shape).
- **Depends on:** TF0.
- **Owns:** `src/shared/audio/**` (types.ts additive), `src/host/audio/**`.
- **Deliverables:** `src/shared/audio/` (no game imports, extraction candidate): `createAudioEngine
  ({createContext, map, rng})` with `unlock()`, `startBed()`, `startOneShots()`, `play(cue)`, `duck(ms,
  db)`, `setScene('play'|'reveal'|'podium'|'lobby')`, loading from URLs with a synthesized fallback per
  cue; `src/host/audio/`: the forum `AudioMap` (paths under `audio/forum/` that may not exist yet →
  fallback) and `createSfx()` implementing `Sfx`; unlock on the lobby "Sound on" control and any host
  click/keydown.
- **Acceptance:**
  - TF checks.
  - Unit tests with a fake `AudioContext`: `play` before `unlock` is a silent no-op; one-shot intervals
    within 2–6 s and never the same file twice in a row over 500 draws; ducking ramps to −8 dB and back
    in ~1 s; `setScene('reveal')` silences the ambience; a missing file falls back to its synth; the cue
    set equals `SfxCue` and has no grab/pickpocket cue.
- **Leave out:** real files and mixing (TF19), music, phone audio.
- **User checkpoint:** judged at C6.

### TF12: Vertical slice wiring

- **Goal:** lobby → one full round on real phones: open stalls with merchants (glance with wind-up,
  dialog, just-browsing suspicion), stall theft with holds, NPCs, one guard with a view cone, an
  in-person catch and the stocks, hands up and a plain reveal.
- **Read:** SPEC §2, §3, §6.2–§6.7, §6.11–§6.14, §6.17; §12 (all); this file §8; public exports of
  TF3, TF7–TF11.
- **Depends on:** TF7–TF11 merged; C1 approved (C1 fixes merged).
- **Owns:** `src/host/**` and `src/controller/**` (serial milestone), `e2e/tf12-*.spec.ts`,
  `e2e/helpers.ts` (additive).
- **Deliverables:** match ↔ sim ↔ scene ↔ phones; host message-handler registry
  `src/host/net/handlers/` (one file per discrete message, `import.meta.glob`; frozen at TF12) with
  `browse`, `grab`, `dialog`, `ready`, leader actions; main-button context providers
  `src/host/net/context/*.ts` (glob; `browse.ts` now, SELL and PICKPOCKET files added by TF13/TF14);
  empty scene modules `src/host/scene/{coinToss,reveal,podium,transition}.ts` and
  `src/host/scene/effects/index.ts` wired in, so TF13/TF16/TF18/TF20 only fill their own file; private events routed to one phone only; stall
  view state sent on open and on every change of that stall; hold events to the phone estimator;
  scene: merchant rigs with glance clips and swoosh effect, guard with cone (red on spot), "THIEF!"
  bubble, catch starburst + coin flight, stocks with countdown; TV events only from `tv` `SimEvent`s;
  HUD; hands-up screens; reveal as TF6 cards in order (plain); `sfx.play` calls at every SPEC §6.20 cue
  moment (TF11 engine).
- **Acceptance:**
  - TF checks.
  - TF e2e `e2e/tf12-slice.spec.ts` (`?debug=1&timeScale=…`, debug hooks to place characters): 3
    phones join and Start; phone A browses an open stall, holds GRAB until complete → item in A's pack,
    toast on A only; phone B grabs during a forced glance (`__pcg` hook) → merchant catch, guard alert,
    B escapes after breaking LOS; phone C Catch!es A mid-grab → C gets the pot, TV shows the catch; a
    guard catches B → stocks 20 s, B's phone shows IN THE STOCKS; timer ends → HANDS UP! on all phones,
    reveal cards lowest → highest.
  - Disguise test `src/host/__tests__/disguise-events.test.ts`: over a seeded scripted round, grab
    success, pickpocket success and tip payout produce no `tv` event and no sfx cue; the TV message
    stream for the round contains no player id outside `handsUp`/`reveal`.
  - `pnpm check:bundle thieves-forum` (log play.html size).
- **Risks / fallbacks:** stall view jitter on fast changes → coalesce stall-view sends to ≤ 10 Hz.
- **Leave out:** buying/selling/pawnbroker, pickpocket, tip-offs, coin toss, joins, takeover (TF13–TF16).
- **User checkpoint (C2):** after the push and preview build: TV opens `<preview>/` fullscreen. **3
  people, 3 phones (≥1 iPhone Safari, ≥1 Android Chrome)** in one room, screens hidden from each other.
  Play **two rounds** of the slice: blend in, browse, steal from counters, wait for merchant turns, try
  "Just browsing", get spotted by the guard and escape through an alley, try a Catch! on someone
  mid-grab, sit in the stocks. Report: could you tell who was who (and how), did GRAB feel fair under the
  room's Wi-Fi (any "I let go in time but got caught"), was the wind-up readable from the couch, phone
  readability in landscape, anything stuck.

### TF13: Economy + coin toss

- **Goal:** SPEC §6.4–§6.5, §6.9 money and distraction rules: buying, pawnbroker rate of the moment,
  NPC selling with per-NPC rates, low-weighted rolls, NPC purchases, restock, coin toss.
- **Read:** SPEC §6.4, §6.5, §6.6 (Buy…), §6.9, §6.10 (NPCs buy and sell), §6.17 (pawnbroker, sell,
  pack sheets), §7; §12; contracts `src/host/sim/{economy,distractions,ledger}/types.ts`.
- **Depends on:** TF12; C2 approved.
- **Owns:** `src/host/sim/economy/**`, `src/host/sim/distractions/**`, `src/host/sim/npc/buying.ts`
  (new, plugged into TF2's hook), `src/host/net/handlers/{buy,sell,pawn,toss}.ts`,
  `src/host/net/context/sell.ts`,
  `src/controller/screens/{pawnbroker,sell,pack,dialog}.ts`, `src/host/scene/coinToss.ts`,
  `e2e/tf13-*.spec.ts`.
- **Deliverables:** `lowRoll(rng, min, max, k)`; buy at counter price; pawnbroker rate re-rolled every
  45 s for everyone, sheet shows today's offer; NPC sale rate rolled at spawn, only wish-list items, offer
  shown; NPCs spend at stalls (can empty uncommon stock); "Lucky!" toast for top-quarter rolls; coin
  toss handler (1 d, 8 s cooldown, aim from stick or facing, arc/bounce/glint < 1 s, nearest merchant
  within range "?" walks out and back, NPCs sometimes chase it).
- **Acceptance:**
  - TF checks.
  - Unit tests: `lowRoll` median at ¼ of the range and top quarter ~13% (±2%) over 100k seeded draws;
    pawnbroker rate constant within a 45 s window; an NPC's rate never changes after spawn; sell only
    wish-list items; pack cap blocks buy and grab ("Too heavy"); toss cost, cooldown and the merchant
    leaving the counter (back shelf reachable meanwhile); no `tv` event for buy/sell beyond stock change.
  - TF e2e `e2e/tf13-economy.spec.ts`: buy, sell to the pawnbroker, sell to an NPC, toss a coin and see
    the merchant leave the counter.
- **Leave out:** pickpocketing and tip-offs (TF14), bots (TF17).
- **User checkpoint:** judged at C5.

### TF14: Pickpocketing, NPC glances, shout/escape, tip-offs

- **Goal:** SPEC §6.8 and §6.13 tip-offs: pickpocket holds with NPC glances and point-and-shout alerts;
  tip-off snapshot → judged → locked-in guard catch → tipper's ¼ cut on the phone.
- **Read:** SPEC §6.8, §6.12 (alerts, tip-offs), §6.13, §6.17 (tip-off screen, toasts), §7; §12;
  contracts `src/host/sim/{pickpocket,tipoff}/types.ts`; exports of TF3, TF4, TF9.
- **Depends on:** TF12, TF4; C2 approved.
- **Owns:** `src/host/sim/pickpocket/**`, `src/host/sim/tipoff/**`,
  `src/host/net/handlers/{tipOpen,tipSend,tipCancel}.ts`, `src/host/net/context/pickpocket.ts`,
  `src/host/net/snapshot.ts`,
  `src/controller/tipoff/**` (wiring the viewer into the TF5 screen), `e2e/tf14-*.spec.ts`.
- **Deliverables:** "behind someone within reach" detection (main button PICKPOCKET), 2000 ms hold,
  8–20 d low-weighted take or all the victim has; cancels on move/turn/out of reach; player victims: no
  warning, then "Your purse feels lighter… −N"; NPC victim glance (~25%, higher if robbed recently) with
  wind-up, catch → point-and-shout + "THIEF!" + `raiseAlert`; NPC purses; tip-off: snapshot of the
  live canvas at tap time + hot set recorded, sent via TF4, phone picks, pays fee, SEND → lands if hot
  at snapshot or send time → nearest free guard jogs and catches (no escape), activation, tipper +¼ pot
  toast; miss → fee lost, nothing on TV; NPC tips always miss; snapshot TTL from balance.
- **Acceptance:**
  - TF checks.
  - Unit tests per rule (incl.: hot at snapshot but not at send still lands; cold at both misses; the
    landed tip makes no guard walk toward the tipper; pickpocket of a 5 d victim takes 5; recently-robbed
    NPC glance chance higher; no `tv` event on pickpocket success or tip payout).
  - TF e2e `e2e/tf14-tipoff.spec.ts`: phone A pickpockets B (B gets the toast later, TV unchanged); phone
    C opens Tip guard, receives the snapshot, taps A, SEND → a guard catches A, A goes to the stocks, C's
    phone shows +N.
- **Leave out:** joins and takeover (TF16).
- **User checkpoint:** judged at C5.

### TF15: How to play

- **Goal:** SPEC §6.19's seven rules cards on the TV with illustrations and drafted copy, via the kits.
- **Read:** SPEC §6.19, §6.0; `PLATFORM.md` decision #12; `packages/game-kit/src/rules/`,
  `packages/controller-kit/src/rules/`; `apps/say-cheese/src/host/view/rules*` (reference); TF6
  `src/host/ui/rules/` host; `art/forum/**` (illustration sources, used as-is).
- **Depends on:** TF12; C2 approved.
- **Owns:** `src/content/rules.ts`, `src/host/ui/rules/**` (cards and illustrations), `e2e/tf15-*.spec.ts`.
- **Deliverables:** seven `RulesCard`s (title, body, optional note, an illustration composed from
  delivered SVGs) following the §6.19 outline; copy marked DRAFT; `?ui=rules` shows them.
- **Acceptance:** TF checks; jsdom test: 7 cards, every card has title and body ≤ 160 characters; TF e2e
  `e2e/tf15-rules.spec.ts`: leader opens How to play from the lobby, Next through 7 cards, back to lobby.
- **User checkpoint (C3):** read the seven cards as text in `apps/thieves-forum/src/content/rules.ts` (or on
  `<preview>/?ui=rules&debug=1` on the TV). Reply with edits per card, or "approved".

### TF16: Lifecycle: joins, takeover, leave, round transition, full match flow

- **Goal:** SPEC §6.18 and §6.14 transition: mid-round walk-on joins, disconnect → NPC takeover, leave →
  walk off, joins waiting during reveal/transition/podium, round transition rush, and 3 rounds → podium →
  lobby on real phones.
- **Read:** SPEC §6.2, §6.10 (churn), §6.14, §6.15, §6.18; §12; `apps/relay/SPEC.md` §3 (identity,
  reconnect); exports of TF2, TF9, TF10, TF12.
- **Depends on:** TF13, TF14, TF15; C3 approved.
- **Owns:** `src/host/sim/lifecycle/**`, `src/host/match/**`, `src/host/net/session.ts`,
  `src/host/scene/transition.ts`, `src/controller/screens/walkOn.ts`, `e2e/tf16-*.spec.ts`.
- **Deliverables:** walk-on: random outfit + purse, entry among the four with no guard nearby, phone
  "You're walking in at …", NPC-driven for ~1.5 s on screen, then control + "Your turn!", counts against
  the NPC budget; disconnect: character under NPC behavior, hold cancelled, keeps bag/pack, reclaims on
  reconnect by player key; leave: walks off like a leaving NPC, full removal; joins during reveal /
  transition / podium wait for the next round; transition: main guard charges the top earner, three
  guards from the gate, players flee away from the nearest guard in their lane, off map, fade; next
  round; after round 3 podium; Play again.
- **Acceptance:**
  - TF checks.
  - Unit tests per rule (incl.: the NPC count including walk-ons stays within tolerance; a disconnected
    character keeps moving under NPC behavior and is still pickpocketable; a joiner during reveal is
    seated at the next round start; part-round match totals).
  - TF e2e `e2e/tf16-match.spec.ts` (`timeScale`): 4 phones play 3 short rounds to the podium; a 5th
    phone joins mid-round and walks on; one phone's context goes offline mid-hold and back (hold
    cancelled, character never froze: position changed while offline); Play again returns to the lobby.
- **Leave out:** relay or net-client changes; self-pause (SPEC: none in v1).
- **User checkpoint:** C5 (see TF18).

### TF17: Economy harness + balance report

- **Goal:** numbers for the §7 fee rule: seeded bots playing headless rounds, reporting thief earnings
  per minute, catch rates and money distribution.
- **Read:** SPEC §6.4, §6.7–§6.9, §6.12–§6.13, §7 (fee rule); §12.9; exports of the sim, ledger,
  economy, pickpocket, tipoff, guards.
- **Depends on:** TF13, TF14.
- **Owns:** `src/host/sim/bots/**`, `scripts/economy.ts`, `docs/economy-report.md`.
- **Deliverables:** bots that play through the same `PlayerInput` + commands as phones: browse, buy,
  sell, steal (release on wind-up with a skill-dependent reaction time), pickpocket, toss, tip, catch;
  config: players, skill mix, strategy weights, seeds, rounds; report (Markdown + JSON): earnings per
  minute by action, catch rate by catcher type, escape rate, haul percentiles, Gini of match totals,
  activations and guard count over time, and the §7 rule applied: proposed tip fee, wrong-grab penalty
  and pickpocket range with the inputs shown. A report, not a gate.
- **Acceptance:**
  - TF checks.
  - `pnpm --filter @pcg/thieves-forum exec tsx scripts/economy.ts --players 4 --seeds 20 --skill 0.5` exits 0 and writes
    `apps/thieves-forum/docs/economy-report.md` with the sections above.
  - Unit test: the same seed and config give an identical report.
- **User checkpoint (C4):** read `docs/economy-report.md` on GitHub. Reply with the §7 values to use
  (tip fee, wrong-grab penalty, pickpocket range, anything else), or "keep". Approved values become a
  `TF17-fix-1` balance change in `balance.ts` + SPEC §7 + a §11 row.

### TF18: TV presentation

- **Goal:** SPEC §6.14–§6.16 on the TV as sequences: HUD polish, hands-up, reveal (dim NPCs, rings and
  name tags, cards lowest → highest shrinking to "+haul", crowns), podium (3rd, 2nd, then 1st with crown
  and banner), title screen.
- **Read:** SPEC §6.0, §6.14–§6.16; `art/forum/effects/{player-ring,crown-laurel,confetti-pieces,
  firework-*}.svg`, `art/forum/ui/**`; TF6 `src/host/ui/**`; TF12 scene API.
- **Depends on:** TF13, TF14, TF15; C3 approved.
- **Owns:** `src/host/ui/**` except `ui/rules/**`, `src/host/scene/{reveal,podium}.ts`,
  `src/styles/tv.css`, `e2e/tf18-*.spec.ts`.
- **Deliverables:** sequences as small timelines (skippable by the leader), `prefers-reduced-motion`
  respected, `?ui=reveal|podium|title` fixtures with 8 players and ties.
- **Acceptance:** TF checks; TF e2e `e2e/tf18-gallery.spec.ts`: each fixture renders with no console
  errors; a two-way tie shows two crowns and a shared podium banner; no match totals appear before the
  podium (text check).
- **User checkpoint (C5, covers TF16–TF18):** preview, TV + **4+ people** on phones (iOS and Android),
  full **3-round match** to the podium and Play again. During it: one person joins mid-round (walk-on),
  one locks their phone for 20 s mid-round, one taps Leave. Try every action at least once: buy, sell to
  the pawnbroker and to a shopper, steal counter and back shelf (with a coin toss or Ask about),
  pickpocket a shopper and a player, a tip-off, a Catch!. Report: confusing moments, any reveal of a
  player during a round, pacing of the 4:30 round, the reveal and podium, scores that look wrong.

### TF19: Audio integration

- **Goal:** the delivered files in the TF11 engine and a mix that works on TV speakers.
- **Read:** SPEC §6.20, §7; `src/host/audio/` (TF11); `audio/forum/**` (user delivery);
  `assets/LICENSES.json`.
- **Depends on:** TF16–TF18; the audio delivery (§9 step 7; pre-flight row).
- **Owns:** `src/host/audio/**`, `src/__tests__/licenses.test.ts` (additive).
- **Deliverables:** `AudioMap` points at the delivered files (bundled by Vite from `audio/forum/**`);
  per-cue gain table; bed crossfade at the loop point; synth fallbacks kept for missing files.
- **Acceptance:** TF checks (licenses test covers every delivered file); unit test: every `AudioMap` path
  exists on disk; TF e2e `e2e/tf19-audio.spec.ts`: Sound on → `__pcg.audio()` reports the bed playing and
  a catch triggers a duck, no console errors.
- **User checkpoint (C6):** on the **TV with its own speakers**, `<preview>/`, Sound on, play one round
  with 3+ people. Report: bed level (too loud/quiet, loop audible?), one-shots (too frequent, any
  intelligible words), whether THIEF!, whistle and catches cut through, anything annoying.

### TF20: Art polish

- **Goal:** SPEC §6.21 effects at full quality: glance swoosh timing, coin toss arc and glint, speed
  lines, closed-stall shade, starburst, coin shower, crowns, confetti, fireworks.
- **Read:** SPEC §6.3, §6.9, §6.12–§6.15, §6.21; `art/forum/effects/**`, `ART_NOTES.md` (effect
  behavior); `src/host/render/**`, `src/host/scene/**` (structure).
- **Depends on:** TF16–TF18; C5 approved.
- **Owns:** `src/host/render/**`, `art/forum/rigs/**`, `art/forum/sprites.json`,
  `src/host/scene/effects/**`, `src/host/gallery/**`, `e2e/tf20-*.spec.ts`.
- **Acceptance:** TF checks; `e2e/tf20-gallery.spec.ts` renders every effect in `?gallery=1` with no
  console errors; `pnpm --filter @pcg/thieves-forum exec tsx scripts/bench.ts` unchanged within 10%.
- **User checkpoint (C7):** on the **TV from the couch**, open `<preview>/?gallery=1&debug=1`, step
  through every section, then watch one round. Report pieces that read badly at distance and effects that
  are too big, small, slow or fast.

### TF21: Hardening

- **Goal:** confidence for the handoff: soak, perf with the full crowd, a full-match e2e, and an audit of
  the disguise invariants.
- **Read:** SPEC §2, §6.11, §6.20 (no grab/pickpocket sound), §12.9; this file §8.
- **Depends on:** TF16–TF18.
- **Owns:** `scripts/soak.ts`, `src/host/__tests__/disguise*.test.ts`
  (additive), `e2e/tf21-*.spec.ts`.
- **Deliverables:** `soak` (100 seeded headless 8-player rounds with bots: no exceptions, NPC count in
  tolerance, no stuck characters, ledger conserves money except declared sinks/sources); disguise audit
  tests (outfit pool, rig and clip set, speed bands, `CharacterView` keys, `tv` events, sfx cues, TV
  message stream during `play`); full-match e2e with 8 phones.
- **Acceptance:** TF checks; `pnpm --filter @pcg/thieves-forum exec tsx scripts/soak.ts` exits 0; TF e2e
  `e2e/tf21-full.spec.ts` (8 phones, 3 rounds at `timeScale`) passes; `pnpm --filter @pcg/thieves-forum exec tsx scripts/bench.ts` mean step ≤ 2 ms.
- **User checkpoint:** none.

### Fix milestones (`TF<N>-fix-<k>`)

Checkpoint notes become fix milestones with the owning milestone's model and Owns. The brief adds the
user's notes verbatim. Acceptance = the owner's acceptance plus a test or e2e reproducing each note
where one can run in the sandbox.

## 4. Subagent brief template

```text
You are building milestone {TF#}: {Milestone name}, of Thieves' Forum (apps/thieves-forum).
Goal: {Goal}

Setup: in your checkout (worktree or main), `git checkout -b {build/tf<N>-<slug> | build/tf<N>-fix-<k>} thieves-forum`.
Read ONLY: apps/thieves-forum/BUILD_PLAN.md §2, §4, §8 and your milestone entry; SPEC §12 and {Read
list}. Read other files only where your Deliverables require it. {For fixes: "User notes: <verbatim>"}
Owns (write only here): {Owns}
Deliverables: {Deliverables}
Order: {Order, if any}
Acceptance (build until every command passes; run them yourself): {Acceptance}
Leave out: {Leave out}

Rules:
- Contracts: change frozen files (BUILD_PLAN §3 Freeze points) only additively; when you do, update the
  contract file, SPEC §12, and add `- [{TF#}] contract+: …` under BUILD_PLAN §8.
- Shared code only as your entry says. Never touch packages/**, apps/relay/**, other apps, the brand kit
  (src/styles/brand.css, public/**, brand/**), art/forum/**/*.svg or audio/**. Root files only if your
  entry lists them. Code copied from another app keeps a header naming its source and is logged as an
  extraction candidate.
- Art and audio files are inputs: never redraw, regenerate, re-export or edit them. A missing piece gets a
  dev-only fallback and a §8 line naming it.
- If SPEC.md and the code you need disagree, follow SPEC.md. If the SPEC itself looks wrong, log a
  Blocker (§7) instead of redesigning.
- Follow AGENTS.md: lint boundaries (sim/match plain TS, no Phaser/net-client/DOM; controller never
  imports host or phaser), tests in __tests__/, a spec citation in every new file's header comment
  (e.g. `// Merchant glance (SPEC §6.6)`), exact-pinned deps, LF, Prettier.
- Nothing on the TV may reveal a player during a round (SPEC §6.11): no player ids in WorldView, no tv
  event or sound for grab success, pickpocket success or tip payout.
- Add a changeset for shipped code: `pnpm changeset --minor @pcg/thieves-forum -m "…"` (fixes: --patch).
- If you can spawn agents, hand side work to cheaper helpers: `haiku` for file lookups, running commands
  and digesting long logs; `sonnet` for drafting tests, fixtures and mechanical multi-file edits. Keep
  the milestone's hard logic for yourself.
- A choice the spec doesn't cover: pick the simplest option and log `- [{TF#}] decision: …, because ….`
  under BUILD_PLAN §8.
- Blocked: write it under BUILD_PLAN §7 Blockers in the given format, commit, stop. Don't guess.
- Done: tick your items in BUILD_PLAN §6 (not "Merged" or "User approved"), commit, `git rebase
  thieves-forum`, rerun acceptance if the rebase pulled anything in. Don't merge, don't push.
- Reply in 150 words or fewer: what was built, what was deferred, blockers, branch name.
```

## 5. Orchestrator rules

1. Read only `apps/thieves-forum/BUILD_PLAN.md`. Never read source code. Trust subagent reports and the
   Progress checklist.
2. Start every session: `git fetch origin thieves-forum main && git checkout thieves-forum && git pull
   --ff-only origin thieves-forum`; read §6, §7 and `git log --oneline -15`; run §1 pre-flight via a
   `haiku` helper (it merges `origin/main` per the pre-flight row and stops on a conflict).
3. One subagent per milestone via the Agent tool with the model from §3. Run milestones marked parallel
   in the same turn with `isolation: "worktree"`; serial ones (TF0, TF12, fixes sharing files) run in the
   main checkout. Fill the §4 brief from the milestone entry.
4. Everything that isn't milestone work goes to cheaper helpers: `haiku` for reading and summarizing
   files, logs, diffs or command output, running pre-flight and checks, ticking the checklist and logging
   §7 / §8; `sonnet` for research and for drafting checkpoint instructions. Ask each helper only for the
   answer you need. A helper may read source code to answer a narrow question; you don't.
5. Merge per §2 (`git merge --ff-only`), in dependency order; push `thieves-forum` after each merge and
   each BUILD_PLAN.md update.
6. After each merge, spawn a `test-runner` agent (`model: "haiku"`) on `thieves-forum` with the
   milestone's acceptance commands; only failures come back. On a failure, resume that milestone's
   subagent (SendMessage) with the output, then merge its fix the same way.
7. Stop at user checkpoints (C0–C7) and unresolved Blockers. Tell the user exactly what's needed: the
   preview URL (the `thieves-forum` branch preview, §9), which devices, how many people, what to try, the
   question to answer. Notes become fix subagents (`build/tf<N>-fix-<k>`, owner's model).
8. No date is set: never cut on your own. If the user asks for cuts or names a date, propose the next
   items from the §3 cut order and wait for their yes; log approved cuts under §8 and mark the items
   `~~cut~~` in §6.
9. No extra reviews, audits or re-exploration unless an acceptance check fails.
10. Gated milestones: start TF19 only when its pre-flight row passes; otherwise log a Blocker naming §9
    step 7 and run the rest of the wave.
11. When every non-cut item is checked, run the Full gate (`pnpm check:affected && pnpm e2e:affected`)
    via a test-runner, tick it, and print §9 Final handoff.

## 6. Progress checklist

- [x] Pre-flight green (S1)
- **TF0**
  - [x] SPEC §12 written; §6.17, §10.4, §11 updated
  - [x] Content data: balance (every §7 value), items, shops, layout + tests
  - [x] Contracts: messages, hold, viewer, blob-transfer types, sim types/snapshot/systems/events, match + TvView, sfx + AudioMap
  - [x] Subsystem stubs, LICENSES.json + test, devDeps + lockfile
  - [ ] Full gate green
  - [x] Merged to `thieves-forum` and pushed
  - [x] User approved C0 (§12 + contracts)
- **TF1**
  - [x] Atlas script + manifest + keys
  - [x] Rigs (citizen, merchant, guard) + pose clips + tests
  - [x] `?gallery=1` + stress view + gallery e2e
  - [ ] Merged to `thieves-forum` and pushed
- **TF2**
  - [ ] Sim core, nav, LOS + determinism test
  - [ ] NPC module (five techniques) + churn + tests
  - [ ] Player movement + shared outfits + tests
  - [ ] `crowd` and `bench` scripts (bench numbers logged in §8)
  - [ ] Merged to `thieves-forum` and pushed
- **TF3**
  - [x] Latency simulator + host hold machine + tests
  - [x] Phone estimator + catch grace + hot hands + tests
  - [x] Merged to `thieves-forum` and pushed
- **TF4**
  - [x] Blob transfer (host → phone) + 16 KB envelope test
  - [x] Snapshot encoder + tip viewer + tests
  - [x] Spike mode + tip-off e2e
  - [x] Merged to `thieves-forum` and pushed
- **TF5**
  - [x] Shell, router, dev mode
  - [x] Every §6.17 screen + jsdom tests + dev e2e
  - [x] Merged to `thieves-forum` and pushed
- **TF6**
  - [x] Title, lobby, HUD, hands-up, reveal card, podium, rules host + tests
  - [x] Merged to `thieves-forum` and pushed
- **TF7**
  - [ ] Host loop, input, world scene, HUD, debug hooks, timeScale
  - [ ] Dev overlay, stress mode, phone wiring
  - [ ] Spike e2e + scene disguise test
  - [ ] Merged to `thieves-forum` and pushed
  - [ ] User approved C1 (crowd spike, tip-off spike, phone dev, gallery)
- **TF8**
  - [ ] Stock, placement, restock, stall view state + tests
  - [ ] Merchant attention, glance, suspicion, dialog, fetch/bring forward + tests
  - [ ] Stall theft + merchant catch + tests
  - [ ] Merged to `thieves-forum` and pushed
- **TF9**
  - [ ] Patrol, cones, LOS, spot, alerts + tests
  - [ ] Chase/escape, guard + in-person catches, pot, stocks, immunity + tests
  - [ ] Activations, reinforcements, cap + tests
  - [ ] Merged to `thieves-forum` and pushed
- **TF10**
  - [ ] Match state machine + transition tests
  - [ ] Ledger (by side) + payout tests
  - [ ] Party/leader + open-stall rule + tests
  - [ ] Merged to `thieves-forum` and pushed
- **TF11**
  - [ ] Audio engine (bed, one-shots, ducking, scenes) + fake-context tests
  - [ ] Forum AudioMap + `Sfx` + synth fallbacks
  - [ ] Merged to `thieves-forum` and pushed
- **TF12**
  - [ ] Handler registry, private routing, stall view, hold events
  - [ ] Scene: merchants, guard cone, bubbles, catches, stocks; HUD; hands up; plain reveal
  - [ ] Slice e2e + disguise-events test
  - [ ] Merged to `thieves-forum` and pushed
  - [ ] User approved C2 (slice, 3 players, iOS + Android)
- **TF13**
  - [ ] Rolls, buy, pawnbroker, NPC selling, NPC buying + tests
  - [ ] Coin toss handler + scene + tests
  - [ ] Economy e2e
  - [ ] Merged to `thieves-forum` and pushed
- **TF14**
  - [ ] Pickpocket + NPC glance/shout + tests
  - [ ] Tip-offs (snapshot, judge, locked-in catch, payout) + tests
  - [ ] Tip-off e2e
  - [ ] Merged to `thieves-forum` and pushed
- **TF15**
  - [ ] Seven cards + illustrations + DRAFT copy + tests + e2e
  - [ ] Merged to `thieves-forum` and pushed
  - [ ] User approved C3 (How to play copy)
- **TF16**
  - [ ] Walk-on joins, takeover, leave, waiting joins + tests
  - [ ] Round transition + 3 rounds + podium + Play again
  - [ ] Match e2e
  - [ ] Merged to `thieves-forum` and pushed
- **TF17**
  - [ ] Bots + `economy` script + determinism test
  - [ ] `docs/economy-report.md`
  - [ ] Merged to `thieves-forum` and pushed
  - [ ] User approved C4 (report + §7 values)
- **TF18**
  - [ ] HUD, hands-up, reveal and podium sequences, title + fixtures + e2e
  - [ ] Merged to `thieves-forum` and pushed
  - [ ] User approved C5 (full 3-round match, 4+ players)
- **TF19**
  - [ ] Delivered files mapped, gains, crossfade, licenses covered + e2e
  - [ ] Merged to `thieves-forum` and pushed
  - [ ] User approved C6 (audio mix on TV speakers)
- **TF20**
  - [ ] Effects polish + gallery e2e + bench
  - [ ] Merged to `thieves-forum` and pushed
  - [ ] User approved C7 (art gallery on a TV)
- **TF21**
  - [ ] Soak script + disguise audit + 8-phone full-match e2e
  - [ ] Merged to `thieves-forum` and pushed
- [ ] Full gate green (`pnpm check:affected && pnpm e2e:affected`)
- [ ] Final handoff printed

## 7. Blockers

_None._

Format: `- [TF#] YYYY-MM-DD: what's blocked, what was tried, what's needed from whom.`

## 8. Build decisions

Format: `- [TF#] decision: one line, with the reason.`

- [plan] No target date; cuts only on the user's request, from the §3 cut order. User's answer (2026-11-25).
- [plan] Shared code is copied, not extracted (user decision): Fort Frenzy's atlas script, rig renderer, clip kit and sim helpers (spatial hash, kinematic bodies, separation) into `scripts/` and `src/host/{render,sim}/`; Say Cheese's blob transfer into `src/shared/blob-transfer/`, generalized to a `blobId` and host → phone. Extraction candidates (no game imports, source named in each header): `src/shared/blob-transfer/` + `src/shared/viewer/` (→ `net-client`, SPEC §4), the rig renderer + atlas script (→ a render kit with Fort Frenzy migrated), `src/shared/audio/` (→ `game-kit`, SPEC §6.20). Each becomes a post-v1 PR that migrates both games, so no milestone needs the Full gate except TF0 and S8.
- [plan] Audio: TF11 builds the engine against synthesized placeholders; TF19 is gated on the user committing licensed, game-ready `.mp3` files under `apps/thieves-forum/audio/forum/` with entries in `apps/thieves-forum/assets/LICENSES.json` (§9 step 7). The sandbox can't reach Sonniss, Kenney or Freesound. User approved.
- [plan] Art: rigs are built from the delivered cut-out SVGs and every missing pose (walk, browse/reach, pickpocket, throw, stocks, merchant glance/fetch/carry, guard patrol/jog/catch/march) is a code clip on those rigs, Fort Frenzy style; dev shapes cover anything unseparable. No new drawings are required; any art the user adds later slots into TF20. User approved.
- [plan] Open-stall rule (SPEC §10.4): once per match from the seed: pawnbroker + jewelry + one of bakery/pottery, then the rest drawn at random from the remaining shops until players + 2 (clamped 5–10); fixed for the whole match, so mid-match joins never reopen stalls. User approved.
- [plan] GRAB targets an item, so the phone sends a discrete `grab {stall, slot}` that arms the hold and the input-state `hold` bit times it (release = bit cleared). PICKPOCKET uses the same bit with the host picking the target. Keeps SPEC §3 "measured on the host from the button bit".
- [plan] Pawnbroker sheet shows today's offer per item at the §6.4 rate of the moment (SPEC §6.17 said "half-value prices", which predates the 45–70% rule). TF0 fixes §6.17.
- [plan] A grab removes the item from the counter on the TV (SPEC §6.7 "simply disappears"); NPC purchases do the same, so it identifies a stall, not a player. The disguise tests allow `stallChanged` and nothing else.
- [plan] The stocks hold several thieves at once (standing slots in `layout.ts`), because two catches within 20 s are likely with 8 players.
- [plan] The tip-off overlay excludes the tipper's own character; a tip snapshot expires after a balance TTL (start 20 s) so a forgotten sheet can't land a late tip.
- [plan] In-person catches use mid-steal + 300 ms grace; only tip-offs use the 5 s hot-hands window (SPEC §6.13 as written).
- [plan] A disconnected player's character under NPC takeover can still be pickpocketed and caught as normal; the hands-up reveal includes disconnected players.
- [plan] SimEvents are tagged `tv` or `phone` in the frozen union, and the scene only consumes `tv` events; that tag is what the disguise tests check.
- [plan] Timers: phone screens carry `endsInMs` and the phone sets its deadline on receipt (Say Cheese decision), no clock handshake.
- [plan] e2e speed: `?timeScale=` on the host (debug only) scales round and hold timers; holds in e2e are driven through `__pcg` hooks where the real-time phone press would be flaky.
- [plan] TF1 runs on opus (not sonnet, the default for rendering) because building rigs and attach points from SVG groups is the hardest judgment in the art pipeline (Fort Frenzy FF3 precedent).
- [plan] Changesets: features `--minor`, fixes `--patch`, all on `@pcg/thieves-forum` (0.x before launch). The launch to 1.0.0 is a major note added in §9 step 11, with the user's approval (PLATFORM §5).
- [plan] AGENTS.md "commit only when asked, never push unless asked" is satisfied by this plan: the user asked for pushes of `thieves-forum` after every merge; milestone branches are never pushed and nothing is pushed to `main`.
- [plan] Sandbox Playwright: the preinstalled Chromium 1243 is linked to the version `@playwright/test` 1.64.1 expects if the dry run asks for another (pre-flight); never install another.
- [TF0] decision: world units are tiles (48 px wide, 28.8 px deep at ground factor 0.6), the market is 40 × 37.5 tiles, and `layout.ts` positions are the reference SVG ×3 → tiles, because Fort Frenzy's projection carries over unchanged; TF1/TF7 nudge positions to the rendered art.
- [TF0] decision: `Outfit` = tunic and mantle fabric token names + hair and skin tone **indices**, because the brand kit has no hair or skin palette (SPEC §6.11 lists them but §6.0 only gives fabrics); TF1 owns the tone table (flag for C0).
- [TF0] decision: `join.proto` is optional and absent reads as `PROTOCOL_VERSION`, because the scaffold join screen (`src/controller/app.ts`, not TF0's to edit) doesn't send it yet; TF5 sends it.
- [TF0] decision: the host sends a private `context` event (main button label, toss cooldown, Tip/Catch live), because only the host knows when a phone is at a stall, beside a buyer or behind someone (SPEC §6.17 context button).
- [TF0] decision: `handsUp` is a screen only (it carries the Bag, Items and Total tiles), with no separate private event, because a second message would duplicate it.
- [TF0] decision: lobby color is a phone request `color {color}` validated by the host, because SPEC §6.18 has phones pick a player color and the plan's message list had no way to send it.
- [TF0] decision: `browse` is the main-button tap for both BROWSE and SELL (the host resolves which from its context), and `grab` uses one `slot` number unique across a stall's counter and shelf, because the phone only echoes what the stall view gave it.
- [TF0] decision: Catch! rides the `catch` input bit, held by the phone ≥ `CATCH_MIN_MS` (120 ms) so a tap spans a 30 Hz sample; the sim acts on the rising edge, because the plan fixed bits (not counters) for input.
- [TF0] decision: the hold bit reads released after `balance.net.holdStaleMs` (500 ms) of silence while the stick zeroes after 250 ms, because a brief stall shouldn't cancel a long grab but a vanished phone must.
- [TF0] decision: stalls have 4 counter + 4 shelf slots (the stall art's item spots) and the stocks 3 standing slots; common items restock after 8 s (build value), because §6.5 says only "always restocks".
- [TF0] decision: subsystem stubs that must return a value either return a neutral value (null, false, []) or throw "not implemented (TF#)"; `economy.roll` is the one-line §6.4 formula, because callers in the same wave test through fakes anyway.
- [TF0] decision: created `src/controller/tipoff/spike.ts` (not in the TF0 Owns list) as the stub the controller mode routing dispatches to, because the deliverable names it; TF4 owns it from here.
- [TF0] decision: `.changeset/*.md` added for the minor note (repo root, required by the brief).
- [TF0] decision: Full gate run in the sandbox: `pnpm check:affected` passed; `pnpm e2e:affected` passed every chromium test (thieves-forum, gallery, and all other apps' chromium projects) but 17 Firefox/WebKit `compat` tests in sunny-side, fort-frenzy and say-cheese fail to launch (`/opt/pw-browsers` has no firefox or webkit, and installs are not allowed), so the "Full gate green" tick waits for CI or a machine with those browsers; TF0 touched none of those apps.
- [TF6] contract+: `src/host/ui/types.ts` gains `TvControl` ('start' | 'rules' | 'playAgain' | 'next' | 'skip', what keyboard, gamepad and the leader phone ask of the match) and `TvAnchors` (reveal card positions in 1920 x 1080 px, keyed by `RevealEntry.character`); SPEC §12.11 row updated.
- [TF6] decision: the DOM UI lives in a 1920 x 1080 frame scaled to fit the window (`createTvUi`), because the scene's reveal anchors are then plain canvas pixels and the brand's fixed px type sizes stay correct.
- [TF6] decision: no separate title phase; `?ui=title` is the `lobby` view with no players (title, room code card and QR are the lobby screen's left and middle columns), because `TvView` has no title phase and the contract is frozen.
- [TF6] decision: `src/host/lobby.ts` stays as a two-line re-export of `ui/lobby.ts` (the moved scaffold, now a thin adapter over `createTvUi`), because `host/main.ts` is not TF6's file; TF7 / TF12 rewire main.ts to `createTvUi` with real `TvView`s and delete the shim.
- [TF6] decision: the HUD ring's full length is the first `timeLeftMs` seen in a round, and the reveal's "ROUND n / 3" uses `balance.match.rounds`, because `TvView` carries no round length and `reveal` carries no round count.
- [TF6] decision: How to play cards come from `createTvUi`'s `rulesCards` option; `src/host/ui/rules/placeholder.ts` is a DEV-ONLY seven-card fallback (coin mark art, outline text) until TF15's `src/content/rules.ts` exists, because the cards are TF15's.
- [TF6] decision: the podium reveals by `step` 0 (4th+ row only), 1 (3rd), 2 (2nd), 3 (1st + banner), and an empty place after a tie (e.g. nobody 2nd) shows a blank block, because SPEC §6.15 gives the order but not the step numbering.
- [TF6] decision: host keys are Enter / Space / → / gamepad A or Start (Start in lobby when `canStart`, Play again on the podium), H / ? / gamepad Y (How to play from the lobby); the kit shell keeps Enter / → / Space = Next and Esc = Skip, because SPEC §6.16 asks for keyboard and gamepad without hover.
- [TF6] decision: jsdom UI tests use a `// @vitest-environment jsdom` docblock under `src/host/ui/__tests__/`, because `vitest.config.ts` (not TF6's file) only runs `src/controller/**` in jsdom.
- [TF4] decision: blob transfer keeps one blob in flight per phone: the host sender replaces an unacked blob when it adds a newer one for the same phone, and the phone receiver treats the first chunk of a new `blobId` as making any unfinished older one stale (later chunks of it read `stale`), because the tip-off only ever needs the latest snapshot and this needs no ordering of ids.
- [TF4] decision: the spike's blob ids start at `Date.now()` and count up, because a TV reload must never reuse an id a phone already marked done; TF14 can use any never-reused counter.
- [TF4] decision: the encoder's retry rule (0.45 above 90 KB) and the 960 long edge are defaults in `src/shared/viewer/encode.ts` (game-free), and the host passes `balance.tip.jpegQuality`, because `src/content/` is not TF4's to edit; TF14 may name them in `balance.tip`.
- [TF4] decision: a tap picks the hit area under it or the nearest within 32 snapshot px (`TAP_SLOP_PX`, about a character width), ties by nearest center; a tap on empty market keeps the current pick, because a near miss shouldn't undo a choice.
- [TF4] decision: the spike draws a 2D-canvas test scene (paving, ten stall blocks, 30 wandering 54 × 108 boxes), so `canvas.toBlob` reads it directly; the Phaser WebGL path (blank `toBlob` without `preserveDrawingBuffer`) is untested until TF7/TF14, which pass `renderer.snapshot`'s image to `encodeSnapshot` (it takes any canvas or image).
- [TF4] decision: the tip viewer and spike CSS sit beside their modules (`src/controller/tipoff/*.css`, `src/host/spike/spike.css`), because `src/styles/` is outside TF4's Owns.
- [TF4] decision: measured on the local relay (e2e): three 960 × 540 snapshots of 33.8–34.0 KB at q0.6, 4 chunks each, 28–93 ms from tap to last chunk, no socket close. The deployed relay is unreachable from the sandbox (egress proxy 403 on relay.fostercurtis.dev), so the deployed-relay numbers are read at C1 from the spike page (phone shows KB, chunks, ms; TV logs encode ms and acks; `?edge=800` for the slow-relay fallback).
- [TF4] decision: extraction candidates (no game imports, source named in headers): `src/shared/blob-transfer/{index,base64}.ts` (from Say Cheese, generalized to `blobId` and host → phone) and `src/shared/viewer/{hits,encode}.ts` join the `viewer/` candidate for `@pcg/net-client`.
- [TF5] decision: the host sends one resolved `context.main`, so the phone's BROWSE > SELL > PICKPOCKET rule is the exported `resolveMain` (state.ts), tested and available to the host wiring, because the frozen `context` message carries a single action.
- [TF5] decision: hair and skin tones are a phone-local 6-entry table in `src/controller/outfit.ts` (indices wrap), because TF1 owns the renderer's tone table and it isn't shared yet; wire both to one table when TF7 lands (flag for C1).
- [TF5] decision: the outfit card inlines `citizen/front.svg?raw` (not `?url`), because CSS variables only tint an inline SVG; item icons and the merchant face are `?no-inline` URLs so play.html JS stays at 28.6 KB gzip.
- [TF5] decision: the HoldEstimator and tip viewer are injected through `createApp({ estimator, tipViewer })`; defaults are `fakeHold.ts` (a local stand-in with the TF0 contract) and `devTipViewer`. TF4's `createTipViewer` brings its own fee/SEND/Cancel and `onSend`, while TF5's `TipViewerFactory` (`tipViewer.ts`) is a selection-only viewer (`onSelect`, optional `feed(chunk)`) inside the TF5 tip sheet; TF14 adapts one to the other when it wires the viewer.
- [TF5] decision: the phone toasts "Tip missed −N" and "Tip-off expired" from `tipResult` itself; the host sends only gain toasts (grab, pickpocket, tip payout, Lucky!) and loss toasts that have no other message, because `tipResult` already carries the fee.
- [TF5] decision: a hold bar shows only while the phone presses or the host's hold runs, reads at most 99% until `holdEnd complete` (then 100% for 500 ms), and stays hidden after the host ends a hold under a still-held thumb, because SPEC §3 makes the host the judge.
- [TF5] decision: Sell and Pawnbroker sheets get a local Close (no wire message; the host's next sheet reopens them), and the in-person CAUGHT! banner shows over the controller for 3.5 s, because the frozen protocol has no close-sheet message and the spec bans full-screen flashes.
- [TF3] contract+: `World.holdMachine?: HoldMachineState` (arms + hold-id counter, `sim/types.ts`) and the TF3 hold machine API in `sim/holds/types.ts` (`armGrab`, `armPickpocket`, `caught`, `isHot`, `ARM_WAIT_MS`, `HoldArm`, `HoldMachineState`); SPEC §12.3 updated.
- [TF3] decision: the holds step reads no commands; TF8 calls `armGrab` with the tile's `grabMs` on a `grab` command and TF14 calls `armPickpocket` when the bit rises behind someone, because each owns the validation (stall view, behind-someone test) and the hold machine only times.
- [TF3] decision: hold ids come from their own counter, not `World.nextId`, because consuming entity ids on steals would put steal-correlated gaps in character ids.
- [TF3] decision: `ARM_WAIT_MS` (500 ms) is a constant beside the machine, not a balance value, because `src/content/` is outside TF3's Owns and it is a protocol timeout, not tuning.
- [TF3] decision: "move or turn" cancels on any non-zero stick in the step's input (facing follows the stick; separation pushes don't cancel); a grab has no geometric reach check beyond that, because walking away needs the stick.
- [TF3] decision: a hold completes iff the host-observed bit is still set at `endTick`, with an input arriving exactly on a step boundary seen the next step, so the latency tests prove "complete iff the release reaches the host at or after start + grab time", to the ms.
- [TF3] decision: grace and hot hands are inclusive (`midStealAt` in ms: true at 300 ms, false at 301 ms; `isHot` through `hotUntil`), because §6.13 says "300 ms grace" and "hot for 5 s".
- [TF3] decision: the phone estimator caps at 95% until `complete`, freezes on release while a host hold is live (holdEnd decides), goes idle at once on release with no host hold, ignores events for older hold ids, and takes an optional `durationMs` on `press` (the tile's `grabMs`), because the frozen `press(now)` has no duration.
- [TF3] decision: the latency link is in order (WebSocket/TCP) and drops only repeated 30 Hz samples, never bit changes or discrete events, because TCP never loses or reorders but a phone can skip a sample.
- [TF1] decision: copied Fort Frenzy's atlas script (`scripts/build-atlases.ts`) and rig renderer (`src/host/render/{rig,rigMath,clip,atlas,camera}.ts`, clip kit) with source headers; extraction candidate (→ a render kit with Fort Frenzy migrated), because the user chose copy over extraction ([plan] above).
- [TF1] decision: rig parts are `id` groups inside one SVG per view/pose (`src: {id, pick?}` in the rig JSON), not one file per part as in Fort Frenzy, because the delivery is drawn that way; `pick` takes children of a group (the one-piece `legs` → `leg-l`/`leg-r`), never redraws them.
- [TF1] decision: tinting splits every frame into back-to-front runs of shapes that share a `var(--slot)` (tunic, mantle, hair, skin, wrap, canopy, player); tint runs are rasterized white and multiplied at draw time, so one atlas serves every outfit and canopy, because a whole-part multiply would tint the belt, shoes and eyes too.
- [TF1] decision: characters draw at 1.8 px per rig unit (60-unit viewBox → 108 px), not the 2× SPEC §12.2 quotes, because 108 px is the stated height and the layout reference draws them 24 × 36 at ×3; stalls, gate and stocks at 3 px per unit (the reference ×3), and the floor tile at 0.6 (80 units per 48 px tile, as Fort Frenzy).
- [TF1] decision: hair and skin tone tables live in `src/host/render/tones.ts` as the same 6-entry tables, in the same order, as the phone's `src/controller/outfit.ts` (TF5), so a tone index shows one color on both screens; the brand kit has no hair or skin palette (TF0 decision). Two copies stay until TF7 wires both to one table (flag for C1).
- [TF1] decision: part names are viewer-relative (`-l`/`-r`); in side views `-l` is the far limb. The citizen and merchant side views draw no far arm, so `arm-l` there reuses the near arm's drawing behind the tunic (composed from parts); the guard's far arm is hidden behind the scutum. Parts a view doesn't show are listed with `src: null` (merchant hair in front, beard in back, guard `helmet-top` in side/back).
- [TF1] decision: views missing from the delivery are composed by per-view clips (`<clip>@<view>`): citizen hands-up side/back, run front/back, merchant point-back, and every gait/browse/throw/stocks in each view; no art was redrawn. User list (could be drawn later, TF20): hands-up side/back, run front/back, merchant point-back, a 3/4 head for the merchant glance (now a head squeeze and shift).
- [TF1] decision: the merchant glance is three clips (`glanceWindup`, `glanceLook`, `glanceBack`); `glanceBack` is a clip name only (not a `PoseId`), because §6.21 asks for three stages and `PoseId` has two.
- [TF1] decision: composed `*reference*` SVGs are not frames and are skipped by the atlas check (as Fort Frenzy's `review/`); every other SVG must be named by a rig or `sprites.json`.
- [TF1] decision: the gallery has one page per section (`&page=citizen|merchant|guard|stalls|items|effects|stress`, nav links on top) and reports `window.__pcgGallery` (ready, fallbacks, missing, stress fps); the stress page at 1920 × 1080 in headless Chromium read 61 fps with 46 rigs and 652 images (indicative; TF7 measures the real scene).
- [TF1] contract+: froze `src/host/render/types.ts` (rig JSON, `Clip`, `sprites.json`, `AssetManifest`/`FrameMeta` with raster `layers`, `Camera`, `RigInstance`, `StallInstance`, `EffectSpawner`) and the `generated/manifest.ts` shape; SPEC §12.2 and §12.11 updated.

## 9. Final handoff (and early setup)

Ordered steps only the user can do.

**Before C1 (do these as soon as TF0 is pushed; S3 stops at C1 needing them):**

1. **Vercel project** `thieves-forum`, imported from `foster-curtis/phone-controller-games`, set up like
   the Say Cheese / Fort Frenzy projects: Root Directory `apps/thieves-forum`, "Include files outside
   the root directory in the Build Step" on, Framework Vite, build command `pnpm build` (from TF1 it runs
   `pnpm assets` first, like Fort Frenzy), output `dist`, Node 22+. `apps/thieves-forum/vercel.json`
   supplies `cleanUrls` and `"ignoreCommand": "node ../../scripts/vercel-ignore.mjs thieves-forum"`.
2. **Environment variable** `VITE_RELAY_URL` = `wss://relay.fostercurtis.dev` for **Production and
   Preview** (same name and value as the other games).
3. **Preview deploys for the `thieves-forum` branch:** Production Branch stays `main`; preview
   deployments on for all branches (default). Recommended: Domains → add
   `tf-preview.fostercurtis.dev` assigned to Git branch `thieves-forum`, so every checkpoint has one URL.
4. **Deployment Protection:** turn off Vercel Authentication for Preview deployments (or add a bypass),
   otherwise phones hit a login wall.
5. **DNS:** `thieves-forum.fostercurtis.dev` → the Vercel project (Domains → add; CNAME
   `cname.vercel-dns.com` at your DNS host), production branch `main`. Send the preview URL with the C1
   go-ahead.

**Relay:** no change. The Dockerfile already copies `apps/thieves-forum/package.json`; game ID
`thieves-forum` is a new namespace; tip-off chunks stay under the 16 KiB frame limit. No redeploy.

**Deliveries:**

6. Art: nothing required. Optional at any time before TF20: drawn frames you want instead of code
   clips, as SVGs in `apps/thieves-forum/art/forum/characters/<rig>/<pose>-<view>.svg` (same viewBox and
   tint variables as the delivery), plus a line in `art/forum/README.md`.
7. **Audio, before S7 (gates TF19):** licensed, game-ready `.mp3` files (44.1 kHz, ~128–192 kbps, trimmed,
   normalized; ambience low-passed so no word is intelligible), committed to `thieves-forum`:
   - `audio/forum/bed/crowd-loop.mp3` (crowd walla, 60–120 s, loopable; a 2 s overlap tail is fine);
   - `audio/forum/ambience/` one-shots: `vendor-call-1..3`, `pottery-clink-1..2`, `coins-counted-1..2`,
     `cart-wheel`, `donkey`, `dog-distant`, `fountain` (`.mp3`, 0.5–4 s);
   - `audio/forum/sfx/`: `coin-clink`, `glance-swoosh`, `thief-shout`, `guard-whistle`, `gate-creak`,
     `stocks-clank`, `round-bell`, `reveal-pop`, `fanfare`, `firework` (`.mp3`);
   - one entry per file or pack in `apps/thieves-forum/assets/LICENSES.json` (path or glob, source URL,
     author, license, commercial use true), as Fort Frenzy's.
   Commit edited, game-ready exports rather than raw library files: Sonniss forbids redistributing raw
   files, and the repo is public if it is (check), while the shipped game serves these files anyway.

**At the end (after S8 prints this list):**

8. In a fresh session or locally: `git fetch origin && git checkout thieves-forum && git merge origin/main`,
   then `pnpm install --frozen-lockfile && pnpm check:affected && pnpm e2e:affected`. Both must pass.
9. Decide the launch status: tell the orchestrator (or edit yourself) `status` in
   `apps/thieves-forum/game.meta.ts` (`hidden` → `beta` or `live`), and approve the final catalog copy
   and tagline (SPEC §10.1) and the name check (SPEC §10.2).
10. Open a PR `thieves-forum` → `main`; CI must pass `check` and `e2e-result`.
11. Add the launch changeset on the PR (`pnpm changeset --major @pcg/thieves-forum -m "Thieves' Forum v1"`,
    1.0.0 per PLATFORM §5), merge the PR, then merge the "Version Packages" PR to deploy. The gallery
    redeploys if the status is no longer `hidden`.
12. **Real-device smoke test on `thieves-forum.fostercurtis.dev`:** TV host fullscreen, Sound on; join by
    QR on an iPhone (Safari) and an Android (Chrome); a mid-round walk-on join; lock a phone mid-hold for
    10 s and reopen (hold cancelled, character kept moving, reconnects to its seat); a tip-off on a phone;
    a full match with 4+ players to the podium and Play again; Give feedback opens the form.
13. Check the other games still load and join (shared kits untouched, but `main` moved).

Milestones that add env vars or deliveries update this list.

## 10. Kickoff prompt

```text
You are the orchestrator for building Thieves' Forum (apps/thieves-forum) in the phone-controller-games
monorepo. You run in an ephemeral cloud sandbox: anything not pushed is lost.

1. `git fetch origin thieves-forum main && git checkout thieves-forum && git pull --ff-only origin thieves-forum`.
2. Read ONLY apps/thieves-forum/BUILD_PLAN.md (never source code). Follow its §5 Orchestrator rules exactly.
3. Run the §1 pre-flight via a `haiku` helper (it merges origin/main if needed and stops on a conflict);
   stop and tell me if anything blocks the next milestone.
4. From §6 Progress, §7 Blockers and `git log --oneline -15`, work out where the build stands and which
   §0 session this is.
5. Run the next unchecked milestone(s) per §0/§3 with the §4 brief and the model from the §3 table:
   parallel milestones in one turn with isolation "worktree" (S2: TF1 ∥ TF2 ∥ TF3 ∥ TF4 ∥ TF5 ∥ TF6;
   S3: TF7 ∥ TF8 ∥ TF9 ∥ TF10 ∥ TF11; S5: TF13 ∥ TF14 ∥ TF15; S6: TF16 ∥ TF17 ∥ TF18;
   S7: TF19 ∥ TF20 ∥ TF21), serial ones (TF0, TF12, fixes that share files) in the main checkout.
   TF19 only if its pre-flight row passes. Hand everything else to `haiku` / `sonnet` helpers per rule 4.
6. Merge each milestone per §2 with `git merge --ff-only`, push `thieves-forum`, then verify with a
   `test-runner` agent (model haiku) running that milestone's acceptance commands.
7. Stop at user checkpoints (C0–C7) and unresolved blockers, and tell me exactly what's needed: preview
   URL, which devices, how many people, what to try, what to answer.
8. Never cut scope unless I ask (rule 8).
9. If every item is checked, run the Full gate and print §9 Final handoff.

{Optional: "Checkpoint approved: C1. Preview URL: https://…" / "C2 notes: …" / "Audio delivered" / "Cut approved: …"}
```
