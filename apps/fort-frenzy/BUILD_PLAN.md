# BUILD_PLAN: Fort Frenzy

Orchestration plan for building `apps/fort-frenzy/SPEC.md` (game design §1–§14, technical design §15).
The orchestrator reads **only this file**. Subagents read their milestone entry, §2, §8 and the spec
sections and files the entry names. Commands are POSIX sh (Git Bash on Windows), run from the repo root.
`SPEC §` = `apps/fort-frenzy/SPEC.md`; `PLATFORM §` = `PLATFORM.md`; `relay SPEC §` = `apps/relay/SPEC.md`.

**Inputs already in the repo (read-only for every milestone; wire them in, never redraw or restyle):**

| Spec | Files |
| --- | --- |
| Brand §2.3 | `apps/fort-frenzy/src/styles/brand.css`, `brand/head.html`, `brand/mark*.svg`, `public/*` (favicon, PWA icons, `site.webmanifest`) |
| Art layout, rig contract §15.2, §15.10 | `art/neon-knights/README.md`, `art/neon-knights/rigs/*.json` (14 rigs), `art/neon-knights/sprites.json` (211 frames: 132 world, 63 ground, 16 effects) |
| Characters §2.4 | `art/neon-knights/characters/{warden,ranger,commander,artificer,footman}/{side,front,back}/` (Ranger adds `stand`/`ready` pose folders) |
| Enemies §9.6 | `art/neon-knights/enemies/{drone,skitter,brute,bombard,wasp,mite,stalker,colossus}/side/` |
| Structures §7.2, Citadel §3.6 | `art/neon-knights/structures/` (plate, pulse-turret base/ii/iii × 8 aims + bands + pedestals + dmg, mortar rig parts, wall m0–m15 + rail/charged/dmg, shock-net m0–m15, fortify, armory, rally-flag, build-ghost, power-cell, citadel parts + damage overlays + rubble, sentry 4 loadouts × 5 aims) |
| Effects, status §6.1, §15.2 | `art/neon-knights/effects/` (projectiles, muzzles, sparks, heal glint, nanite mote, shock crawl, wall strike, deploy beacon, scrap ours/theirs 1–5, burn, corrosion, stun 1–4, defense-bonus, carry pips) |
| Map §3.1, §15.2 | `art/neon-knights/map/{ground/1-4,edge/*,lane/{bottom,left,right}-{open,sealed},decor/*}` |
| UI icons §2.6 | `art/neon-knights/icons/*.svg` (64 icons + `badge-tile.svg`, `badge-tile-active.svg`), `icons/README.md` |
| UI mockups (look only, never built) | `art/neon-knights/review/ui-reference/{phone,tv}/*.png`, `review/ui-pieces/*.svg`, other `review/*.svg` sheets |
| Audio §12, §14 #4 | `apps/fort-frenzy/audio/kenney/<pack>/` (Foster's Kenney CC0 drop, arrives before FF13) |

Code-drawn by design (no art file, not a gap): player rings and notch, ground shadows, red danger
markers, AoE/range ellipses, aim lines, the build arc frame, Field Medic circle, morale aura, super
pulse ring, shockwave rings, mortar burst ring, sentry sight line, Stalker target thread, lane-warning
band, respawn light column, the see-through ghost structure, discharge pips/dimming, hit flash.

## 0. Sessions

The user runs `/clear` between sessions and pastes the §10 kickoff prompt to start each one.

| Session | Runs | Ends at |
| --- | --- | --- |
| S1 | Pre-flight → **FF0** (main checkout) → **FF1** (main checkout) → **FF2 ∥ FF3 ∥ FF4 ∥ FF5** (worktrees) | **C1**: art gallery + TV perf stress on the TV, controller dev mode on phones, TV UI screens |
| S2 | C1 fix milestones (worktrees, by owner dir) **∥ FF6** (sim core; disjoint from C1 fixes) → **FF7** (main checkout) | **C2**: vertical slice on real iOS + Android phones and a TV |
| S3 | C2 fixes → **FF8 ∥ FF9 ∥ FF10** (worktrees) | **C3**: class kits and enemy types play-tested |
| S4 | C3 fixes → **FF11 ∥ FF12 ∥ FF13** (worktrees) | none (context break) |
| S5 | **FF14 ∥ FF15** (worktrees) | **C4**: full 15-wave run for pacing and balance |
| S6 | C4 fixes → final test-runner on `main` (Workspace checks) → print §9 | Final handoff printed |

## 1. Pre-flight checklist

| Item | Check command | Blocks |
| --- | --- | --- |
| On `main`, clean tree | `test "$(git branch --show-current)" = main && test -z "$(git status --porcelain)"` | all |
| This plan is on `main` | `test -f apps/fort-frenzy/BUILD_PLAN.md && git log -1 --format=%H main -- apps/fort-frenzy/BUILD_PLAN.md` prints a hash | all |
| No unmerged `build/*` branches from another plan touching shared code | `for b in $(git branch --format='%(refname:short)' --list 'build/*' --no-merged main); do case $b in build/ff*) ;; *) git diff --name-only main...$b -- packages apps/relay apps/sunny-side \| head -1 \| grep -q . && echo "$b"; esac; done` prints nothing | FF0, FF1 |
| Node ≥ 22 | `node -e "process.exit(+process.versions.node.split('.')[0]>=22?0:1)"` | all |
| pnpm 10.x | `pnpm --version` prints `10.` | all |
| Install + existing gate green (Sunny Side, relay, net-client) | `pnpm install --frozen-lockfile && pnpm check` | FF0 (run once per session) |
| Existing e2e green | `pnpm e2e` | FF0 |
| Playwright Chromium installed | `pnpm --filter @pcg/sunny-side exec playwright install chromium` (after FF1 also `pnpm --filter @pcg/fort-frenzy exec playwright install chromium`) | FF0, FF4, FF5, FF7, FF14 |
| npm registry reachable | `npm view phaser@4.2.1 version` prints `4.2.1` and `npm view @resvg/resvg-js version` prints a version | FF0, FF1 |
| Google Fonts reachable | `curl -sfI "https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@700" >/dev/null` | screenshots in FF4, FF5; C1–C4 |
| Docker daemon (relay image check) | `docker info >/dev/null 2>&1` | FF0, FF1 (Workspace checks), final run |
| ffmpeg (SFX conversion) | `ffmpeg -version >/dev/null 2>&1` | FF13 |
| Art inventory present | `cd apps/fort-frenzy && ls art/neon-knights/README.md art/neon-knights/sprites.json art/neon-knights/icons/README.md src/styles/brand.css brand/head.html public/site.webmanifest >/dev/null && test $(ls art/neon-knights/rigs/*.json \| wc -l) -eq 14 && test $(ls art/neon-knights/icons/*.svg \| wc -l) -eq 65` | FF1, FF3 |
| Kenney packs present | `ls apps/fort-frenzy/audio/kenney/*/License.txt >/dev/null 2>&1` | FF13 |
| Worktrees ignored by git, Prettier, ESLint | `git check-ignore -q .claude/worktrees/x && grep -q '.claude/worktrees' .prettierignore && grep -q "'.claude/worktrees/\*\*'" eslint.config.js` (Prettier line added by FF0) | parallel waves |
| Ports free (4173 5173 5174 8787 8788 8789) | Windows: `netstat -ano \| grep LISTENING \| grep -E ':(4173\|5173\|5174\|8787\|8788\|8789) '` prints nothing (macOS/Linux: `lsof -iTCP -sTCP:LISTEN \| grep -E ':(4173\|5173\|5174\|8787\|8788\|8789) '`) | e2e, check:routes |
| Unattended permissions | Session is in auto mode, **or** `.claude/settings.local.json` holds the allowlist below | all |
| LAN dev for checkpoints (Windows firewall rule `pcg-dev` for TCP 5173, 8787; PC, TV and phones on one private Wi-Fi) | `netsh advfirewall firewall show rule name=pcg-dev` / user confirms | C1–C4 |
| flyctl, Vercel CLI, DNS access for `fostercurtis.dev` | `fly version && vercel --version` | Final handoff only |

Allowlist (only needed outside auto mode):

```json
{
  "permissions": {
    "allow": [
      "Bash(pnpm *)", "Bash(node *)", "Bash(npm view *)", "Bash(docker build *)", "Bash(docker run *)",
      "Bash(docker rm *)", "Bash(docker info*)", "Bash(ffmpeg *)", "Bash(curl -s*)", "Bash(git status*)",
      "Bash(git log*)", "Bash(git diff*)", "Bash(git add *)", "Bash(git commit *)", "Bash(git switch *)",
      "Bash(git checkout *)", "Bash(git rebase *)", "Bash(git merge --ff-only *)", "Bash(git worktree *)",
      "Bash(git branch*)", "Bash(git check-ignore *)", "Bash(netstat *)", "Bash(lsof *)", "Bash(grep *)",
      "Bash(ls *)", "Bash(test *)", "Edit", "Write"
    ],
    "deny": ["Bash(git push*)"]
  }
}
```

## 2. Branches, merging, verification

- The orchestrator stays on `main`. Nothing is pushed until the Final handoff (the user pushes).
- Each milestone works on `build/ff<N>-<slug>` (slugs in the §3 table). Fixes after checkpoint feedback go on
  `build/ff<N>-fix-<k>`.
- Subagent flow: commit → run Acceptance → tick its own Progress items in this file → `git rebase main` →
  rerun Acceptance if the rebase pulled anything in → report.
- The orchestrator merges with `git merge --ff-only build/ff<N>-<slug>`. If that fails, it resumes the same
  subagent (SendMessage) to rebase and rerun Acceptance.
- Rebase conflict rules:
  - `BUILD_PLAN.md` Blockers / Build decisions / Progress ticks: keep both sides.
  - Registry and list files marked "append-only" in §3 (both sides appended): keep both sides, rerun Acceptance.
  - Additive edits to a frozen contract (both sides appended): keep both sides, rerun Acceptance.
  - `pnpm-lock.yaml`: take `main`'s, run `pnpm install`, commit the regenerated lockfile.
- Parallel milestones run in git worktrees (`isolation: "worktree"`, under `.claude/worktrees/`), which git,
  ESLint and (from FF0) Prettier ignore, so nested checkouts never break checks on `main`.
- **Deferred checks:** a milestone that needs only a small piece of an unmerged sibling reports
  "done, checks pending FF#". The orchestrator merges FF# first, then resumes it to rebase and run its full
  Acceptance before merging it.
- **Check sets** (CI runs only on push, so these run locally):
  - **FF checks** (milestones that touch only `apps/fort-frenzy`):
    `pnpm install --frozen-lockfile && pnpm check:fort-frenzy`
    (`check:fort-frenzy` = typecheck, eslint, prettier --check, test, build, check:bundle, check:routes for
    `apps/fort-frenzy`; defined by FF1; Vitest covers its workspace deps' types through typecheck).
  - **FF e2e:** `pnpm e2e:fort-frenzy` (Playwright, Chromium; own relay on 8788, Vite on 5174).
  - **Workspace checks** (any milestone touching `packages/**`, `apps/relay`, `apps/sunny-side` or root
    config):
    `pnpm install --frozen-lockfile && pnpm check && pnpm e2e && docker build -f apps/relay/Dockerfile -t pcg-relay-check . && docker run --rm -d -p 8789:8080 --name pcg-relay-check pcg-relay-check && sleep 2 && curl -sf http://localhost:8789/healthz && docker rm -f pcg-relay-check`
    (`pnpm check` includes the relay and net-client tests; `pnpm e2e` includes Sunny Side's suite and, from
    FF1, Fort Frenzy's.)
  - **Inputs unchanged (I)** (every milestone; run before rebasing):
    `git diff --quiet main -- apps/fort-frenzy/art apps/fort-frenzy/brand apps/fort-frenzy/public apps/fort-frenzy/src/styles/brand.css apps/fort-frenzy/audio/kenney apps/sunny-side/src/styles/brand.css apps/sunny-side/public apps/sunny-side/brand`
  - **Sim bench** (from FF6): `pnpm --filter @pcg/fort-frenzy bench` prints per-scenario mean and p99 step
    time and exits non-zero over budget.

## 3. Milestones

| # | Milestone (branch slug) | Scope | Model | Parallel with | User checkpoint |
| --- | --- | --- | --- | --- | --- |
| FF0 | Shared kits + Sunny Side migration (`kits`) | shared | opus | none (serial) | no |
| FF1 | Scaffold, contracts, asset manifest, root wiring (`scaffold`) | shared | opus | none (serial) | no |
| FF2 | Generic systems + party (`systems`) | ff | opus | FF3, FF4, FF5 | no |
| FF3 | Art in engine + gallery (`art-engine`) | ff | opus | FF2, FF4, FF5 | **C1** (with FF4, FF5): projection, layering, tint, glow at TV distance; perf stress |
| FF4 | Controller app, all screens (`controller`) | ff | sonnet | FF2, FF3, FF5 | **C1**: phone layout and touch feel in `?dev=1` on iOS + Android |
| FF5 | TV DOM screens + HUD (`tv-ui`) | ff | sonnet | FF2, FF3, FF4 | **C1**: TV screens at TV distance |
| FF6 | Sim core + slice content + replay (`sim`) | ff | opus | C1 fix milestones outside `src/host/{sim,systems,party}`, `src/content` | no |
| FF7 | Host wiring + vertical slice + debug panel (`slice`) | ff | opus | none | **C2**: slice on real phones (iOS + Android) and a TV |
| FF8 | Warden + structures + mortar (`warden`) | ff | opus | FF9, FF10 | **C3** (with FF9, FF10): class kits |
| FF9 | Artificer + Commander + squad (`support`) | ff | opus | FF8, FF10 | **C3** |
| FF10 | Enemy roster + waves 1–15 (`enemies`) | ff | opus | FF8, FF9 | **C3**: every enemy type |
| FF11 | Colossus boss (`boss`) | ff | opus | FF12, FF13 | no (judged at C4) |
| FF12 | Cards, team shop, difficulty (`economy`) | ff | opus | FF11, FF13 | no (judged at C4) |
| FF13 | Sound effects (`audio`) | ff | sonnet | FF11, FF12 | no (judged at C4) |
| FF14 | Run lifecycle, late join, resume (`resume`) | ff | opus | FF15 | **C4** (with FF15): full run, pacing, balance |
| FF15 | Soak, benchmark, perf pass (`perf`) | ff | opus | FF14 | **C4** |

Dependency graph (every edge points backwards): FF0 → FF1 → {FF2, FF3, FF4, FF5} → C1; FF6 ← FF2;
FF7 ← FF3, FF4, FF5, FF6, C1; {FF8, FF9, FF10} ← FF7, C2; {FF11 ← FF10; FF12 ← FF8, FF9, FF10;
FF13 ← FF7} ← C3; {FF14, FF15} ← FF11, FF12, FF13.

**Freeze points** (later milestones may only add, and log `- [FF#] contract+: …` under §8):

| After | Frozen |
| --- | --- |
| FF0 | Public APIs of `@pcg/controller-kit` (`src/index.ts`) and `@pcg/game-kit` (`src/index.ts`, `@pcg/game-kit/vite`) |
| FF1 | `src/shared/messages.ts`, `src/shared/ids.ts`, `src/content/types.ts`, `src/host/sim/types.ts` (World, entities, Phase, PlayerInput, InputSource, Modifier, Hooks, DamageCalc, BossBehavior, SimCommand, SimEvent, RunStart), `src/host/sim/snapshot.ts` types (`RunSnapshot`), `src/themes/types.ts` (ThemeShared, ThemeHost, RigDef, Clip), `src/host/ui/types.ts` (`TvView`), the asset manifest format (`generated/manifest.ts` shape) |
| FF2 | `src/host/systems/*/index.ts` signatures (§15.4–§15.5 sketches) and `src/host/party/index.ts` |
| FF3 | `src/host/render/types.ts` (renderer API: rig instance, layers, camera, effect spawners) |

**Append-only registries** (any milestone may append; conflict rule in §2): `src/content/index.ts`,
`src/host/sim/registry.ts` (modules, AI kinds, structure behaviors), `src/host/sim/events.ts` SimEvent
union members, `src/host/audio/cues.ts`. Render clips need no registry: `src/host/render/clips/<rig>.ts`
files are found with `import.meta.glob`.

### FF0: Shared kits + Sunny Side migration

- **Goal:** create `@pcg/controller-kit` and `@pcg/game-kit` from Sunny Side's code plus the new generic
  pieces Fort Frenzy needs, and move Sunny Side onto them with no behavior change.
- **Read:** SPEC §15.1 (kit contents), §15.3 (RNG), §15.6 (send rate), §15.7 (gestures); `PLATFORM.md` §3,
  §4; `AGENTS.md`; `packages/net-client/package.json`, `tsconfig.json`, `vitest.config.ts` (tooling to copy);
  `apps/sunny-side/src/controller/{app.ts,dom.ts,dev.ts,fullscreen.ts,orientation.ts,wakeLock.ts,storage.ts,input/*}`,
  `apps/sunny-side/src/host/{loop/*,visibility.ts,wakeLock.ts,lan.ts,debug.ts}`,
  `apps/sunny-side/src/shared/relayUrl.ts`, `apps/sunny-side/vite.config.ts`, their tests;
  `apps/relay/Dockerfile`; `.prettierignore`.
- **Depends on:** pre-flight.
- **Order:** (1) packages scaffold + Dockerfile + `.prettierignore` line, Workspace checks green; (2) move
  each Sunny Side module into a kit with its tests, Sunny Side imports from the kit, delete the copy; (3)
  add the new pieces test-first (RNG, aimed and radial gestures, fixed-rate sender mode, hold-to-confirm,
  screen router); (4) freeze both `src/index.ts` headers.
- **Deliverables:**
  - `packages/controller-kit/` (`@pcg/controller-kit`, TS source, no build step, `exports` → `src/index.ts`,
    jsdom tests): platform (Wake Lock, `fullscreenOnTap()`, landscape lock + rotate overlay,
    touch-action/viewport setup, safe-area helpers); app shell wiring those on by default with reconnecting,
    host-away and rotate overlays; screen router reusing DOM within a screen group; widgets (floating
    joystick with radius, dead zone, idle opacity and ease-back params; hold button; nearest-center router
    with hit slop; hold-to-confirm); gesture state machines (aimed button, tap button, radial drag) as pure
    reducers + DOM adapters; schema-driven input sender (tuple layout, counters, modes `onChange` for Sunny
    Side and `fixedRate` = 30 Hz while touched, 5 Hz idle, edges immediately); `?dev=1` fake client and
    screen switcher harness; DOM helpers.
  - `packages/game-kit/` (`@pcg/game-kit`, no Phaser, no DOM in the core entry): fixed-step loop,
    `catchUpSteps`, `lerp`/`lerpAngle`, `rngStream(seed, label)` (sfc32-style, FNV-hashed seed+label) with
    `next/int/pick`, host helpers (visibility pause, host Wake Lock, `relayUrl`, QR helper, `window.__pcg`
    installer); `@pcg/game-kit/vite` with the `/play` rewrite and LAN URL banner plugins.
  - Sunny Side on the kits; its copies deleted; its controller now uses the kit app shell (fullscreen on
    tap per `PLATFORM.md` §3 is the one intended behavior change if Sunny Side lacked it; log it).
  - `apps/relay/Dockerfile`: `COPY packages/controller-kit/package.json packages/controller-kit/` and the
    game-kit line (the frozen install needs every workspace manifest).
  - `.prettierignore`: `.claude/worktrees/`.
  - `README.md` / `AGENTS.md` package tables list the two kits.
- **Acceptance:** Workspace checks + I, and:
  - The moved copies are gone: `for f in controller/wakeLock.ts controller/fullscreen.ts controller/orientation.ts controller/dev.ts controller/input/joystick.ts controller/input/sender.ts host/loop host/visibility.ts host/wakeLock.ts host/lan.ts shared/relayUrl.ts; do test -e apps/sunny-side/src/$f && echo "$f"; done` prints nothing (a file kept under the fallback below is logged in Build decisions and dropped from this list).
  - `grep -rn "apps/" packages/controller-kit/src packages/game-kit/src` prints nothing.
  - `pnpm --filter @pcg/game-kit test` includes: same (seed, label) → same sequence; different labels
    independent; `int` bounds; `catchUpSteps`.
  - `pnpm --filter @pcg/controller-kit test` includes the gesture tables of SPEC §15.7 (pending→tap ≤150 ms
    in dead zone; aiming clamp 70 px; cancel on return; radial open at 0.4 s or drag, 8 px hysteresis,
    commit, cancel, Give repeat every 300 ms, single-slot hold commits) and the fixed-rate sender cadence
    with fake timers.
  - `grep -n "Frozen" packages/controller-kit/src/index.ts packages/game-kit/src/index.ts` finds both headers.
- **Risks / fallbacks:** Sunny Side behavior drift → keep its tests and e2e unchanged (only import paths may
  change); a module too tangled with Sunny Side copy or brand classes → leave it in Sunny Side and log
  "extraction candidate". Kit CSS must take tokens as CSS variables from the host app, never import a
  game's `brand.css`. Overlay copy text is a parameter.
- **Leave out:** anything Fort Frenzy-specific; net-client or relay changes (none are needed, SPEC §15.1);
  Sunny Side gameplay, sim, match and Phaser code.

### FF1: Scaffold, contracts, asset manifest, root wiring

- **Goal:** a building, empty Fort Frenzy app with every frozen contract, the asset manifest and icon/portrait
  pipeline, lint boundaries and root wiring, so the parallel wave builds against fixed surfaces.
- **Read:** SPEC §2.1–§2.3, §2.6 (icon ids), §10.1 (action table incl. row 3 kit), §15 (all of it,
  especially §15.1, §15.2 rig/frame rules, §15.3 types, §15.4 types, §15.6, §15.8, §15.10, §15.11);
  `art/neon-knights/README.md`, `rigs/*.json`, `sprites.json`, `icons/README.md`; `brand/head.html`,
  `src/styles/brand.css`; FF0's kit `src/index.ts` files; `apps/sunny-side/{package.json,vite.config.ts,
  vercel.json,playwright.config.ts,vitest.config.ts,tsconfig.json,index.html,play.html}`,
  `apps/sunny-side/src/shared/theme.test.ts`; root `package.json`, `eslint.config.js`,
  `scripts/check-bundle.mjs`, `scripts/check-routes.mjs`, `apps/relay/Dockerfile`.
- **Depends on:** FF0 merged.
- **Order:** contracts first (types compile, guards tested), then pipeline, then root wiring; freeze headers
  last.
- **Deliverables:**
  - `apps/fort-frenzy/package.json` (`@pcg/fort-frenzy`) with **every dependency the plan needs** at exact
    versions (phaser 4.2.1 as in Sunny Side, `@resvg/resvg-js`, an atlas packer such as `maxrects-packer`,
    `qrcode`, `tsx`, vitest, jsdom, `@playwright/test` and types matching Sunny Side's versions), so later
    milestones never edit it; scripts `dev`, `build`, `preview`, `typecheck`, `test`, `e2e`, `assets`,
    `bench`. pnpm does not run pre-scripts: `dev`, `build`, `typecheck` and `test` call `pnpm assets` first
    explicitly.
  - `index.html` (`data-entry="host"`) and `play.html` (`data-entry="controller"`) with the
    `brand/head.html` snippet; `vite.config.ts` using `@pcg/game-kit/vite`; `vercel.json`
    `{ "cleanUrls": true, "ignoreCommand": … }` (skip unless `apps/fort-frenzy`, `packages/` or the
    lockfile changed, SPEC §15.10); `vitest.config.ts` (controller tests in jsdom, rest node);
    `playwright.config.ts` (relay 8788, Vite 5174, like Sunny Side); `tsconfig.json`.
  - Contracts (headers say "Frozen"): `src/shared/messages.ts` (GAME_ID, PROTOCOL_VERSION 1, InputTuple,
    ControllerMsg, Intent, AckReason, HostMsg, TeamView, MeView incl. `action: … | 'kit'` and `kits`, plus
    runtime guards `isControllerMsg`, `isHostMsg`), `src/shared/ids.ts` (ClassId, EnemyId, StructureId,
    ShopItemId, CardId, EffectId, LaneId, ThemeId, DifficultyId, PlayerColorId, SfxId as const arrays),
    `src/content/types.ts` (§15.4), `src/host/sim/types.ts` (§15.3 + `SimCommand` union for every intent
    and presence change, `SimEvent` union in `events.ts`, `RunStart`), `src/host/sim/snapshot.ts` types
    (§15.8 with `kits`), `src/themes/types.ts` (ThemeShared, ThemeHost, RigDef/RigView/RigPoses, Clip,
    Keyframe), `src/host/ui/types.ts` (`TvView`: TeamView plus boss bar, announcements, lane warnings,
    low-HP alarm, wishlist, ready status, outdated banner, home rows).
  - `src/shared/theme.ts` mirroring `brand.css` + `theme.test.ts` parity test (as in Sunny Side).
  - Asset pipeline stage 1, `scripts/build-atlases.ts` (run by `pnpm assets`, output in gitignored
    `apps/fort-frenzy/generated/`): `generated/manifest.ts` (every frame name with category, view/pose,
    layer, anchor, viewBox, tint, attach; every rig id; every icon id), the phones' inline icon sprite
    (`<symbol>` per icon, `.glyph`/`.glow` kept), and per-class portraits (front view rest pose body +
    tint-mask). Rasterizing and packing come in FF3.
  - `assets/LICENSES.json` (art `owned`; Geist, Chakra Petch, JetBrains Mono OFL; `audio/kenney/**` CC0) and
    `src/shared/__tests__/licenses.test.ts` (every file under `art/`, `audio/` has a commercial-use entry).
  - Empty stub entries: `src/host/main.ts` (blank Phaser-free page that mounts nothing yet), `src/controller/
    main.ts`, append-only registries (§3 list), `src/host/audio/{index.ts,cues.ts}` with a no-op `createSfx()`.
  - Root wiring: the five `fort-frenzy` scripts in root `package.json` (copy Sunny Side's, swap names);
    `eslint.config.js` rules from SPEC §15.1 (`src/host/{sim,systems,party}/**` no phaser/net-client/themes/
    DOM globals; `src/host/{sim,systems}/**` no `Math.random`, `Date.now`, `performance.now`, `new Date()`;
    `src/host/{systems,party}/**` no imports from `src/content`, `src/host/sim` or other app folders);
    `scripts/check-bundle.mjs` per-app gzipped JS limit for `play.html` (Fort Frenzy 100 KB; Sunny Side's
    limit = its current size + 20%, logged); `apps/relay/Dockerfile` `COPY apps/fort-frenzy/package.json
    apps/fort-frenzy/`; Fort Frenzy rows in `PLATFORM.md` §1, `README.md`, `AGENTS.md`.
- **Acceptance:** Workspace checks + I, and:
  - `pnpm check:fort-frenzy` passes (both entries build; `check:routes fort-frenzy` passes as is).
  - `pnpm --filter @pcg/fort-frenzy test` includes: protocol guards accept a sample of every message and
    reject malformed ones; theme parity; licenses; manifest covers every SVG outside `review/` and
    `icons/` and every icon id in SPEC §2.6 (test lists the ids from the spec).
  - A lint fixture proves each new boundary: `pnpm exec eslint --no-ignore apps/fort-frenzy/src/host/sim/__fixtures__/bad.ts` exits non-zero (fixture excluded from the normal lint run, documented in the fixture).
  - `grep -l "Frozen" apps/fort-frenzy/src/shared/messages.ts apps/fort-frenzy/src/shared/ids.ts apps/fort-frenzy/src/content/types.ts apps/fort-frenzy/src/host/sim/types.ts apps/fort-frenzy/src/host/sim/snapshot.ts apps/fort-frenzy/src/themes/types.ts apps/fort-frenzy/src/host/ui/types.ts | wc -l` prints 7.
  - `git check-ignore -q apps/fort-frenzy/generated/x`.
- **Risks / fallbacks:** `@resvg/resvg-js` native binary missing on a platform → it ships prebuilt
  optional deps; if install fails, Blocker (don't switch libraries silently). `tsx` vs Node type stripping
  → use `tsx` for scripts. Rig JSON fields beyond SPEC §15.2 (README's additions: shared `viewBox`,
  `{part, at}` attach) are part of the contract: type them.
- **Leave out:** rasterizing, rendering, sim logic, screens.

### FF2: Generic systems + party

- **Goal:** the extraction-ready, content-free systems and lobby logic, fully unit-tested.
- **Read:** SPEC §6.1 (rules), §7, §7.1, §9.3, §9.4 (scaling), §11.1–§11.3, §15.1 (folder rules), §15.3
  (modifiers, stats, effects, damage pipeline), §15.4 (generic signatures), §15.5, §15.6 (lobby and
  presence), §15.9 (unit test list); `src/host/sim/types.ts`, `src/shared/ids.ts`, `@pcg/game-kit` index.
- **Depends on:** FF1 merged.
- **Order:** test-first per system.
- **Deliverables:** `src/host/systems/{modifiers,effects,damage,cards,waves,flowfield}/` (each `index.ts` +
  `__tests__/`), `src/host/party/` (roster, colors in brand order, ≤10-char names, leader + handoff, ready,
  lobby removal, match by playerId → player key → device ID, 6-player cap with `full`, waiting for late
  joins). Game data only as parameters.
- **Acceptance:** FF checks + I, and these tests exist and pass (`pnpm --filter @pcg/fort-frenzy exec vitest run src/host/systems src/host/party`):
  wave generator (spend within ±1 of budget, allowed types only, guaranteed present, Flyer substitution,
  open lanes only, spread over duration, same seed same wave, scaling multiplier); card picker (every §6.1
  exclusion, no duplicates, ≤1 rare, guaranteed rare, 15% ± 1.5% rare over 10,000 seeded offers, same
  (seed, wave, slot) same offer); flow field (routes around walls when possible, through when sealed,
  snare cost changes nothing, breaker prefers walls, every reachable tile strictly downhill, rebuild of
  36 × 24 < 1 ms mean over 100 runs); stat stacking and caps; each effect stacking policy; damage pipeline
  stage order; party (handoff doesn't snap back, removal lobby-only, seventh phone `full`).
- **Risks / fallbacks:** systems tempted to import content ids → lint forbids it; pass ids as generics.
- **Leave out:** the sim world, any class/enemy behavior, networking.

### FF3: Art in engine + gallery

- **Goal:** every art file rasterized, packed and drawn correctly in Phaser under the §2.5 projection, with
  bloom, tinting, unlit variants and a dev gallery that shows all of it.
- **Read:** SPEC §2.4, §2.5, §2.6 (world UI icons), §3.1, §3.6, §6.1 (status looks), §7.2, §9.6, §15.2
  (all), §15.4 (ThemeHost, icons), §15.10 (atlas pipeline); `art/neon-knights/README.md`, `rigs/*.json`,
  `sprites.json`, `review/*.svg` (reference for correct assembly); `src/themes/types.ts`,
  `generated/manifest.ts`, `src/shared/theme.ts`.
- **Depends on:** FF1 merged.
- **Order:** (1) rasterize + pack + rig validation in `build-atlases.ts`; (2) `src/host/render/types.ts`
  (freeze) and the camera; (3) rig composer and clip runtime; (4) autotiles, Citadel, turret stacks,
  sentries; (5) bloom; (6) gallery and stress mode.
- **Deliverables:**
  - `scripts/build-atlases.ts` stage 2: resvg at 1× and 2×, strip `#glow`/`#glowU`/`#glowS` filters, pack
    Phaser JSON atlases ≤ 4096², `@unlit` variant of every frame with `class="glow"` groups (glow recolored
    to its side's dark shade, SPEC §2.5), rig validation (every part in every view/pose, `order` = parts,
    parents, optional groups, attach points resolve), fails on an SVG outside `review/`/`icons/` that no rig
    or `sprites.json` names; dev-only fallback shapes, production build fails on a missing frame.
  - `src/themes/neon-knights/{shared.ts,host.ts}` (display names from SPEC §2.1 for every id, icon map from
    internal ids to theme icon ids, rig map `engineer → ranger`, `quartermaster → artificer`, `grunt →
    drone` etc., map frames) + theme key whitelist test.
  - `src/host/render/`: `FixedCamera` (SPEC §15.2 formula), layers 1–6, y-sort by foot point (flyers and
    arcs by shadow), rig instance (compose, pivots chained through parents, tint `player`, optional groups,
    poses with crossfade, per-key `order`, emissive brighten/pulse, unlit swap), clip runtime, autotile
    mask helper (N1 E2 S4 W8, shared posts), pulse-turret stack and 8-aim snapping (8° hysteresis), mortar
    tube clamp ±75°, sentry 4 loadouts × 5 aims at Citadel mounts, Citadel draw order + cumulative damage
    stages + rubble, map ground hash/edges/lanes open-sealed, ground ellipses (shadows, rings with notch,
    carry pips at the §15.2 angle formula), status-effect sprites, threshold bloom at half resolution on
    layers 1–4 (amber and violet only), per-kind pools.
  - Clips: `render/clips/<rig>.ts` with idle and walk for every rig, the shared hit/down/respawn for knights,
    Colossus walk with mid-stride leg order swap; later milestones add attack clips per rig file.
  - Gallery `index.html?gallery=1` (dev or `?debug=1`): every rig × view × pose × clip with player-color
    picker, lit/unlit toggle, optional groups toggles (banner, gauge 0–8, Colossus Mk I/II/III/final, mortar
    and turret tiers), all 16 masks for wall/rail/charged/dmg/net in a sample layout, Citadel at each damage
    stage and destroyed, sentries all loadouts × aims, turret tiers × 8 aims, every effect and status, map
    sample with lanes open/sealed, every icon in rest/active/dimmed in a world-UI badge; hitbox ellipse
    overlay toggle. `?gallery=1&stress=1`: SPEC §15.2 peak load (6 knights, 30 footmen, 150 enemies, 100
    projectiles, 60 structures) animated, with an overlay of frame time, render time and bloom time
    (GPU timer query where available, else frame delta with bloom on vs off).
- **Acceptance:** FF checks + I, and:
  - `pnpm --filter @pcg/fort-frenzy assets` exits 0; `generated/atlases/` has 1× and 2× atlases, none larger than 4096².
  - Tests: `rig-contract.test.ts` (knights + footman have side/front/back, Ranger stand+ready per view,
    enemies/Colossus/mortar side only; optional groups `banner`, `core1-full`…`core3-half`, `mk2`/`mk3`/
    `final`, `ii`/`iii`/`band1-3`/`damaged`; attach names per the art README table); `asset-keys.test.ts`
    (every frame/icon key referenced from `src/themes/**` and `src/host/render/**` exists in the manifest —
    code references frames only through typed keys); `unlit.test.ts` (an `@unlit` variant exists for every
    frame with glow); camera projection and ground-ellipse math; autotile mask cases; aim snapping
    hysteresis; carry-pip positions.
  - `pnpm --filter @pcg/fort-frenzy exec playwright test gallery` loads `?gallery=1`, asserts no console errors and no fallback shapes,
    and writes screenshots to `e2e/__screens__/gallery-*.png`.
  - `grep -rn "Math.random" apps/fort-frenzy/src/host/render` prints nothing (render randomness from seeded
    hashes, so Scrap-mite and ground variety are stable).
- **Risks / fallbacks:** the atlas exceeds 4096² at 2× → split into several atlases per category (allowed);
  bloom too slow on integrated GPUs → lower bloom resolution to quarter, log it; Phaser 4 lacks a needed
  filter API → custom pipeline/shader, log it. Knight pivots (SPEC §14 #7) look wrong in motion → note under
  Build decisions for C1, never edit the art. Known art notes (§8): Commander back view has only
  `swordtip`, footman side view has no free hand, Ranger back views have no strap; clips work around them.
- **Leave out:** sim, net, attack/super clips (later milestones), music, enemy back views (v2), Pillow Fort.
- **User checkpoint (C1, art):** run `pnpm dev:lan:fort-frenzy`; open `http://<LAN-IP>:5173/?gallery=1` on
  the TV from across the room and judge projection (0.6 ground squash, top faces), layering (glows never
  show through covering parts, near legs tuck under), tinting in all six player colors, glow and bloom
  (amber ours, violet theirs, nothing red except danger), readability of classes and enemies at TV size;
  then open `?gallery=1&stress=1` on the integrated-GPU laptop at 1080p and confirm the overlay shows frame
  ≤ 16.7 ms and bloom ≤ 2 ms. Notes become FF3-fix.

### FF4: Controller app, all screens

- **Goal:** the complete phone app per SPEC §2.6/§10/§15.7, driven by `team`/`me`, with a full offline dev
  mode.
- **Read:** SPEC §2.6 (phone screens, icons, cards), §6.2 (purchase rules), §10 (all), §11.1–§11.4, §15.6,
  §15.7, §15.8 (device ID); `src/shared/messages.ts`, `src/shared/theme.ts`, `src/styles/brand.css`,
  `art/neon-knights/icons/README.md`, `review/ui-reference/phone/*.png`, `review/ui-pieces/*.svg`;
  `@pcg/controller-kit` index; `generated/` icon sprite and portraits.
- **Depends on:** FF1 merged.
- **Deliverables:** `src/controller/**`: `main.ts` on the kit app shell (real client: `hello` with
  `proto` and `fort-frenzy:deviceId`, `outdated` reload once, "Refresh the TV", rev-ordered `team`/`me`,
  intents with `seq` + `ack` toasts); screens join, name, class select (swipe cards with portrait tinted
  by CSS mask), lobby (lineup, leader mark, Ready, leader-only difficulty/theme/Start/remove), waiting,
  full, combat (stick, main/super/action per `layoutCombat`, aimed/tap/radial gestures from the kit, charge
  ring + full pulse, status strip HP/cells/base, action icon swap incl. `kit` → `emergency-kit` glyph,
  dimmed none), build tab (kit tiles with costs, Place/Cancel, Give, **action button for rows 1–4**, Ready,
  "No buildings to build"), shop tab (coins, private 1-of-3 card with rarity frame and mark, shop rows,
  hold-to-confirm 0.6 s, Request toggles, "Requested by"), dead (countdown only), restoring, claim, summary
  with leader's three options; components per §15.7; `layoutCombat()` pure; sender in `fixedRate` mode with
  the 12-field tuple; `?dev=1` with sample `team`/`me` for every screen and state.
- **Acceptance:** FF checks + I, and:
  - Unit tests: `layoutCombat` at 644×300, 844×390, 932×430, 1180×820, 1366×1024 (gaps ≥ 24 px, edges ≥ 64 px
    from right and bottom, all buttons ≥ 56 px, safe-area insets applied); tuple encoding of every gesture
    outcome; rev drop of stale snapshots; seq/ack toast reasons; action priority icon mapping.
  - `pnpm --filter @pcg/fort-frenzy exec playwright test controller` runs `/play?dev=1` at 640×360, 844×390, 932×430: every screen
    renders without console errors; screenshots to `e2e/__screens__/controller-*.png`.
  - `pnpm check:bundle fort-frenzy` reports `play.html` JS ≤ 100 KB gzipped and no Phaser.
  - `grep -rnE "from '[^']*host/" apps/fort-frenzy/src/controller` prints nothing.
- **Risks / fallbacks:** icon sprite or portraits change shape in FF3 → they're FF1 outputs, frozen with the
  manifest; iOS Safari has no fullscreen → kit no-op; keyboard covering the name field → reuse Sunny Side's
  visual-viewport approach if the kit has it, else log an extraction candidate.
- **Leave out:** host code, Phaser, vibration, gyro, theme switching beyond the one theme.
- **User checkpoint (C1, phones):** with `pnpm dev:lan:fort-frenzy` running, open
  `http://<LAN-IP>:5173/play?dev=1` on an iPhone (Safari) and an Android (Chrome) in landscape; use the
  screen switcher to visit every screen; judge thumb reach, stick and button feel, aimed/radial gestures,
  hold-to-confirm, readability and brand fidelity against `review/ui-reference/phone/`. Notes become FF4-fix.

### FF5: TV DOM screens + HUD

- **Goal:** every DOM screen and HUD element on the TV, scaled to the 1920 × 1080 canvas and driven by
  `TvView`.
- **Read:** SPEC §2.6 (TV HUD, TV screens, lane warnings), §3.3 (feedback), §4 (summary), §9.2 (boss
  bar), §11.1 (home and TV menus by keyboard/gamepad), §15.2 (screen bands, DOM vs Phaser), §15.8 (resume
  row); `src/host/ui/types.ts`, `src/shared/theme.ts`, `src/styles/brand.css`,
  `review/ui-reference/tv/*.png`, `review/ui-pieces/*.svg`; `@pcg/game-kit` QR helper; `generated/` icon
  sprite and portraits.
- **Depends on:** FF1 merged.
- **Deliverables:** `src/host/ui/**` (no Phaser imports): overlay root scaled with the canvas, home
  (focus ring, ◂ ▸ theme and difficulty, Create room, "Resume wave N (saved X min ago)" row only when
  present, audio loading bar slot, keyboard + Gamepad API, no hover-only), lobby (URL, mono code, QR, six
  slots with portrait, name band, class, ready; dashed open slots; TV remove with arm/confirm), combat
  HUD (wave/phase, base bar above the Citadel with hit flash, coins, boss bar on the bottom band,
  announcements bottom-left in buyer color, low-HP vignette + "Citadel under attack"), build HUD (timer,
  next-wave preview with portraits/counts and violet frame for new types, ready status, wishlist on the
  right), lane-warning violet edge bands, victory/defeat summary (banner, stats, award cards per player),
  outdated banner; all inside the 96 px safe margin; `index.html?ui=<screen>` dev page with sample
  `TvView`s.
- **Acceptance:** FF checks + I, and:
  - Unit tests: band geometry matches SPEC §15.2 table (HUD 96–136, bottom band 907–984); home focus
    navigation by key events and a fake gamepad.
  - `pnpm --filter @pcg/fort-frenzy exec playwright test tv-ui` renders every `?ui=` screen at 1920×1080 and 1280×720, asserts every
    element's box lies inside the safe margin, no console errors; screenshots to `e2e/__screens__/tv-*.png`.
  - `grep -rn "from 'phaser'" apps/fort-frenzy/src/host/ui` prints nothing.
- **Risks / fallbacks:** DOM scaling blurs text → scale with CSS transform on a 1920×1080 root and use
  integer font sizes; Gamepad API unavailable → keyboard still drives everything.
- **Leave out:** world UI drawn by Phaser (nametags, aim lines, build arc, badges: FF3/FF7), audio playback.
- **User checkpoint (C1, TV UI):** open `http://<LAN-IP>:5173/?ui=home` (and `lobby`, `combat`, `build`,
  `low-hp`, `boss`, `summary`) on the TV; judge legibility from the couch and fidelity to
  `review/ui-reference/tv/`; drive the home screen with keyboard and a gamepad. Notes become FF5-fix.

### FF6: Sim core + slice content + replay

- **Goal:** the deterministic headless run for the vertical slice: Engineer (Ranger) + pulse turret, Grunt,
  bottom lane, waves 1–2, the whole economy loop, plus recorder, replay script, autopilot and benchmark.
- **Read:** SPEC §3 (map, base, repair, archers), §4, §5, §6 (crates, depot, carry, give/drop), §7 (building,
  validity), §8 Engineer, §9 (Grunt row, aggro leash), §9.1, §9.3, §9.4, §10.1 (action table, build arc,
  firing rules, Steady Aim input), §10.2 (ready, 45 s cap), §11.3 (dazed), §11.4, §15.2 (map v1), §15.3,
  §15.4, §15.5, §15.9; `src/host/sim/types.ts`, `src/content/types.ts`, FF2 system and party indexes.
- **Depends on:** FF2 merged.
- **Order:** test-first: determinism hash test and a scripted scenario per feature before the feature.
- **Deliverables:** `src/host/sim/**` (world, step order exactly as §15.3, kinematic movement + carry
  slowdown, spatial hash, soft separation, structure collision, knockback impulse, commands, phases
  countdown/build/combat/victory/defeat/summary, ready + 45 s cap, coins, crates: depot buy, pickup with 1 s
  self-pickup lock, give/drop, deliver repair, death drop, base HP + damage stages as state, 2 sentries
  targeting nearest incl. flyers, building + validity + ghost + build arc + last-used, danger markers,
  spawner with 3 s warnings, scaling at wave start from connected players, presence/dazed, respawn 10 s,
  invincible flag for debug, state hash FNV-1a), Engineer complete (longbow aimed + auto-aim, super circle
  with knockback, Steady Aim passive module, pulse turret behavior), Grunt (`path` AI, attack blocker/base,
  aggro leash), `src/content/**` for map v1, Engineer, Grunt, pulse turret, base, waves 1–2, scaling,
  difficulty table (starting values), carry/slowdown; input sources `ScriptedInputSource`,
  `AutopilotInputSource`, `ReplayInputSource`; `RunRecorder` (RunStart, changed inputs, commands, commit
  hash); `scripts/replay.ts <file>` (hash every 60 steps, first divergence); `bench` script (peak counts of
  §15.2 with synthetic entities).
- **Acceptance:** FF checks + I + Sim bench (mean step ≤ 2 ms at peak counts in Node on the dev machine),
  and tests: same seed + inputs twice → identical hashes over 2 waves; a recorded autopilot run replays via
  `pnpm --filter @pcg/fort-frenzy exec tsx scripts/replay.ts <file>` with zero divergence; scenarios: wall
  of turrets reroutes Grunts, sealed path → Grunt attacks blocker, depot buy/carry cap/slowdown curve,
  give to nearest teammate else drop, 1 s self-pickup lock, deliver repairs base, death drops crates,
  dazed player untargetable, input older than 250 ms is neutral, counters re-baseline after reconnect and
  going backwards, ready-up starts the wave, 45 s cap, wave ends when all dead, base at 0 → defeat;
  `src/content` validation test (§15.4 list).
- **Risks / fallbacks:** float drift between runs → integer steps, id-ordered iteration, sorted ties;
  if the bench misses budget → profile spatial hash and allocation per step before anything else, log it.
- **Leave out:** other classes, enemies and structures, cards, shop, boss, snapshot/resume, rendering,
  networking.

### FF7: Host wiring + vertical slice + debug panel

- **Goal:** the slice playable end to end: TV home → lobby → run of waves 1–2 with Rangers vs Drones on the
  bottom lane, from real phones, plus the full §9.5 debug panel.
- **Read:** SPEC §2.4 (Ranger, shared animations, carry pips), §2.6, §3.1, §3.3, §3.6, §9.5, §10.1, §11,
  §15.2 (layers, interpolation, world UI), §15.3 (loop), §15.6, §15.9 (replays, e2e); `src/shared/messages.ts`,
  `src/host/sim/types.ts`, `src/host/ui/types.ts`, `src/host/render/types.ts`, `src/themes/types.ts`; FF6
  sim index; `@pcg/net-client` `src/index.ts`, `@pcg/game-kit` index; `apps/sunny-side/e2e/helpers.ts`
  and `smoke.spec.ts` (e2e pattern only).
- **Depends on:** FF3, FF4, FF5, FF6 merged; C1 approved (C1 fixes merged).
- **Deliverables:** `src/host/main.ts`, `src/host/game.ts` (wiring), `src/host/net/` (host client with
  `maxPlayers: 8`, hello/outdated, party bridge, `PhoneInputSource` with receive-time staleness, intents →
  commands with `ack` reasons, `team` ≤ 5 Hz broadcast and `me` ≤ 10 Hz per phone on change, full snapshots
  on hello/rejoin), `TvView` adapter, Phaser `World` scene drawing sim state through `render/` with
  interpolation (map, lanes, Citadel + sentries + damage stages, rings + notch, carry pips, nametags/HP
  flipping near the top, super-ready badge, aim lines, build ghost dashed amber/red X, build arc, danger
  markers, lane warnings, Ranger attack/super/build clips + deploy beacon, Drone attack clip, turret aim +
  muzzle flashes, projectiles, scrap), home/lobby/run flow, visibility pause, host Wake Lock, all-
  disconnected pause, debug panel `?debug=1` (jump to wave, spawn any enemy in any lane, invincible, add
  coins, 2× speed, show/set seed, hitbox/range/flow-field overlays, download replay; auto-offer on uncaught
  error) and `window.__pcg` hooks for e2e; `src/host/audio` stays the FF1 no-op; e2e specs `smoke`
  (lobby, class select, start, build, combat), `reconnect` (phone drop → dazed → back).
- **Acceptance:** FF checks + FF e2e + I, and:
  - `pnpm check:bundle fort-frenzy` still ≤ 100 KB, no Phaser in `play.html`.
  - e2e smoke reaches combat of wave 2 with two phone contexts and asserts a Drone died and coins rose
    (via `__pcg`); reconnect asserts the slot is restored with the same color and class.
  - A unit test checks `PhoneInputSource` staleness (251 ms → neutral, counters still applied).
- **Risks / fallbacks:** Phaser 4 + DOM overlay scaling mismatch → one shared scale function for both,
  tested; e2e timing under software GL → use `catchUpSteps` (Sunny Side M7-fix-1 lesson) and `__pcg`
  speedups, never sleeps.
- **Leave out:** other classes/enemies/structures, cards, shop purchases (rows visible but may ack
  `invalid`), boss, resume, audio.
- **User checkpoint (C2):** `pnpm dev:lan:fort-frenzy`, open `http://<LAN-IP>:5173/` on the TV, create a
  room, join by QR from an iPhone (Safari) and an Android (Chrome), both pick the Ranger, play waves 1–2:
  build turrets (build tab and combat action button/arc), buy at the Armory, deliver to the gate, die and
  respawn, lock one phone ~10 s and confirm it reconnects. Judge latency, stick and aim feel, TV
  readability. Notes become fix milestones per §5 rule 10.

### FF8: Warden + structures + mortar

- **Goal:** the Warden's full kit and every remaining structure, so the Engineer and Warden kits are complete.
- **Read:** SPEC §2.4 (Warden), §2.5 (walls/nets both directions), §7, §7.1, §7.2, §8 Warden + Engineer
  build kit, §10.1 (build arc), §15.2 (autotiles, mortar), §15.5; `rigs/{warden,mortar}.json`,
  `structures/{wall,shock-net,fortify,mortar}/`, `effects/{shock-crawl,wall-strike,mortar-shell,
  scrap-ours-*}.svg`; sim, render, content types.
- **Depends on:** FF7 merged; C2 approved.
- **Deliverables:** `src/host/sim/classes/warden.ts` (slam, stomp super with stun, Mason passive, combat
  only), `src/host/sim/structures/**` (wall path cost + breaker cheapness, snare discharges/rearm/slow
  strongest-wins, half strength on Brute/Colossus, fizzles and frees tile, no flow rebuild; Fortify attach
  to towers; mortar tower area attack with arcing shell and blast ring; structure damaged/destroyed
  states), content for Warden, wall, snare, fortify, mortar; render: wall/rail/net autotiles with per-tile
  discharge dim/flash, charged overlay toggle (bought in FF12), damage overlays, build sketch/fill,
  destroyed scrap, Mason sparks, `render/clips/{warden,mortar}.ts` (all §2.4 Warden animations).
- **Acceptance:** FF checks + I, and scenario tests: walls reroute or are smashed when sealed; snare slows a
  whole Swarm group per discharge and lasts across waves; snare placement allowed on occupied tiles, walls
  not; Fortify only on towers; Mason off in build phase; mortar damages all in radius; flow field rebuilt
  the step a wall is destroyed. Gallery shows the new clips with no fallback shapes
  (`pnpm --filter @pcg/fort-frenzy exec playwright test gallery`).
- **Risks / fallbacks:** autotile seams at shared posts → follow the README's post rule exactly; never edit
  art.
- **Leave out:** shop upgrades (FF12), Fault Line and other cards (FF12).

### FF9: Artificer + Commander + squad

- **Goal:** the two support classes complete.
- **Read:** SPEC §2.4 (Artificer, Commander, footmen, rally flag, healing visuals), §3.4 (kit), §6 (QM perks),
  §8 Quartermaster + Commander, §10.1 (rows 3, 6, 7; Give for no-structure classes), §15.2 (optional groups);
  `rigs/{artificer,commander,footman}.json`, `structures/rally-flag/`, `structures/power-cell.svg`,
  `effects/{nanite-bolt,nanite-mote,heal-glint,scrap-ours-1,scrap-ours-2}.svg`; sim, render, content types.
- **Depends on:** FF7 merged; C2 approved.
- **Deliverables:** `src/host/sim/classes/{quartermaster,commander}.ts`, `src/host/sim/squad/**`
  (footmen follow/hold flag/attack, size 3 → 4 → 5 after the boss waves 5 and 10 read from wave data, respawn between waves, collapse), QM perks
  (discount, cap 8, no slowdown, throw arc auto-targeting nearest Engineer/Warden, emergency kit use in the
  repair zone given a held kit; purchase comes in FF12), Field Medic (combat only, charges super slowly),
  cone attacks blocked by walls/towers vs super passing through, heal + tower defense bonus, morale, Lead
  from the Front; content for both classes and footmen; render: backpack gauge groups, banner on/off,
  tinted flag cloth + ring, link lines, nanite cloud, heal glints, Field Medic dotted circle, morale aura,
  thrown cell arc with ground shadow, `render/clips/{artificer,commander,footman}.ts`.
- **Acceptance:** FF checks + I, and scenario tests: gauge state for 0–8 crates matches the README rule;
  throw lands on the target's carry point; Field Medic off in build; super healing doesn't charge super;
  flag plant/recall changes squad behavior; dead soldiers return at build start; kit use repairs and
  consumes the kit; QM and Commander Give via hold repeats every 300 ms.
- **Risks / fallbacks:** squad pathing cost → footmen use the ground field toward the flag or follow offset;
  log if a simpler steering suffices.
- **Leave out:** squad stat shop items, cards (FF12).

### FF10: Enemy roster + waves 1–15

- **Goal:** all seven enemy types with their AI, tells and art, and hand-authored wave data for 1–15 (boss
  spawns stubbed until FF11).
- **Read:** SPEC §3.3 (runner burst, siege), §9 (table, rules, Flyer check), §9.1, §9.3, §9.4, §9.6,
  §15.2 (facing: enemies side only, Wasp mirror), §15.5; `rigs/{drone,skitter,brute,bombard,wasp,mite,
  stalker}.json`, `effects/{bombard-shell,wasp-shot,muzzle-theirs,spark-theirs,scrap-theirs-*,burn-*,
  corrosion-*,stun-*,shock-crawl}.svg`; sim, render, content types.
- **Depends on:** FF7 merged; C2 approved.
- **Deliverables:** `src/host/sim/ai/{runner,swarm,brute,flyer,siege,hunter}.ts` (plus leash for Grunt,
  Brute, Swarm, Flyer), per-hunted-player fields, Flyer substitution counted at wave start from connected
  players, melee can't hit Flyers, Siege markers and shells on base/towers, Swarm groups of 8 with
  jitter in the sim (combat stream), coins per kill (Swarm pays on last unit); content for every enemy and
  `waves.ts` for 1–15 (lanes per §9.4, budgets, guaranteed introductions; waves 5/10/15 carry `boss` refs);
  render: `render/clips/<enemy>.ts` with walk/attack/tell clips, Stalker thread, Wasp shadow height,
  skitter core pulse by distance, stun unlit swap + chevrons, slow crawl, burn/corrosion loops + white
  tick flash.
- **Acceptance:** FF checks + I, and scenario tests: Runner bursts the base once and dies, never attacks
  players; Brute prefers smashing walls; Siege stops at range and shells; Hunter follows its target's
  field and retargets on death/daze; Flyers ignore walls and are replaced when no Engineer/Quartermaster
  is connected at wave start; aggro leash returns to path; wave generator outputs for all 15 waves stay
  within budget ± 1 (content validation); Sim bench at peak counts still within budget.
- **Leave out:** the Colossus (FF11), elite variants and back views (v2).
- **User checkpoint (C3):** `pnpm dev:lan:fort-frenzy`, TV at `http://<LAN-IP>:5173/?debug=1`, 2–4 phones.
  Play each class (Ranger, Warden, Artificer, Commander) for a few waves; use the debug panel to jump waves
  and spawn every enemy type in each lane; judge each kit's feel (attacks, supers, passives, build kits,
  crate running), each enemy's tell and readability, and that every enemy is answerable by ≥ 2 classes.
  Notes become fix milestones per §5 rule 10.

### FF11: Colossus boss

- **Goal:** the boss module with all three forms and the boss-wave rules.
- **Read:** SPEC §9.2, §9.6 (Colossus), §15.3 (BossBehavior), §15.2 (Keyframe `order`); `rigs/colossus.json`,
  `review/colossus/*`, `effects/boulder.svg`; sim, render, content types; FF10's `ai/` and `waves.ts`.
- **Depends on:** FF10 merged; C3 approved.
- **Deliverables:** `src/host/sim/boss/colossus.ts` (slam with 1.5 s red marker, wall breaker 3×, boulder
  throw at a tower or the largest player group, final phase below 50% with faster moves, shockwave rings,
  Runner calls from spires; stagger meter filled by damage and more by Warden stuns, 3 s stagger with bonus
  damage; HP × player-count scaling; death ends the wave and collapses the rest; the post-boss guaranteed
  rare (FF12) and squad growth (FF9) key off the wave data's `boss` field, so nothing here depends on them), boss content; render: Mk I/II/III/final groups,
  walk with leg order swap and scale-up, head tracking and snap before attacks, tells, core brightness by
  stagger, kneel, boss bar data in `TvView`; `render/clips/colossus.ts`.
- **Acceptance:** FF checks + I, and scenario tests: slam lands exactly 90 steps after its marker; wave 5
  uses Mk I and only slam + wall breaker; wave 10 adds boulders and escorts; wave 15 final phase below 50%;
  Warden stuns alone can't keep it staggered continuously (test a Warden-only stun loop); boss death ends
  the wave; gallery shows Colossus clips with no fallback shapes.
- **Leave out:** other bosses (v2), music.

### FF12: Cards, team shop, difficulty

- **Goal:** all 64 upgrade cards, the full team shop with tiers, requests and announcements, and difficulty.
- **Read:** SPEC §2.2, §3.4, §3.5, §6, §6.1, §6.2, §7.2 (tier looks, charged walls), §8 (squad growth), §9.4,
  §10.3, §15.3 (modifiers, effects), §15.4 (CardDef, ShopItemDef, DifficultyDef);
  `structures/{pulse-turret,sentry,wall/charged}/`, `structures/mortar` tier groups,
  `effects/defense-bonus.svg`, `icons/card-*.svg`; sim, content, render types; FF2 cards system.
- **Depends on:** FF8, FF9, FF10 merged; C3 approved.
- **Deliverables:** `src/host/sim/cards/**` (offer each build phase per slot from `cards:<wave>:<slot>`,
  private pick, 8 shared commons tuned per class, 2 commons + 5 rares + 1 combo per class as modules,
  guaranteed rare after any wave whose `WaveDef.boss` is set, combos gated by prerequisites, unique handling, stacking ×N, caps; Burn, Poison, Overflow shield,
  Wildfire, Plague, Fault Line, Warcry, Veterans, Last Stand, Vanguard, Bodyguard, Unshakable, Light Load,
  Bulk Buyer, Strong Arm, Triage, Volley, Piercing Shot, Skyhunter, Giant Slayer, Siege Breakers, Deadeye,
  …), `src/host/sim/shop/**` (crates, rising repair, 3 sentry upgrades, squad stats after regular waves, turret
  fire rate ×3, mortar radius ×3, tower HP ×3, wall HP ×3, snare charges ×3 incl. existing snares, charged
  walls, QM-only base armor + emergency kit (held, one at a time), visibility by team classes,
  hold-to-confirm flag, request/wishlist cleared on buy or wave start, purchase announcements), difficulty
  multipliers baked at spawn, content `cards.ts`, `shop.ts`, `difficulty.ts`; render: turret head/band tiers,
  mortar tiers, sentry loadouts, charged walls bolts on attack, upgrade flash, defense-bonus pips, Overflow
  icon beside HP; `TvView`/`MeView` card and shop fields populated.
- **Acceptance:** FF checks + I, and tests: content validation (every card id, combo prerequisites,
  favored enemies, shop targets resolve); each card has a scenario or stat test; picker exclusions over
  real content (Skyhunter excluded when Flyers are substituted); guaranteed rare after waves 5 and 10;
  shop visibility (no Engineer → no tower items; no Commander → no squad items; QM-only only to QM phones);
  snare charges tier raises discharges on existing snares; difficulty Easy < Normal < Hard on wave budget
  and enemy HP for the same seed.
- **Risks / fallbacks:** a card needs a hook a class file lacks → add the hook additively in the class file
  and log `contract+`; exact numbers are starting values (SPEC §14 #2).
- **Leave out:** card reroll, crits, selectable passives (v2).

### FF13: Sound effects

- **Goal:** the v1 SFX set from Foster's Kenney packs, played on the TV.
- **Read:** SPEC §2.1 (audio is theme data), §3.3 (alarm), §12 (audio scope), §14 #4, §15.4 (ThemeHost.sfx),
  §15.10 (audio, licensing); `src/shared/ids.ts` (SfxId), `src/host/sim/events.ts`, `src/host/audio/*`,
  `assets/LICENSES.json`; `apps/fort-frenzy/audio/kenney/*/License.txt` and the pack file lists.
- **Depends on:** FF7 merged; C3 approved; pre-flight "Kenney packs present" and "ffmpeg".
- **Deliverables:** `scripts/pick-sfx.ts` (maps each `SfxId` to a pack file, converts with ffmpeg to
  `audio/neon-knights/<sfx>.mp3`, normalized loudness; the outputs are committed sources per SPEC §15.1),
  `ThemeHost.sfx` map, `src/host/audio/` player (preload behind the home loading bar, first keypress
  unlocks, per-cue volume and rate limit), `cues.ts` mapping SimEvents to cues (base alarm, base hit,
  player hit, enemy hit/death, structure placed/destroyed, boss wind-ups, purchase, card pick, wave start,
  victory, defeat), LICENSES entries for the chosen files.
- **Acceptance:** FF checks + I, and tests: every `SfxId` has a file in `audio/neon-knights/` and a LICENSES
  entry; the player rate-limits a cue fired 20 times in one step to ≤ its cap; `git diff --quiet main --
  apps/fort-frenzy/audio/kenney` (packs untouched).
- **Leave out:** music (v2), phone audio.

### FF14: Run lifecycle, late join, resume

- **Goal:** the whole run from countdown to summary and back, plus late joins, host reload/crash resume and
  device-ID matching.
- **Read:** SPEC §4, §11.1–§11.5, §15.6 (identity, claim), §15.8, §15.9 (e2e list); `src/host/sim/snapshot.ts`,
  `src/shared/messages.ts`, sim types; FF7's `src/host/net/` and `game.ts`; `@pcg/net-client` index
  (reclaim behavior, relay SPEC §3.1).
- **Depends on:** FF11, FF12, FF13 merged.
- **Deliverables:** victory/defeat (collapse/victory then summary), per-player run stats and award cards,
  end options (again keeps classes → Ready, classes → class select, home closes the room), late joins only
  in build phase (`waiting` otherwise) spawning at the base, `src/host/sim/snapshot.ts` save/restore
  (localStorage `fort-frenzy:run`, versioned, 12 h expiry, written at build start and every build-phase
  change debounced 250 ms, flushed on `pagehide`, cleared at run end), resume flow ("TV is restoring",
  Resume/New run on TV and leader phone), new-room path with device-ID matching and the `claim` screen,
  new replay segment from the snapshot; e2e specs `resume` (host reload mid-build → same wave, same
  structures and cards), `resume-new-room` (room expired → phones matched by device ID, an unknown phone
  claims a slot), `late-join`.
- **Acceptance:** FF checks + FF e2e + I, and tests: snapshot round trip gives the same state hash at the
  build phase; a restored card offer is identical; version mismatch and > 12 h snapshots are discarded;
  late join during combat sees `waiting` and joins at build.
- **Leave out:** endless mode, solo mode (v2).

### FF15: Soak, benchmark, perf pass

- **Goal:** prove the full run is stable, deterministic and inside the performance budget.
- **Read:** SPEC §15.2 (performance budget), §15.3 (determinism), §15.9 (soak, benchmark); sim and render
  types; FF6's autopilot, recorder and bench.
- **Depends on:** FF11, FF12, FF13 merged.
- **Deliverables:** soak test (autopilot, invincible, waves 1–15, 2 and 6 players, every class mix in a
  rotation, two seeds) completing with no exceptions and identical hashes on a rerun; bench scenarios at
  real peak (boss wave 15 final phase + Swarms) in the full sim; a `?debug=1&stress=1` in-game stress mode
  spawning the §15.2 peak load with the frame/sim/bloom overlay; perf fixes in `src/host/render/**` and sim
  hot paths (each logged).
- **Acceptance:** FF checks + I + Sim bench (p99 step ≤ 2 ms at peak), and `pnpm --filter @pcg/fort-frenzy exec vitest run soak` passes (soak runs in the normal suite only in a short form; the full form is `pnpm --filter @pcg/fort-frenzy soak`, which must pass once and is logged with its duration).
- **Risks / fallbacks:** FF14 and FF15 both touch `src/host/sim/**`: FF14 owns `snapshot.ts`, `net/`, `party/`,
  phases/lifecycle; FF15 may only change hot-path internals without changing types; on a textual conflict,
  rebase and rerun.
- **Leave out:** balance changes (C4 notes do that).
- **User checkpoint (C4, with FF14):** on the TV at `http://<LAN-IP>:5173/` with 2–6 phones, play a full
  15-wave run on Normal (and a few waves on Easy and Hard); time it (target 22–27 min), note waves that drag
  or spike, card and shop choices that feel useless or mandatory, coin and crate pacing, boss fights, and
  any crash (the debug panel's replay download goes to the fix agent). Then reload the TV mid-build and
  resume. Notes become fix milestones; tuning goes to `src/content/balance.ts` (SPEC §15.4).

### Fix milestones (`FF<N>-fix-<k>`)

Same model as FF<N>. **Read:** the checkpoint notes + FF<N>'s Read. **Acceptance:** FF<N>'s Acceptance +
one runnable check per note where possible (a test, a config value, a grep); pure feel/visual notes are
re-judged at the next checkpoint.

## 4. Subagent brief template

```text
You are building {FF#}: {milestone name} for Fort Frenzy (apps/fort-frenzy).
Goal: {Goal}
Branch: create `{build/ff<N>-<slug> or build/ff<N>-fix-<k>}` from `main` and work only there.

Read ONLY: apps/fort-frenzy/BUILD_PLAN.md §2, the §3 entry for {FF#}, §8 Build decisions; {Read list}.
{For fix milestones: Checkpoint notes: …}

Deliverables: {Deliverables}
Acceptance (build until every item passes; run them yourself): {FF checks | Workspace checks}
{+ FF e2e} + Inputs unchanged (I) + {Acceptance items}.
Order: {Order or "none"}
Leave out: {Leave out}
Risks / fallbacks: {Risks / fallbacks}

Rules:
- Frozen contracts ({freeze points in force from BUILD_PLAN §3}): additive changes only. When you add,
  update the contract file + the matching SPEC.md section + one line `- [FF#] contract+: …` under Build
  decisions.
- Art, brand and audio packs are inputs: never edit, redraw, regenerate or restyle anything under
  apps/fort-frenzy/{art,brand,public,audio/kenney} or src/styles/brand.css. If an asset is missing or
  wrong, write it under Blockers; use a clearly marked placeholder only if this milestone says so.
- Shared code (packages/**, apps/relay, apps/sunny-side) stays game-agnostic and backward compatible.
  Never break Sunny Side or the relay. Only shared milestones touch them.
- Append-only registries (BUILD_PLAN §3): append, never reorder or delete.
- If you can spawn agents, hand side work to cheaper helpers: haiku for file lookups, running commands and
  digesting long logs or test output; sonnet for library/API docs research, drafting tests or fixtures and
  mechanical multi-file edits. Keep this milestone's hard logic for yourself. Ask helpers for short answers.
- A choice the spec and this plan don't cover: pick the simplest, log one line under Build decisions.
- Blocked: write `- [FF#] YYYY-MM-DD: …` under Blockers, commit, stop. Don't guess.
- If a dependency isn't merged yet and only its checks are missing, finish everything else and report
  "done, checks pending FF#".
- Done: tick your Progress items in BUILD_PLAN.md, commit, `git rebase main`, rerun Acceptance if the rebase
  pulled anything in. Don't merge, don't push.
- Reply in 150 words or fewer: what was built, what was deferred, blockers, branch name.
```

## 5. Orchestrator rules

1. Read only `apps/fort-frenzy/BUILD_PLAN.md`. Never read source code. Trust subagent reports and the checklist.
2. To resume: read §6 Progress, §7 Blockers and `git log --oneline -15`, then run §1 pre-flight.
3. One subagent per milestone via the Agent tool with the §3 `model`. Run parallel milestones in the same turn
   with `isolation: "worktree"`; run the others in the main checkout. Never run two `shared` milestones at
   once (FF0 and FF1 run alone).
4. **Use cheaper helper agents for everything that isn't milestone work,** instead of doing it yourself:
   `haiku` for reading and summarizing files, logs, diffs or command output, running pre-flight and check
   commands, ticking the checklist and logging Blockers / Build decisions in this file, and other mechanical
   edits; `sonnet` for research (library or platform docs, error messages), drafting checkpoint instructions
   for the user, and small writing or fix-up tasks that need judgment. Ask each helper for only the answer
   you need (a few lines, failures only). Use `opus` only where the §3 table says so. A helper may read
   source code to answer a narrow question; you still don't.
5. Merge per §2, in dependency order (§3 graph): FF0, FF1, then FF2–FF5 in any order, FF6, FF7, FF8–FF10,
   FF11–FF13, FF14–FF15. Merge a deferred-check dependency first, then resume the dependent milestone.
6. After each merge, spawn a `test-runner` agent (`model: "haiku"`) on `main` with that milestone's
   Acceptance commands (Workspace checks after FF0 and FF1); only failures come back. On failure, resume that
   milestone's subagent with the output.
7. Stop at user checkpoints (C1–C4) and unresolved Blockers. Tell the user exactly what's needed: the command
   to run, the URL or file to open, what to judge, the question to answer. Checkpoint notes become fix
   subagents.
8. No extra reviews, audits or re-exploration unless an Acceptance check fails (narrow helper questions under
   rule 4 are fine).
9. Before each parallel wave, confirm §1 "Worktrees ignored" passes on `main`.
10. Route checkpoint notes by owner directory: phone UI → FF4-fix; TV DOM screens → FF5-fix; art assembly,
    rigs, clips, bloom, camera → FF3-fix (or the class/enemy milestone that owns that rig's clips after
    FF7); host wiring, net, flow → FF7-fix (FF14-fix after FF14); sim rules → the milestone owning that
    feature; numbers and pacing → a fix on the owning milestone changing only `src/content/balance.ts`
    (the map layout: `map.ts`). Fix
    milestones touching disjoint directories run in parallel in worktrees.
11. When everything in §6 is checked, run the Workspace checks once more on `main` via a test-runner, then
    print the §9 Final handoff list.

## 6. Progress checklist

- [x] Pre-flight passed (S1)
- FF0 Shared kits
  - [x] `@pcg/game-kit` (loop, lerp, RNG, host helpers, `/vite`) with tests
  - [x] `@pcg/controller-kit` (platform, shell, router, widgets, gestures, sender, dev harness) with tests
  - [x] Sunny Side on the kits, its copies deleted, its checks and e2e green
  - [x] Dockerfile + `.prettierignore` + package tables updated
  - [x] Merged to `main`
- FF1 Scaffold + contracts
  - [x] App scaffold, deps, entries, configs, `check:fort-frenzy` green
  - [x] Frozen contracts (7 files) + guards + theme parity
  - [x] Asset manifest, icon sprite, portraits, LICENSES + test
  - [x] Root wiring (scripts, ESLint boundaries, bundle limit, Dockerfile, doc tables)
  - [x] Merged to `main`
- FF2 Systems + party
  - [x] modifiers, effects, damage with tests
  - [x] cards, waves, flowfield with tests
  - [x] party with tests
  - [x] Merged to `main`
- FF3 Art in engine
  - [x] Atlases 1×/2×, unlit variants, rig validation
  - [x] Theme pack + render core (camera, layers, rigs, clips, autotiles, Citadel, towers, bloom)
  - [x] Gallery + stress mode + asset/rig tests + gallery e2e
  - [x] Merged to `main`
  - [x] FF3-fix-1: C1 gallery notes (gauge, enemy hit/death, walks, down pile, respawn, twin flash, smoke, collapse, speeds, glints, stun idle, slow)
  - [x] FF3-fix-2: C3 floor contrast (lighter arena floor, checked against enemies, effects, player colors)
- FF4 Controller
  - [x] Client wiring, sender, `layoutCombat` + tests
  - [x] All screens + components + dev mode
  - [x] Controller e2e screenshots, bundle ≤ 100 KB
  - [x] Merged to `main`
- FF5 TV UI
  - [x] Home, lobby, summary screens
  - [x] Combat + build HUD, alarms, lane bands
  - [x] `?ui=` dev page + e2e safe-margin checks
  - [x] Merged to `main`
- [x] **User approved C1** (gallery, perf stress, phones, TV UI): notes fixed in FF2-fix-1, FF3-fix-1, FF4-fix-2, FF5-fix-1; feel and visual notes re-judged at C2
- FF6 Sim core
  - [x] World, step order, movement, economy loop, building, phases
  - [x] Engineer + pulse turret + Grunt + waves 1–2 content
  - [x] Recorder, replay script, autopilot, determinism + scenario tests, bench
  - [x] Merged to `main`
- FF7 Vertical slice
  - [x] Host net + party bridge + input staleness + state sync
  - [x] World scene + TV UI hookup + run flow
  - [x] Debug panel + `__pcg` + smoke/reconnect e2e
  - [x] Merged to `main`
  - [x] FF7-fix-1: C2 notes (Ranger bow draw/release, bolt leaves from the bow, super-ready amber ring pulse replaces the head badge)
  - [x] FF7-fix-2: C3 aim previews shaped like every aimed attack and super (Warden cone fill, Artificer filled cone), Warden narrower + longer slam and super, Ranger super range up
  - [x] FF7-fix-3: C3 follow-up: Warden slam and Commander slash aimed, cone/arc previews
  - [x] FF7-fix-4: early C4 note: the aim line hides as soon as a held aimed attack cancels
- [x] **User approved C2** (slice on real phones and TV): notes fixed in FF7-fix-1; Citadel collapse deferred to v2; feel and visual notes re-judged at C3
- FF8 Warden + structures
  - [x] Warden kit + clips
  - [x] Walls, nets, Fortify, mortar (sim + render)
  - [x] Merged to `main`
- FF9 Support classes
  - [x] Artificer kit + gauge + throw + kit use
  - [x] Commander + squad + flag
  - [x] Merged to `main`
  - [x] FF9-fix-1: C3 Commander passive as drifting amber motes (no link lines), super flashes affected units' amber parts + rings
- FF10 Enemies
  - [x] Six new AIs + leash + Flyer substitution
  - [x] Enemy clips + status visuals
  - [x] Waves 1–15 content
  - [x] Merged to `main`
  - [x] FF10-fix-1: C3 Wasp jitter, Hunter tower-avoiding path + player-color foot flash, diagonal flow field to the Citadel
  - [x] FF10-fix-2: early C4 notes: Wasp flies at half height; enemy hitboxes cover the whole body (no arms/tails), Colossus low but a bit bigger
- [x] **User approved C3** (class kits and enemies): notes fixed in FF3-fix-2, FF7-fix-2, FF9-fix-1, FF10-fix-1, run in parallel with FF11–FF13 at the user's request; feel and visual notes re-judged at C4
- FF11 Colossus
  - [x] Boss module (forms, attacks, stagger, rewards)
  - [x] Colossus render + clips + boss bar
  - [x] Merged to `main`
- FF12 Economy
  - [x] 64 cards + offers
  - [x] Team shop + wishlist + announcements + tier visuals
  - [x] Difficulty
  - [x] Merged to `main`
- FF13 Audio
  - [x] SFX picked and converted + LICENSES
  - [x] Player + cues + unlock
  - [x] Merged to `main`
- FF14 Lifecycle + resume
  - [x] Victory/defeat/summary/end options, late joins
  - [x] Snapshot + resume + device-ID claim
  - [x] Resume e2e (specs written, typechecked and linted; run by the orchestrator's test-runner)
  - [x] Merged to `main`
- FF15 Soak + perf
  - [x] Soak + determinism over full runs
  - [x] Bench at real peak + stress mode + perf fixes
  - [ ] Merged to `main`
- [ ] **User approved C4** (full run, pacing, balance)
- [ ] Final Workspace checks green on `main`
- [ ] Final handoff printed

## 7. Blockers

_None._

Format: `- [FF#] YYYY-MM-DD: what's blocked, what was tried, what's needed from whom.`

## 8. Build decisions

Format: `- [FF#] decision: one line, with the reason.` (`contract+:` for additive contract changes.)

- [plan] decision: FF0 is the kits extraction and FF1 the scaffold + contracts (not one FF0): the app's
  `vite.config.ts`, loop and RNG import the kits, so the kits must exist first; both run serially before any
  parallel work.
- [plan] decision: extract into `@pcg/controller-kit` everything SPEC §15.1 lists (Sunny Side's wake lock,
  fullscreen, orientation/rotate, app shell and overlays, dev harness, joystick, buttons, nearest router,
  sender, DOM helpers) plus new generic pieces (aimed and radial gestures, hold-to-confirm, screen router,
  fixed-rate sender mode); into `@pcg/game-kit` the fixed-step loop and interpolation, visibility pause,
  host wake lock, `relayUrl`, LAN/`/play` Vite plugins, QR helper, `__pcg` installer, plus the new seeded RNG.
  Reason: Fort Frenzy needs them unchanged or with parameters; one copy (PLATFORM decision #4).
- [plan] decision: no changes to `@pcg/net-client` or `apps/relay`: Fort Frenzy needs `maxPlayers: 8`
  (within the 1–16 clamp), tokens, player keys and reclaim exactly as they are (SPEC §15.1, §15.6). The
  relay Dockerfile changes only to copy the new workspace manifests; no relay redeploy is required.
- [plan] decision: extraction candidates left in the app (one consumer so far): `src/host/systems/*`,
  `src/host/party/` (lint-enforced, SPEC §15.1), the atlas/rig pipeline and rig renderer (`scripts/
  build-atlases.ts`, `src/host/render/`), the TV DOM overlay scaler, `layoutCombat`. Sunny Side code that
  turns out too coupled to its brand in FF0 is logged here as well.
- [plan] decision: FF1 installs every dependency the plan needs, so parallel milestones never edit
  `apps/fort-frenzy/package.json`; generated assets go to gitignored `apps/fort-frenzy/generated/`, and
  scripts chain `pnpm assets` explicitly because pnpm skips pre-scripts.
- [plan] decision: the TV's DOM overlay lives in `src/host/ui/` (SPEC §15.1's layout doesn't name a folder;
  §15.2 makes it DOM, so it stays out of `render/`), driven by a frozen `TvView`.
- [plan] decision: the gallery is `index.html?gallery=1` and TV UI samples are `index.html?ui=<screen>`, dev
  or `?debug=1` only, mirroring the phones' `?dev=1`.
- [plan] decision: the vertical slice is Ranger (Engineer) + pulse turret vs Drones (Grunts) on the bottom
  lane, waves 1–2: it exercises aimed gestures, the build arc, the flow field (turrets block), crates and
  the base loop with the fewest systems.
- [plan] decision: Quartermaster-only items in v1 are exactly base armor and the emergency kit (§6.2's
  "for example" lists only those two; both have icons).
- [plan] decision: the rally flag is planted only in combat (action button row 7); its position persists
  across phases and in the snapshot. The build-phase action button covers rows 1–4 only (SPEC §10.2).
- [plan] decision: a Quartermaster with no Engineer or Warden connected has no throw target, so row 6
  doesn't apply and the button falls through (Give stays on hold).
- [plan] decision: internal ids follow SPEC (`engineer`, `warden`, `quartermaster`, `commander`, `grunt`,
  `runner`, …); the neon-knights theme maps them to rig ids (`ranger`, `artificer`, `drone`, `skitter`,
  `bombard`, `wasp`, `mite`, `stalker`) and icon ids (`class-ranger`, `main-artificer`, …).
- [plan] decision (spec vs art): the art README still says sealed lanes "need a spec rule"; SPEC §3.1 and
  §15.11 #27 now settle it, and the spec wins. The `wall-hp` icon's README label "Wall and net armor" is a
  label only: the shop item is Wall HP (nets have no HP, §7.1).
- [plan] decision: Fort Frenzy's `check-bundle` limit is 100 KB gzipped (SPEC §15.7); Sunny Side gets its
  current size + 20% so the new per-app limit can't fail it on day one.
- [plan] decision: performance on the integrated-GPU laptop can't be measured by agents (headless Chromium
  uses software GL), so FF3/FF15 build a stress mode with an overlay and the user confirms the numbers at C1
  and C4; the sim's 2 ms step budget is checked headless by `bench`.
- [plan] art notes (user approved proceeding as is, 2026-10-29): the Commander's back view has only a
  `swordtip` part (no full sword), the footman's side view has no free hand, and the Ranger's back views have
  no quiver strap. Clips work around them; a later art drop replacing `art/neon-knights/` fixes them.
- [plan] decision: SPEC updated before the build (2026-10-29, §15.11 #32–#34): emergency kit held and used
  with the action button (new §10.1 row 3, `MeView.action` `'kit'`, `kits`); build-phase action button;
  Kenney SFX from `audio/kenney/`.
- [FF0] decision: Sunny Side already had fullscreen on every tap, so it is not a behavior change. The kit
  shell now takes Wake Lock and the landscape lock on the first touch of the app root (was a `window`
  listener in `main.ts`, non-dev only; `?dev=1` now gets them too), rewrites the viewport meta (Sunny
  Side's is already identical) and blocks iOS `gesturestart` pinch zoom (the one new behavior).
- [FF0] decision: kept in Sunny Side as thin wrappers over the kits: `input/tuple.ts` (its tuple schema on
  the kit sender, keeping `setStick`/`setButton` so its tests run unchanged), `input/holdToPause.ts`,
  `storage.ts` (name key), `debug.ts` (`createDebugSim`, `PcgDebugApi`). `dev.ts` became `samples.ts`
  (sample screens) + `devMode.ts` (kit harness); snapshot interpolation moved to `src/host/interpolate.ts`.
  Sunny Side's loop/lan/visibility/wake-lock tests moved to `@pcg/game-kit` with the code.
- [FF0] decision: extraction candidates left in Sunny Side (brand-coupled, one consumer): the SLAM charge
  arc (`input/buttons.ts`, brand colors), the top banner (`banner.ts`) and the joining/removed screens.
- [FF0] decision: the kits ship no CSS: games style the class hooks (`.screen-host`, `.overlay-host`,
  `.overlay`, `.overlay-card`, `.stick-base`, `.pressed`, `.holding`, `.dev-*`) with their own tokens;
  overlay copy and title/body classes are parameters.
- [FF0] decision: both kits are `sideEffects: false`, so `play.html` doesn't bundle `qrcode` (the QR
  helper's dependency) just because the controller imports `relayUrl` from `@pcg/game-kit`.
- [FF0] decision: `@pcg/game-kit` has one core entry (no separate host entry): its DOM-facing helpers read
  `document`/`navigator`/`location` lazily or as parameters, so a sim can import the RNG in Node.
  `relayUrl(envUrl)` and `debugEnabled(dev)` take the env value; the kit reads no `import.meta.env`.
- [FF0] decision: `@pcg/game-kit/vite` imports `./lan.ts` with the extension, because Vite loads a
  workspace config dependency through Node's type stripping (no bundling); apps that typecheck their
  `vite.config.ts` need `allowImportingTsExtensions` (Sunny Side has it).
- [FF0] decision: `qrcode` stays a Sunny Side devDependency (its smoke e2e decodes the lobby QR).
- [FF0] decision: RNG: `int(lo, hi)` is inclusive at both ends; the state is four FNV-1a hashes of
  `${seed}\0${label}` (one offset per word) and 12 warm-up rounds; the first values are pinned in a test.
- [FF0] decision: gestures (SPEC §15.7 leaves these open): the aimed and radial dead zones default to 12%
  of the 70 px aim radius (8.4 px, the stick's rule); an aimed press held past 150 ms that never left the
  dead zone cancels; a radial release after Give repeats only ends (no extra commit); with a single slot
  the arc never opens and a dimmed single slot does nothing on hold; a radial release after 150 ms that
  never opened cancels.
- [FF0] decision: fixed-rate sender periods are `round(1000 / Hz)` (33 ms, 200 ms); edges and a change of
  touched state send at once and restart the clock; controls report touch with `touch(id, on)`.
- [FF1] decision: dependencies: `maxrects-packer` 3.0.0 (2.7.4 is deprecated upstream as broken),
  `@resvg/resvg-js` 2.6.2 (prebuilt binary installs on Windows), `tsx` 4.23.15; the rest match Sunny
  Side. `e2e` also runs `pnpm assets` first; `bench` is a stub until FF6 adds scenarios.
- [FF1] decision: internal ids not named in SPEC: structures `arrow_tower bomb_tower wall snare fortify`;
  shop `crate repair archer_damage archer_range archer_third squad_stats arrow_rate bomb_radius tower_hp
  wall_hp snare_charges spiked_walls base_armor emergency_kit`; cards are snake_case card names (the 8
  commons are shared, `perClass` tunes them: 40 ids, 64 cards); effects add `aura_mason`; SFX ids are
  FF13's cue list; theme id `neon-knights`.
- [FF1] decision: intent acks run through the sim: `SimCommand` carries an optional `ref`, and the sim
  answers with a `command` SimEvent (ok or an `AckReason`); host/net maps it back to the phone's `seq`.
- [FF1] decision: the base is a unit with the reserved `BASE_ID` 0 (entities start at 1), and structures
  are units too (`damageable: false` for snares), so base armor and the tower defense bonus use the one
  modifier/damage path; Fortify is a flag on the tower (`fortified`), matching the snapshot.
- [FF1] decision: theme packs map internal ids themselves: `ThemeShared.iconFor` (class, main, super,
  structure, shop, card icons) and `ThemeHost.rigFor` (class, enemy, soldier, structure rigs); fixed icon
  ids (`act-*`, `coins`, …) need no mapping.
- [FF1] decision: the asset manifest's types live in `src/themes/types.ts` (`AssetManifest`,
  `ThemeAssets`, `FrameMeta`) and `generated/manifest.ts` exports `manifest`. Rig-part frames take the
  rig's viewBox, the view's `foot` as anchor, layer `world`, `tint: 'player'` as `tint`, and the view's
  attach points riding on that part; every frame records `glow` (has `class="glow"`, so FF3 packs
  `@unlit`). The icon sprite is `generated/<theme>/icons.svg` with `<symbol id="icon-<id>">` (badge
  tiles included).
- [FF1] decision: portraits are made for every rig with a `class-<rig>` icon, front view, default pose,
  optional groups off (the Commander's banner too), as SVG: `<rig>-body.svg` draws color parts white
  (`currentColor`), `<rig>-mask.svg` is the color parts minus every part drawn after them (helm over
  plume), for CSS `mask-image` + multiply.
- [FF1] decision: `RunStats`/`RunSummary` live in `messages.ts` (phones show the summary); a summary
  award names the `RunStats` key it celebrates.
- [FF1] decision: lint: "no DOM" bans browser-only globals plus `localStorage`, `sessionStorage`,
  `Storage`, `navigator`, `fetch`, `WebSocket` (Node has them too); `systems/<name>` may import only
  packages and sibling systems (no `../../`), `party/` only packages and its own folder (no `../`).
  Fixtures in `src/host/{sim,systems,party}/__fixtures__/bad.ts` are lint-ignored and
  `src/host/__tests__/boundaries.test.ts` asserts every rule fires on them.
- [FF1] decision: `check-bundle` limits gzipped `play.html` JS per app (`PLAY_JS_LIMIT_KB`): Fort Frenzy
  100 KB; Sunny Side 18 KB (15.0 KB measured at FF1 + 20%). Its host-bundle Phaser sanity check now runs
  only once an app's `src` imports Phaser (Fort Frenzy's host is blank until FF3/FF7).
- [FF1] decision: `vercel.json` `ignoreCommand` is `git diff --quiet HEAD^ HEAD -- . ../../packages
  ../../pnpm-lock.yaml` (Vercel runs it in the project root, `apps/fort-frenzy`).
- [FF1] decision: `assets/LICENSES.json` entries take a `path` glob (relative to the app) or a `font`
  family; the test also fails on stale path entries, and checks the fonts against `brand/head.html`.
- [FF1] decision: Fort Frenzy tests live in `__tests__/` (theme parity at `src/shared/__tests__/`), and
  a Playwright smoke checks both entries load until the real smoke lands.
- [FF2] decision: systems declare their own structural types (`StatMod`, `TimedEffect`, `DamageCalcOf`/
  `DamageResultOf`, `FlowField`, `CardLike`) shaped like `sim/types.ts` and `content/types.ts`, since lint
  forbids importing those; ids are generics, so the sim passes its own values unchanged.
- [FF2] decision: stats: `StatCap` bounds Σ `addPct` (`pctMin`/`pctMax`) and also Σ `add` (`addMin`/
  `addMax`); scoped mods count only for their scope, unscoped ones always.
- [FF2] decision: effects stacking: `refresh` keeps one instance, longer timer, stronger strength;
  `strongest`: stronger replaces (its own duration), equal extends, weaker is ignored; `stack`: +1 stack up
  to `maxStacks`, longer timer, stronger strength, effective strength = strength × stacks. Periodic ticks
  fire every `tickEvery` steps from the apply, the last one included; times are steps (`msToSteps`, ≥ 1).
- [FF2] decision: damage: `applyDamage(calc, stages)` takes caller-supplied stage callbacks and fixes
  their order; the amount clamps at ≥ 0 after stage 4; `hpStage` reports `killed` only on the killing hit.
- [FF2] decision: cards: cards with `requires` (combos) are unique even if unmarked; ownership is an
  `owners` list (class + `'common'`); the rare roll is always drawn first; an offer short of commons fills
  with one rare; an offer shrinks when too few cards are eligible.
- [FF2] decision: waves: `cost` is per group of `groupSize` units; `guaranteed.count` counts groups paid
  from the budget, with optional `cost`/`groupSize` for ids outside the pool (boss; default 0 and 1);
  substituted types leave the pool and guaranteed ones become a random pool replacement (dropped if
  none); groups are shuffled, one per equal slice of the duration, unpinned ones dealt round-robin over
  the open lanes; a guaranteed lane that isn't open is ignored. ±1 of budget needs a cost ≤ 1 type.
- [FF2] decision: flow field: 4-neighbor Dijkstra; entering a tile costs `cost(tile)` (> 0, `Infinity` =
  impassable); `next` −1 = goal or unreachable (`dist` Infinity); optional `into` rebuilds in place.
- [FF2] decision: party: stages `lobby`/`build`/`combat` (combat = any non-build run phase); a device-ID
  match takes the new relay key (new room), other matches keep known ids; with nobody connected the
  leader stays, then the first back leads; ready needs name + class; auto-start = every connected player
  ready and ≥ 2; `startRun` slots everyone with a name and class (ready or not), the rest late-join;
  late slots are max + 1; name/class lock once slotted.
- [FF2] decision: the party test is co-located (`src/host/party/party.test.ts`): the party lint rule
  forbids any `../` import, so a `__tests__/` file couldn't import `../index`.
- [FF5] decision: the overlay (`src/host/ui/overlay.ts`) renders `TvView` into independent sections
  (HTML strings, cached per section), on a 1920 × 1080 root scaled by a CSS transform (FIT), integer font
  sizes. Host wiring (FF7) calls `createTvOverlay(el, { onHome, onRemovePlayer }).update(view)`; home focus
  and ◂ ▸ changes come back as `HomeIntent`s (the host owns `TvView.home`).
- [FF5] decision: until FF3's theme pack lands, `ui/labels.ts` carries the neon-knights names and icon ids
  the overlay needs (class, enemy, shop); FF7 may swap them for the pack's maps.
- [FF5] decision: enemy tiles in the next-wave preview stack the rig's side-view part SVGs from
  `art/neon-knights/enemies/` in rig order (no enemy portrait files are generated; only classes have them).
- [FF5] decision: TV remove in the lobby is keyboard: press a slot's number (1–6), then again within 4 s;
  Esc or another slot cancels. The gamepad (d-pad or stick, A) drives the home screen only.
- [FF5] decision: the HUD's wave and phase share one line ("WAVE 10 / 15 · COMBAT", "BUILD · 38 S") to fit
  the 40 px top band (§15.2); the next-wave preview is 77 px tall (bottom band), headlined with the enemy
  total or "Boss wave" (`TvView` carries no wave name), new types get a violet frame and a "NEW" tag.
- [FF5-fix-1] decision: C1 notes: lobby QR and "Scan to join" right-aligned (right edge x 1824); next-wave card grown to
  1160 × 156 (y 828–984, was 720 × 77) with 120 × 88 enemy tiles (was 52 × 38), 30 px counts; it overlays the
  playfield's bottom rows during build, SPEC §15.2 table and `PREVIEW_CARD` in `ui/layout.ts` updated.
- [FF5] decision: `index.html?ui=<screen>` screens: loading home lobby countdown combat low-hp boss build
  victory defeat summary restoring outdated; on in dev or with `?debug=1`.
- [FF4] decision: no `themes/<id>/shared.ts` exists yet (FF3), so `src/controller/copy.ts` holds the phone's
  names, icon ids, structure costs (placeholders: 2/3/1/1/2 until playtesting) and card text; FF3 should absorb it.
- [FF4] decision: sprite and portraits load via `?url`/`import.meta.glob` (`assets.ts`); the sprite is fetched and
  inlined at boot. Dev samples sit in a dynamic chunk (`?dev=1`, `?screen=<id>` picks one).
- [FF4] decision: revs reset on reconnect/host return (a reloaded host restarts its counters); `outdated` with a
  higher proto reloads once (sessionStorage guard), lower shows "Refresh the TV".
- [FF4] decision: `wishlist[].by` is read as a relay playerId (name fallback); class select lives in the lobby view
  ("Change class"); the name screen is the join screen (code + name + button) once connected.
- [FF4] decision: extraction candidate: `fitAboveKeyboard` (copied from Sunny Side into `screens/common.ts`).
- [FF4-fix-1] decision: the full-screen `.dev-panel` (z 22) covered `.dev-toggle` (z 21), so the picker
  could not be closed; the toggle now sits above it (z 23, panel bottom padding clears it). CSS only, the
  kit is unchanged; picking a screen still leaves the picker open.
- [FF3] decision: atlases rasterize at 0.6 px per sprite unit × scale (one 80-unit tile = 48 px at 1×),
  icons at 1 px per unit × scale (frames `icons/<id>`); frames are alpha-trimmed into Phaser JSON-hash
  atlases (`generated/atlases/<theme>@<s>x-<i>`), split into more bins only past 4096² (today one per
  scale: 873×880 and 1674×1667); a small built-in PNG encoder (no new dependency).
- [FF3] decision: frames are rasterized with root `color="#ffffff"` so grayscale `currentColor` tint
  parts multiply to the player color (resvg's default is black).
- [FF3] decision: `@unlit` recolors every color inside `class="glow"` groups (nested included, ink kept)
  to its side's dark shade: violet-hued (b > r, g) → `#2a2340`, everything else → `#3c4452`. Knights'
  separate `-glow` parts have no glow groups, so unlit/down dims them in code (fill tint `#4a5362`).
- [FF3] decision: rig validation checks each view/pose on its own (`order` = its parts exactly once,
  frame names, parents exist and form a tree, attach parts exist, default pose exists) and that every
  optional-group part exists in some view; poses may differ in parts (Ranger `ready` has no
  `paul-l`/`paul-r` in front, no `hands` in back), so no cross-pose part check.
- [FF3] decision: dev-only fallback shapes: `pnpm assets` is strict (build, test, typecheck fail on any
  error); `tsx scripts/build-atlases.ts --watch` rebuilds on art changes and only warns, and the renderer
  draws a labeled magenta box for any frame missing from the atlas (counted in `__pcgGallery.fallbacks`).
  `dev` still runs the strict one-shot `pnpm assets` (package.json is frozen for FF3), so watch is opt-in.
- [FF3] decision: typed keys: the script also writes `generated/keys.ts` (`FrameName`/`IconName` unions,
  atlas list); render code names frames only through `fk('…')`, `ik('…')` or the builders in
  `render/keys.ts`, so a wrong key fails the typecheck; asset-keys.test.ts also bans bare frame strings.
- [FF3] decision: clip units: `rot` in degrees (clockwise on screen), `dx`/`dy` in sprite units;
  fields interpolate linearly between the keys that set them; one-shots hold their last frame. A per-key
  `order` reorders the named parts within the slots they hold (a full list replaces the order); the
  Colossus walk passes full orders, swapping at the legs' crossings (u = 0.25, 0.75) with a 1.04 scale-up.
- [FF3] decision: the mortar is a structure: `mortar/idle` only, no walk; its tube aim is a code
  override on the rig (`RigSprite.override`), not a clip.
- [FF3] decision: aim snapping and facing use the world-ground angle (heads are modeled in 3D and turn
  about the vertical axis); sentry targets up-screen clamp to `l`/`r`.
- [FF3] decision: bloom is a custom hue-selective select pass (amber 25–54° and violet 238–280°, bright
  and saturated; never gunmetal, violet-iron, player colors or danger red) that renders at half size,
  then Phaser's Blur, in a ParallelFilters added with ADD on the world camera (layers 1–4). World UI and
  the HUD render through a second camera without filters. `BloomSelect.divisor = 4` is the quarter-res
  fallback if C1 finds it slow (Phaser 4 has no bloom filter: custom render node, §15.2 risk).
- [FF3] decision: shadow sizes in §2.5 (knight 22 × 13, Colossus 60 × 36) are read as radii in sprite
  units; the knight ring is 0.68 tiles (54.4 units, as in `review/carry-pips.svg`). Gallery hitbox and
  body sizes live in `render/gallery/rigInfo.ts` until content supplies them (FF6).
- [FF3] decision: the gallery is one Phaser scene per page (`rigs`, `turrets`, `citadel`, `autotiles`,
  `effects`, `icons`, `map`), state in the URL (`page`, `color`, `unlit`, `clip`, `hitbox`, `bloom`,
  `banner`, `gauge`, `carry`, `colossus`, `tier`, `lane-*`, `panel=0` hides the controls, `atlas=1|2`
  forces a scale); `main.ts` lazy-loads it, so the gallery chunk (Phaser) is split from the host stub.
- [FF3] decision: stress mode measures frame delta (mean, p95), CPU render submit (PRE_RENDER →
  POST_RENDER) and bloom via `EXT_disjoint_timer_query_webgl2` around the ParallelFilters pass, else
  alternates bloom on/off every 90 frames and reports the frame-delta difference. Headless Chromium has no
  timer query, so the bloom number is only meaningful on the C1 laptop.
- [FF3] note for C1: knight pivots (SPEC §14 #7) looked right in the gallery walk/hit/down clips at
  TV scale; judge them in motion at C1. Art notes worked around: the Commander's back view swings
  `swordtip` on `gauntlets`, footman side swings its blade hand only, Ranger back views move no strap.
- [FF4-fix-2] contract+: `src/shared/messages.ts` `Intent` gains `{ k: 'color'; color: PlayerColorId }`
  (lobby only; `isIntent` checks the id; SPEC §15.6 lists it). The phone only sends it and renders the
  color from `team`/`me`; the host rule (validate, swap, ack `taken`) is FF2-fix-1.
- [FF4-fix-2] decision: the kit's `bindGesture` is one element per machine with a fixed origin, so the
  floating aimed joysticks compose `aimedGesture` in `src/controller/aimZones.ts` (one zone over the
  right half, `pickZone` in `layout.ts`). Extraction candidate: a kit `bindZonedGestures`. `layoutCombat`
  is unchanged; its gap/edge/size rules still apply to the resting circles, and the zones are the
  nearest-edge partition of them (reach 56 px), so the rules hold for the floating buttons' rest state.
- [FF4-fix-2] decision: class select moves by transform, not native scroll-snap (momentum can pass cards);
  `swipeTarget` in `src/controller/swipe.ts` clamps any drag to one card (36 px or a fast flick).
- [FF4-fix-2] decision: Ready dims by disabling Change class, difficulty, Start, remove and the color
  swatches (Ready itself stays live to un-ready); the label is always READY. Dev mode applies a picked
  color locally (no host rule).
- [FF6] contract+: `src/content/types.ts` `BaseDef` (HP, repair per crate, damage stages, alarm, archers)
  and `RulesDef` (run timings, reaches, respawn points, stat caps, separation, knockback decay), with
  `Content.base`/`Content.rules`; `src/host/sim/types.ts` `Unit.push?` (knockback velocity) and
  `BaseState.stage?` (§3.3 damage stage as state). SPEC §15.3/§15.4 sketches updated.
- [FF6] decision: projectile speed: the Engineer's bolt, the pulse turret and the base archers fly at
  24 tiles/s (a 9-tile longbow shot lands in ~0.4 s); FF3-fix-1's speed line wasn't on `main` yet.
- [FF6] decision: slice content: the Engineer's build list is `['arrow_tower']` (bomb tower with FF8), waves
  1–2 are Grunts only (Runners join wave 2 with FF10), the shop holds only `crate` (2 coins, the depot price).
  Starting values: base 1000 HP, 100 HP per crate, 6 coins; kill coins = round(budget × coinIncome).
- [FF6] decision: run flow: 3 s countdown → build (45 s cap or every connected player ready) → combat →
  clear → build of the next wave; clearing the last wave in content is the victory (wave 15's boss once
  FF11 lands); victory 5 s / defeat 4 s, then summary. Every group spawns 3 s after its lane warning, so
  the first group arrives 3 s into combat. Projectiles and markers clear at each build phase.
- [FF6] decision: building at your feet ignores the builder's own body (§7's "no player on the tile" would
  forbid it); structure collision pushes the builder off. Flyers don't block placement.
- [FF6] decision: crates: a pickup takes as many as fit; a full-HP base takes no crate (row 2 falls through
  to rows 4–5); drops within 0.3 tiles merge into one pile; a dazed or dead player's crates drop unlocked.
- [FF6] decision: supers fire on release only when full (no queue), and a super's own damage doesn't charge
  the super. Steady Aim: `onTick` turns it on after 600 ms with the stick released; while on, a scoped
  `range` +20% mod, and main shots fired get a `steady` tag that `modifyOutgoing` boosts by 25%.
- [FF6] decision: melee wind-ups root the enemy and are called off if the player target goes dazed or
  down; path enemies attack the Citadel whenever its footprint is in reach; a knockback faster than
  1 tile/s overrides walking. Leash distance is measured from where the enemy left its path.
- [FF6] decision: §11.4 staleness lives in `FreshInputSource` (sim/sources.ts), counted in steps: the host
  pushes each phone sample with the tick it arrived at (FF7's PhoneInputSource can wrap it).
- [FF6] decision: commands `join`, `request` and `card` refuse with `invalid` until FF14/FF12; `buy` takes
  only `crate` (build phase). `Sim.spawnEnemy/place/addSoldier` are test/bench helpers that bypass the
  command log (not replayable); the host and debug panel use commands.
- [FF6] decision: replay file = JSON `{ v, build, start, steps, inputs: [tick, slot, input][] (changes only),
  commands: [tick, cmd][], hashes: [tick, hash][] (every 60 steps) }`, gzip optional;
  `tsx scripts/replay.ts --record <file> [--seed N] [--players N]` records an invincible autopilot run.
  The state hash skips derived state (spatial hash, flow fields, tile kinds) and the step's events.
- [FF6] decision: registered behaviors (`ai/`, `modules/`, `structures/`) import only types,
  `internal.ts`, `geometry.ts` and leaf helpers, never the registry, so `registry.ts` has no import cycle.
- [FF6] decision: perf: the bench's first profile spent ~40% in spatial-hash queries, mostly the turrets'
  nearest-enemy searches over 7-tile ranges; `nearestEnemy` now scans the enemy array (id order) and
  hash results use an insertion sort. Bench (Node, this machine): peak mean ≈ 0.6 ms, p99 ≈ 1.5 ms.
- [FF2-fix-1] contract+: `src/host/party/index.ts` `Party.setColor(playerId, color): ColorResult`, with
  `ColorRefusal = 'phase' | 'invalid' | 'taken'` and `ColorResult`; SPEC §11.1/§15.6 state the rule.
- [FF2-fix-1] decision: `setColor` reasons are already `AckReason` names, so FF7 acks them as-is: outside
  the lobby → `phase`; that player ready → `phase` (Ready locks lobby choices, like the dimmed swatches);
  another member (connected or not) holds it → `taken`; unknown player or color → `invalid`; own color →
  ok. "Swaps" in the `color` intent comment means the player's own color changes; two players never trade.
- [FF2-fix-1] decision: auto-assignment needed no change: it already takes the lowest brand-order color no
  member holds, chosen colors included; late joiners waiting mid-run can't pick (lobby only).

- [FF3-fix-1] decision: Artificer gauge fills from the bottom cell up (C1 note 1). The art numbers cells
  top-down (`core1` is the top cell), so cell k from the bottom is `core(4 − k)`: 1 crate = `core3-half`,
  2 = `core3-full`, 3 = + `core2-half` … (`render/gauge.ts`, `GAUGE_CELLS_BOTTOM_UP`). This overrides the art
  README's "cell N full at ≥ 2N"; FF9's gauge test must follow this order.
- [FF3-fix-1] decision: straight-shot speeds (C1 note 9), tiles/s: bolt 26, nanite-bolt 20, wasp-shot 16
  (`render/effectsMath.ts` `PROJECTILE_SPEEDS`). FF7 (Ranger bolt), FF9 (nanite bolts) and FF10 (Wasp shot)
  set `projectileSpeed` to these.
- [FF3-fix-1] decision: a stunned unit always plays idle, never walk (C1 note 11): wiring picks the clip
  with `locomotionClip(moving, looks)` (or `StatusSprites.locomotion`) every frame, and slowed units walk at
  `locomotionSpeed(looks)` (0.55). FF10 follows this.
- [FF3-fix-1] decision: Citadel destroyed transition API (C1 note 8): `Citadel.collapse(fx?)` plays it and
  returns its length (`CITADEL_COLLAPSE_MS`, 2400 ms), `collapsing` reports it, and the Citadel ends in
  `setDestroyed(true)` (rubble). Core implodes (0–380 ms), glow cuts out and frames go unlit, the keep sinks
  into its footprint while the rubble fades in, with sparks. FF7/FF14 call it on defeat.
- [FF3-fix-1] decision: down and death (C1 note 4) are solved collapse clips (`render/fall.ts`): each loose
  part's joint lands on the ground (riders: glow, color parts, add-ons on the same joint stay on their host).
  Knights' piles are per view (`down@side|front|back`, picked by `RigSprite` for its view; `down` is the
  side one); a downed Ranger should be in his `stand` pose. Wiring (FF7 knights): `play('down')`,
  `setUnlit(true)` at `KNIGHT_DOWN.dimMs`, `spawnPile(fx, 'ours', …, { holdMs })` at `clipLandedMs(clip)` for
  the down timer, then `play('respawn')` and `setUnlit(false)`. Enemies (FF10/FF11): `play('death')`,
  `setUnlit(true)`, `flash()`, `spawnPile(fx, 'theirs', …, { big })` at `clipLandedMs`, remove the rig when
  `clipDone`. The respawn is 1100 ms (was 700).
- [FF3-fix-1] contract+: `render/types.ts` `RigInstance.clipMs(clip)`, `RigInstance.clipDone`,
  `EffectSpawner.burst(…, delayMs?)`, `EffectSpawner.bodyBurst(kind, footSx, footSy, heightPx)`,
  `EffectSpawner.scrap(…, holdMs?)` (SPEC §15.2).
- [FF3-fix-1] decision: knight front/back legs move independently (C1 note 3) through a render-side split
  (`render/split.ts`): the one-piece `legs`/`legs-glow` frame is drawn twice, cropped at the hip pivot's x
  (1-unit overlap), as `legs.l`/`legs.r` (back view `legs.bl`/`legs.br`, whose step lifts the leg moving
  away from the camera); the near leg drops lower, grows and is drawn in front, swapping each step.
- [FF3-fix-1] decision: Scrap-mite scatter (C1 note 3) is `render/swarm.ts`: each mite of a pack follows a
  seeded wander around its slot with stops and clamped heading wobble; mites are separate rigs y-sorted by
  their own foot, so they re-layer as they pass (no per-key `order` needed inside a mite). FF10 places mites
  at pack center + `mitePose(m, t)`.
- [FF3-fix-1] decision: heal glints and nanite motes use `fx.bodyBurst` (3–5 seeded points over the body in
  separate lanes, staggered); turret muzzle flashes use `PulseTurret.fire(fx, rot)` (both barrels from II).
- [FF3-fix-1] decision: the Citadel's heavy smoke breathes (base alpha) and two copies of its plumes,
  cropped above y = 160 so the gate dimmer stays put, rise, swell and fade half a period apart (2.6 s).
- [FF3-fix-1] art note for C2: knights' side legs are one part (no knee): the forward swing shortens the leg
  (sy) and leads with the foot to read as a knee bend; a knee joint needs new art.
- [FF3-fix-1] art note for C2: the Bombard's foot pads are baked into its legs (no ankle joint) and its middle
  legs overlap: legs translate instead of rotating so pads stay flat, and the middle pair is pushed 5 units
  apart and steps half a cycle apart; separate pads and middle legs need new art.
- [FF3-fix-1] art note for C2: the Brute's and Colossus's legs are single parts (no knee or foot): the stomp
  is lift, slide and body drop; knees and feet would need new art.
- [FF7] decision: projectile speeds: FF6's 24 tiles/s differed from FF3-fix-1's bolt 26; content now uses 26 for
  the Engineer's bolt, the pulse turret and the base sentries (all drawn as bolts), and
  `src/host/__tests__/speeds.test.ts` keeps content equal to render's `PROJECTILE_SPEEDS.bolt`.
- [FF7] decision: the phone sends the live aim in `mainX/mainY` (`superX/superY`) while aiming, not only with the
  fire: the TV aim line needs a direction and the sim already reads `mainAim` as the held aim. Field meaning only
  (no shape change, no proto bump); the `messages.ts` doc comment and the SPEC §15.6 tuple comment say so.
- [FF7] decision: `PhoneInputSource` (`src/host/net/input.ts`) is its own wall-clock source (receive time,
  injectable clock), not a wrap of FF6's step-counted `FreshInputSource`, per §15.6 "receive time".
- [FF7] decision: the session (`src/host/net/session.ts`) connects a phone into the party on `hello` (key from the
  relay peer event, device ID from hello); `team`/`me` are compared as JSON and sent on change at most every
  200/100 ms, plus in full to a phone on every hello; `team` and `me` share one increasing rev counter.
- [FF7] decision: the slice's class intent accepts only content classes (the Engineer); others ack `invalid`
  until FF8/FF9. The leader's `end` intent (any option) returns to the lobby until FF14; `resume`, `newRun` and
  `claim` ack `invalid`. The sim's 3 s countdown is the lobby countdown (phones stay on the lobby screen).
- [FF7] decision: the TV canvas uses Phaser `Scale.NONE` and the same CSS transform as the DOM overlay
  (`ui/layout.ts` `fitTransform`/`fitToWindow`, tested; the smoke e2e checks the two boxes match).
- [FF7] decision: the join URL and QR use the TV page's own origin (open the TV on its LAN address); no LAN
  banner in the slice.
- [FF7] decision: home rows are Create, theme, difficulty (focus on Create, so Enter or A creates the room);
  Resume and New run join with FF14.
- [FF7] decision: the World scene restarts on every run start/end and draws nothing between runs; the overlay
  re-renders at 10 Hz or on a screen change; the debug speed-up tops out at 8×, with the catch-up cap sized for it.
- [FF7] decision: every run records a replay (`RunRecorder`); the download (gzip via `CompressionStream`, plain
  JSON otherwise) and the uncaught-error offer are debug-only (dev or `?debug=1`); `?seed=N` or the panel sets
  the next run's seed.
- [FF7] decision: next-wave preview counts are an estimate from the wave budget (the exact groups are rolled at
  combat start from the players connected then); knights' labels flip below the sprite above world row 4.
- [FF7] decision: world drawing and world UI live in `src/host/scene/` (`worldView.ts`), which the asset-keys test
  now scans too; rig sizes still come from `render/gallery/rigInfo.ts`.
- [FF7] decision: the TV advances the sim and syncs phones on its own 60 Hz timer (`Runtime.tick`), not on
  Phaser frames, so a starved GPU slows the picture, never the run; `frame()` only hands over what to draw.
  e2e freezes wall-clock sim time (`__pcg.speed(0)`) and steps it with `__pcg.advance` inside the TV page,
  runs the TV with `?bloom=0&fps=15` (software GL shared with the phone pages) and uses absolute URLs.
- [C2] v2 note: the Citadel collapse needs work (user, C2); the current one ships in v1, rework it in v2.
- [FF7-fix-1] decision: the Ranger's attack clip is draw (0–70 ms, the draw hand reaching from the bow to the
  anchor) → hold (to 100 ms, rails charging) → release at 100 ms (string snaps past straight and shivers, draw
  hand flies back past the ear, bow kicks, body rocks) → next bolt nocked and drawn back to the `ready` rest by
  440 ms; a shot already at full draw (`ready` pose, no one-shot playing: aiming or Steady Aim) starts at 70 ms.
  The Ranger keeps the shot's facing and pose for the whole clip. The super clip doesn't share the shot pose and
  is unchanged.
- [FF7-fix-1] decision: the `ready` bow-glow bakes the drawn string, nocked bolt and rails into one piece (no
  separate string part), so the clip darkens it during the draw and after the release and the slack/snapping
  string is code-drawn between the bow tips (`render/bowString.ts`, in the rig's overlay graphics, theme amber at
  the art's weight); the rails go dark with it until the next bolt is nocked. Art note: a separate string piece
  would keep the rails lit.
- [FF7-fix-1] decision: the bolt origin is render-only (`scene/shot.ts`), no sim change: a knight's main-shot
  projectile stays hidden until the clip's release (100 ms, or 30 ms from full draw), then launches from the
  rig's `bolt` attach point (the README's shot origin) at bow height and eases onto the sim position over 150 ms;
  super projectiles launch from the bow at once. The muzzle flash and tracer play at the bow on the release. A
  shot that hits within about 2.6 tiles lands before the release shows.
- [FF7-fix-1] decision: super ready is an amber ring (`theme.color.amber`, so the bloom picks it up) just outside
  the player's ring with a soft halo, pulsing 1.0→1.12 at 1.2 Hz like the phone's ring (§10.1) and drawn under
  the colored ring (`scene/superPulse.ts`, `GroundMarks.superRing`); the head badge is gone. SPEC §2.6, §10.1,
  §15.2, §15.4 and §15.11 #38–#39 updated.
- [FF7-fix-1] decision: `RigSprite` gains `partPoint`, `clipT` and `overlay()` (the class only, not the frozen
  `RigInstance`), and `rigMath` gains `attachPoint`/`partPoint`, which `attach()` now uses.
- [FF7-fix-1] decision: root cause of the flaky/slow smoke and reconnect e2e (FF7 bug, also failing on `main`): the
  World scene called `setColor` on every knight's nametag every frame; each Phaser Text set redraws its canvas and
  re-uploads the texture, a GPU readback stall under software GL that starved the TV page and the phones sharing the
  browser. Nametags now change only when their text or color does (`scene/tag.ts`), and the Ranger's string overlay
  is made on the first shot and cleared once after it; `scene/__tests__/frame-cost.test.ts` counts redraws across
  frames. The e2e specs are unchanged.
- [FF9] contract+: `src/content/types.ts` `AttackDef.shape` gains `'buff'` (hits nothing; the super's `effects` go
  on the attacker and his squad), `CharacterDef.super.selfEffects?` (attacker only) and `CharacterDef.supply?`
  (`crateDiscount`, `throwRange`, `throwSpeed`, `kitRepair`); `src/shared/ids.ts` `EFFECT_IDS` appends `haste`;
  `src/host/sim/types.ts` adds `ThrownCrate` and `World.thrown?`. SPEC §15.3/§15.4 sketches updated.
- [FF9] decision: squad steering is a straight line to the soldier's slot (a fan behind the Commander, or a ring
  around the planted flag) with the usual structure collision; no flow field was needed (risk fallback). Soldiers
  engage enemies within 3 tiles of themselves and 5 of their post; with the Commander down or dazed and no flag
  they hold. Their damage doesn't charge his super.
- [FF9] decision: squad size counts the boss waves (wave data `boss`) before the current wave; every build start
  fills each Commander's missing indexes at the base (the dead return, earned ones appear).
- [FF9] decision: a throw targets the nearest up, connected Engineer or Warden with room within `throwRange` (8);
  it flies at 12 tiles/s (at least 0.25 s), follows the receiver and lands on them; a receiver down or full on
  landing drops it there. No target: row 6 doesn't apply and the button falls through (none).
- [FF9] decision: starting values: crate discount 50% (rounded, at least 1: price 1); kit restores 250 HP and a
  full base takes none (like crates); Field Medic heals 3 HP/s within 2.5 tiles (himself included), combat only,
  charging 0.002 per HP (damage: 0.006 per point); only the Field Medic module charges from heals, so the super's
  healing never does.
- [FF9] decision: Quartermaster main is 4 bolts over 16° (blocked by walls and towers, the projectile rule); the
  super cone (110°, 8 tiles, nothing blocks it) heals other players 40 HP and gives towers `tower_defense` (+0.3
  damage reduction, 6 s, `PulseTurret.setDefenseBonus`) and deals no damage.
- [FF9] decision: Commander main is a 110° slash (1.4 tiles); morale (`buff`) puts morale (+35% damage and attack
  speed, 6 s) on him and his living soldiers and haste (+25% move) on him; Lead from the Front gives his soldiers
  within 3 tiles +25% damage (a 200 ms aura refreshed each step).
- [FF9] decision: the Quartermaster's and Commander's phone arc is Give alone (`[null, null, null, 'give']`), so
  the kit's single-slot radial gives on a 0.4 s hold and repeats every 300 ms (FF0); the TV arc never opens.
- [FF9] decision: render: the Artificer's bolts (via FF7-fix-1's launch path) and thrown cells leave from the
  `lens` point on the projector arm (C2: from the hand; the README's `pack` throw origin is not used). Support
  drawing lives in `scene/supportView.ts`, hooked into WorldView by a few lines; soldiers now lerp (game.ts
  captures them). Ring-adjacent marks stay unlike the amber super-ready stroke: the morale aura is a soft fill,
  the Field Medic circle is dots, the flag ring is its art.
- [FF10] contract+: `src/content/types.ts` `EnemyDef.ai` gains `'swarm' | 'brute'` (the deliverable's
  `ai/swarm.ts` and `ai/brute.ts` need their own registry ids); `src/host/sim/types.ts` `EnemyEnt.wander?`
  (a mite's in-sim jitter: drift, pace, re-roll tick). SPEC §15.3, §15.4 and §15.5 updated.
- [FF10] decision: `SimState.huntField(slot)` (internal, not frozen) builds the per-hunted-player ground field
  into `world.fields.hunted[slot]` on demand, rebuilt when that player's tile changes or the fields rebuild.
  A Hunter hunts the nearest targetable player (ties by slot), retargets the same way on down or daze, runs
  straight at its quarry within 1.5 tiles, and with nobody up walks the ground field and attacks the base.
- [FF10] decision: a Runner's burst kills it with itself as the killer: no coins (§9.1 pays kills) and the
  `death` event carries `killer: null`. A damageable blocker on its next tile (wall, tower) takes the burst
  instead of the base (walls answer Runners, §9). Players never stop or take a burst.
- [FF10] decision: melee can't hit Flyers is enforced in the damage pipeline (`melee` damage to a flying enemy
  deals 0, no event), so FF8/FF9 melee needs no per-attack check.
- [FF10] decision: enemy straight shots (`side: 'theirs'`) also hit the Citadel when they reach its footprint;
  they never hit structures (the Wasp flies over them). Siege shells are an arcing projectile (drawn, apex
  2.5 tiles, 6 tiles/s, ≥ 0.6 s) plus a `circle` danger marker created at the shot (the damage, landing on
  players, soldiers, structures and the Citadel); the muzzle charge during the 700 ms wind-up is the tell.
  Siege targets the nearest tower (arrow or bomb) in range, else the Citadel, and shells a blocker on its path.
- [FF10] decision: a Brute is a `path` walker on the breaker field; while chasing or walking back it smashes a
  wall it walks into (2×), then the leash check sends it back to its path (its target was the wall).
- [FF10] decision: a stunned enemy (any `stun` effect) stands still and loses its wind-up in `stepEnemies`;
  FF8 supplies the `stun` effect itself.
- [FF10] decision: a Swarm group spawns scattered in a 0.9-tile disc (combat stream); a group pays once even if
  several mites die in the same step. The debug panel's spawn sends a whole group (8 mites) and refuses ids
  without content (the Colossus until FF11).
- [FF10] decision: enemy parts aren't emissive, so tell flares (Brute furnace, Bombard and Wasp muzzle, Stalker
  eyes) and the Skitter core throb (0.8 Hz far → 5 Hz at the base, by distance) are violet glows drawn at the
  rig's attach points on the effects layer (`scene/enemyFx.ts`); the Skitter's walk keeps its pace. Enemy shots
  leave from the rig's `muzzle` (FF7-fix-1's `anchorToWorld`) with a `muzzle-theirs` flash, the offset fading
  over the flight. Wasps draw at `WASP_HOVER_TILES` over their ground point (the sim's `z` isn't drawn), the
  shadow 0.75× on the ground. Mites take `mitePack` size, pace and phase per entity (jitter is in the sim).
- [FF10] decision: waves (budgets for 2 players at Normal): 8, 12, 16, 22, 12 (boss), 26, 30, 34, 40, 28 (boss),
  46, 58, 54, 68, 34 (boss); 30–90 s each (~16 min of combat). Every pool holds the Grunt (cost 1) so spend
  lands within ±1. Boss waves carry `boss: { id: 'colossus', mk }` with escorts per §9.2; until FF11 the boss
  doesn't spawn and the content test only checks the id is a known `EnemyId`.
- [FF10] decision: the determinism test's two-wave runs use the first two waves of content (so they still end
  in the summary); a new test replays a minute of wave 14 (every AI) twice; the replay test records 3 minutes
  (`maxSteps`), not the whole 15-wave run, to stay inside Vitest's timeout. The bench's peak crowd is the mixed
  roster with unbreakable towers and footmen (peak mean ≈ 0.38 ms, p99 ≈ 1.0 ms on this machine).
- [FF9] decision (reconnect e2e after the FF9 merge): the rejoin `me` snapshot is unchanged and valid (a session
  test now pins it), so the suspect is frame cost: the trace shows every page starving once the run starts.
  SupportView's two graphics are now made on first use and cleared only after drawing (`scene/support.ts`
  `Scratch`), so a run without support classes adds no per-frame GPU work over FF7-fix-1. The early steps
  (page creation 7.6 s, home 8.7 s) were slow too, so machine load may be part of it.
- [FF8] contract+: `src/content/types.ts` `StructureDef.defense?` (Fortify's damage reduction, 0.35) and a doc
  comment on `EnemyDef.slowResist` (fraction resisted; Brute/Colossus 0.5); `src/host/sim/types.ts`
  `AttackState.windupAim?` (a wound-up player attack's direction); `src/host/render/types.ts` optional
  `EffectSpawner.arcWave?` (sector shockwave). SPEC §15.2–§15.4 sketches updated.
- [FF8] decision: player `arc` attacks wind up in the sim (`windupMs`): the `attack` event goes out at the press,
  the hit lands when the wind-up ends, and the player is rooted meanwhile; a super released during a wind-up is lost
  (no queue, as before). Slam 200 ms, stomp 320 ms = the clips' impact frames (`speeds.test.ts`). Dying or the
  phase ending calls a wind-up off. A landing wind-up goes through `classes/warden.ts` `landArc` (its stun and
  knockback) on FF9's `inSector` test; arcs without a wind-up (the Commander's slash) stay on FF9's shapes.
- [FF8] decision: stun skips the enemy's AI (no walking, no swings; a swing winding up is lost) and zeroes move
  speed; slow is a `moveSpeed` −strength mod, `strongest` stacking. `slowResist` scales any slow in
  `applyEffect` (FF8 set the Brute's to 0.5 after FF10 landed; FF11 sets the Colossus's).
- [FF8] decision: a net discharges when a ground enemy's inner half (radius × 0.5) overlaps its tile, slowing every
  such enemy; it rearms after 0.5 s and keeps discharging while enemies stand on it. A fizzled net is removed in
  the deaths pass with no `destroyed` event (its `snareDischarge` with `left: 0` says so) and no rebuild.
- [FF8] decision: Fortify isn't a tile of its own: it attaches to the nearest unfortified tower whose tile is within
  0.75 tiles of the builder (you can't stand on a tower), as the `fortified` flag plus a `damageReduction` mod; the
  `built` event carries the tower's id and tile. The build ghost and the phone's `build.valid` use the same target
  (`buildTile`). Towers it attaches to: `FORTIFIABLE` (= content `attachesTo`, tested).
- [FF8] decision: Mason repairs walls within 2.5 tiles at 10 HP/s (`auraRadius`/`repairRate` stats, scope
  `passive`, so Master Mason can raise them) in combat only, while the Warden is up and connected; repairs are not
  heals (no events, no healing stat). The TV draws its sparks from the hammer to each damaged wall in reach.
- [FF8] decision: the mortar lobs at the nearest ground enemy's position (no lead) at 6 tiles/s ground speed, at
  least 700 ms of flight, starting at muzzle height (0.8 tiles) with a 1.4 + 0.3·d apex (`shellAt`, shared by sim
  and render); it bursts on its landing step over its radius (1.3). The TV eases the shell off the barrel tip
  (`shellOrigin`, the FF7-fix-1 launch path) and draws a blast ring sized to the radius where it lands.
- [FF8] decision: starting values: Warden 170 HP, 3.8 t/s; slam 30 dmg, 1.5 tiles, 120°, 800 ms, knockback 0.5;
  stomp 45 dmg, 3.2 tiles, 100°, stun 1.4 s; super fills at 160 damage. Wall 300 HP; mortar 220 HP, 32 dmg, 4.5
  range, 2 s. Costs match the phone's copy (turret 2, mortar 3, wall 1, net 1, Fortify 2; the net ties the wall
  as cheapest), checked by content.test. The Engineer's build list is now turret, mortar.
- [FF8] decision: structure drawing moved out of `worldView.ts` into `scene/structuresView.ts` (turrets, mortars,
  wall and net fields, build sketch/fill and collapse from `render/buildFx.ts`, shells, Mason sparks); the
  Warden's impact shockwave is `scene/wardenFx.ts`. Per frame it changes alpha, crop and scale only; the wall and
  net fields rebuild only when their tiles or states change (the FF7-fix-1 frame-cost rule). Charged walls draw
  once `spiked_walls` is owned and strike back at an attacking enemy (the damage is FF12's).
- [C3] decision: C3 notes routed by owner: floor color → FF3-fix-2 (map render/theme); aim previews for all
  knights plus Warden and Ranger range numbers → FF7-fix-2 (aim lines are FF7 world UI; one owner avoids
  parallel edits to the same aim code); Commander passive/super visuals → FF9-fix-1; Wasp motion, Hunter
  pathing/indicator and the flow-field shape → FF10-fix-1 (the FF2 flowfield change rides with the Hunter field
  work). Fixes run in parallel with FF11–FF13 at the user's request; rebase conflicts per §2.
- [C3] v2 note: Hunter v2 behavior (user, C3): walks in and finds a spot no tower can hit; targets and attacks
  any player within the Ranger's range; otherwise waits until a player drops below 50% HP (always targeted) or a
  Brute spawns, then walks slowly behind the Brute as a shield until close to a player.
- [FF9-fix-1] decision: "the circle beneath them" (C3) is the morale aura circle, drawn under the Commander and
  every footman (footmen have no player ring, and the ring is the player's color, not amber); the Commander's
  player ring is left alone, which also keeps clear of FF7-fix-2's ring/aim code in `worldView.ts`.
- [FF9-fix-1] decision: motes and the flash live in `scene/support.ts` (pure: `leadTargets`, `MoteStream`,
  `moteDrift`, `superFlashOn`) and `scene/supportView.ts`; no render contract change. Between flashes the aura
  shows its old fading alpha, so it still doubles as the timer (SPEC §15.11 #40).
- [FF7-fix-2] decision: one hit-shape source, `sim/classes/hitShape.ts` (`hitShape(attack, stat)`): a single
  bolt is a `line` of its range, arcs, cones and spread volleys (count > 1) a `cone` (range, half the arc or
  spread), circles a `circle` (radius), buffs `none`. The sim's sector tests (`sectorOf`, the Warden's
  `landArc`) now read `sectorGeometry` from it; the TV's preview is `aimPreview(p, def, slot, rules)`
  (`sim/preview.ts`): the same function through `attackStat` with the registry's effects and the run's stat
  caps, so content tuning, passives (Steady Aim) and FF12 card stat mods move the preview with the hit. Not
  covered: an `onAttack` hook that changes a volley's count or spread (the preview reads the def's).
- [FF7-fix-2] decision: preview look (`scene/aimPreview.ts`): a single bolt keeps the dashed amber line (world
  UI); cones are a transparent amber-filled sector with a thin amber edge and circles a filled 0.6 ground
  ellipse, on the ground-overlay Graphics under the units (fill α 0.16, edge α 0.45: amber over the dark floor
  stays below the bloom's 0.72 value cut, so it never floods the bloom). Drawn into the scene's existing
  Graphics with a reused frame object; the §2.5 projection is linear on the ground, so vertices are center +
  scaled offsets, no per-vertex allocation.
- [FF7-fix-2] decision: previews draw whenever a phone holds an aimed button (main: Ranger, Artificer; super:
  Warden, Artificer), from the shape alone, so a button made aimed later previews with no render change. A
  super previews only once it is charged (a release while charging does nothing, §10.1). The Warden's slam
  and both Commander buttons are tap buttons (§10.1 table): nothing is held, so nothing to preview; the C3 note
  "Warden's main attack … the entire cone" is met by the aimed stomp's cone (making the slam aimed would be a
  phone change, out of scope here; ask at C4 if the slam should become aimed).
- [FF7-fix-2] decision: C3 tuning (content only): Warden slam range 1.5 → 1.75 tiles, arc 120° → 102°; Warden
  stomp range 3.2 → 3.7, arc 100° → 85° (each ~15% narrower, ~15–17% longer); Ranger super radius 3 → 3.5
  (+17%; "range" of a circle around him is its radius). Pinned by `content/__tests__/c3-tuning.test.ts`. The
  stomp scenario's out-of-arc Grunt moved from (12.5, 15) to (12, 16.5): the longer stomp reached it.
- [FF3-fix-2] decision: floor #262b33 → #62676f because the violet-iron hulls (#2a2340, #3a3150, #4a4068,
  #4f4570) sat at the old stone's luminance (1.0–1.2:1, ink outlines 1.35:1), so enemies vanished, mites and
  Skitters worst (C3). Measured (WCAG ratios, `floor-contrast.test.ts`): ink outlines 3.4:1; area-weighted
  bodies mite 2.3, Skitter 2.1, Drone 2.0, Brute 2.1, Bombard 2.1, Stalker 1.9, Colossus 1.9, Wasp 1.9 (it also
  has its ground shadow); glows stay brighter (violet 1.55, amber 2.6, hostile core 3.1); bloom weight 0 for
  every lifted map color; shadows go from invisible (1.1) to 1.65. Lighter (#6a6f77+) pushed violet glows and
  danger red under 1.4:1 and knights' tops into the floor, so this is the balance point. Drawn as an ADD tint
  of 0x3c3c3c on ground, edge and decor frames (seam and hash steps unchanged, lanes untinted); no art edits.
- [FF3-fix-2] contract+: `ThemeHost.map.floorLift?: number` (0xRRGGBB added to ground, edge and decor frames);
  SPEC §15.4 block, §15.2 Map, §15.11 #43.
- [FF3-fix-2] decision: player rings and their notch get an opaque `brandInk` edge (1.5 px each side) because
  cobalt (1.0:1) and forest (1.1:1) match the new floor's luminance; every player color is ≥ 3.1:1 on the ink (cobalt 3.19), the ink 3.2:1 on the floor.
- [FF3-fix-2] decision: red danger markers get a `brandInk` edge at 0.85 under the red ring because red fell
  from 3.3 to 1.4:1 on the new floor (red ring 3.6:1 on its edge, edge 2.8:1 on the floor).
- [FF3-fix-2] decision: the Stalker target thread is `hostileCore` at 0.5 (was `hostile` at 0.32) because the
  old thread fell to 1.13:1; now 1.8:1 (old floor: 1.5:1), still faint, world UI so never bloomed.
- [FF3-fix-2] decision: the bloom's band edges moved to `render/bloomPick.ts`, and the select shader is built from
  them, so tests check colors against the same threshold.
- [FF3-fix-2] note for C4 (measured, unchanged): knights' #5c6676 tops sit near the floor (1.0:1; their ink
  outline carries the silhouette); translucent amber, danger and build-ghost fills lose contrast on the lighter
  floor (their full-alpha strokes carry them); `plate/tile` and lane breaches keep the old dark stone, so
  structure plates read as dark sockets; near-opaque amber (≥ 0.85) blooms a little more over the lighter floor.
- [FF10-fix-1] contract+: `src/host/systems/flowfield/index.ts` `buildField(…, into?, opts?: FieldOptions)`
  (`diagonal`, `solid`; default stays 4-neighbor, so FF2's tests hold as written) and `steerTile(field, from)`
  (+ `STEER_LOOKAHEAD` 32, `STEER_HALF_WIDTH` 0.3); `src/host/sim/types.ts` `EnemyEnt.huntSince?` (tick of the
  Hunter's current quarry). SPEC §9, §9.6, §15.2, §15.5, §13 and decision rows updated.
- [FF10-fix-1] decision: Wasp jitter root cause was render, not sim: `worldView.drawEnemies` drew the ground
  point with z = 0 lerped from `prev` (which holds the sim's flyer z = 1), so its screen y swung by up to a tile
  with the accumulator's phase every frame. Fixed with `scene/interp.ts` `lerpGround`; the sim test shows a
  Wasp's progress was already monotone.
- [FF10-fix-1] decision: flow-field shape: the sim builds 8-neighbor fields (no corner cutting past blockers or
  impassable tiles) and every walker steers at `steerTile` (farthest chain tile a ±0.3-tile corridor reaches
  through tiles no costlier than the next step; cached per tile until the rebuild). Lanes now walk within
  0.13 tiles of the straight line (was 7.7, path 1.33× straight).
- [FF10-fix-1] decision: Hunter threat: `ai/threat.ts` counts attackers (structures with an `attack`, the present
  sentries) covering each tile within range + 1 (`THREAT_PAD`: a tile's half-diagonal plus a body; 0.4 still let
  a corner graze the range); the hunted field adds 4 (`THREAT_COST`) per attacker. Recomputed in
  `rebuildFields`, which `startCombat` now also calls (range cards, sentry buys). Peak bench mean 0.44–0.48 ms.
- [FF10-fix-1] decision: Hunter retarget hysteresis `RETARGET_TILES` = 2: another player must be 2 tiles closer
  (straight-line) than the current quarry to take over; down, daze or leaving still retargets at once.
- [FF10-fix-1] decision: the target flash is a pulsing ring (4 pulses, last 500 ms fading, `HUNT_FLASH_MS` 2000)
  in the quarry's color on WorldView's per-frame ground graphics (one shared object, no per-ring allocation),
  timed from `world.tick − huntSince`.
- [FF11] contract+: `src/host/sim/types.ts` `BossAct` and optional `EnemyEnt.boss` fields `act`, `ready`, `stunAt`
  (the attack winding up, per-attack ready ticks, the last counted stun). SPEC §15.3 sketch updated.
- [FF11] decision: content's `boss.module` names the `bosses` registry (content.test checked `modules` before), the
  `boss` AI kind dispatches to it, and tuning lives in `boss.params` (content/balance.ts). Boss-wave rules shared by
  any boss are `sim/boss/index.ts`: the boss spawns alone up the wave's first lane right after its lane warning; its
  Mk is the wave data's (debug spawns: by wave number); HP × player-count multiplier at spawn, then × Mk (II 1.6,
  III 2.4) by the module; once no boss is alive the other enemies collapse as their own killers (no coins), and
  pending spawns, markers and enemy shots are dropped, so the usual "wave cleared" check ends the wave.
- [FF11] decision: starting values: Mk I 2500 HP, 0.585 t/s, radius 0.9; slam 60 dmg, 1.5-tile circle 0.7 past its
  body, 1.5 s wind-up (always 90 steps, the final phase too: the design rule's clear tell), 2.5 s cooldown; walls 3×,
  the Citadel 1.5×; boulder (Mk II+) 1 s wind-up, 8 t/s lob, 45 dmg, 1.2 radius, range 2.5–9, every 7 s (first after
  3.5 s); final phase 1.35× speed, 0.6× cooldowns, 5 rings of 0.8 tiles every 130 ms (25 dmg, players and soldiers
  only), 5 Runners every 6 s; 10 coins for the kill.
- [FF11] decision: it keeps to its breaker-field path and never chases: it slams a player or soldier within reach,
  a wall (wall breaker) or tower its body walks into (its radius spans tiles, so it checks its whole leading edge),
  or the Citadel. Boulder target: the largest group of 2+ players within 2 tiles of one of them, else the nearest
  tower, else one player. Mk II and III bring 2 Grunts and a Swarm pack beside it at spawn (§9.2 escorts, on top of
  the budget).
- [FF11] decision: stagger: damage fills 3 meters per max HP (a third of its HP fills it), a stun adds 0.25 but only
  one stun counts per 2.5 s and none while staggered; stuns and knockback never apply. Full: 3 s down, +50% damage
  taken, the wind-up and its marker called off, meter back to 0. A Warden stomping as fast as he can staggers it
  about a third of the time (boss.test).
- [FF11] decision: render: `scene/colossusView.ts` drives the Colossus from `EnemyEnt.boss` (clips offset to the
  sim's act start so they stay in step; hits flash but don't replace its own clips); glows (core by meter, fists,
  spires, plumes) are drawn at attach points (enemy parts aren't emissive); ring markers aren't red fills but one
  violet outline rolling on the sim's band; the boulder leaves `fist-near`. No walk ground shake (a camera shake moves
  every world layer; left for C4). Gallery: a `colossus` page (4 tiers × 8 clips) and the
  rigs page's clip list gains `slam`, `throw`, `call`, `stagger`.
- [FF12] contract+: `src/host/sim/types.ts` `HealCalc` and `Hooks.modifyHeal` (Triage changes a heal before it
  lands); `src/host/sim/events.ts` appends `{ e: 'faultLine'; slot }` (the TV flashes every wall). SPEC §15.3.
- [FF12] decision: offers: every build phase deals one (the one before wave 1 too), from `offerRng(seed, wave,
  slot)` so a recomputed offer matches; combos count as rares (at most one of either per offer); an offer not
  taken is gone at combat start (cards are free). Flyer eligibility reads connected ranged players, the wave
  start's substitution rule, so Skyhunter drops out when the only ranged player is disconnected.
- [FF12] decision: unique cards are Light Load (spec), Unshakable, Overflow, Triage and the combos; every other
  card stacks, and modules get `stacks` (bonus × N, Volley one shot sooner, Piercing one more pierce).
- [FF12] decision: stat cards scope to their button so aim previews read effective values: Quick Draw
  `projectileSpeed` main, Blast Radius `radius` super, Heavy Slam/Bladework `arcDeg` main, Earthshaker `stunMs`
  super and Rally Cry `durationMs` super (effect durations scale when fired), Deadeye `durationMs` passive (the
  Steady Aim wait), Master Mason `repairRate`/`auraRadius` passive. New caps: `respawnMs` Σ add ≥ −5000 (5 s
  floor), `durationMs` Σ pct ≥ −0.8.
- [FF12] decision: Bulk Buyer is "every 3rd crate the Quartermaster buys is free" (one sooner per stack): coins
  are whole numbers and the 50% discount already sells at the 1-coin floor, so a bigger `crateDiscount` would
  change nothing.
- [FF12] decision: Wildfire and Plague spread from the burn/poison effect's `onDeath` when the effect's source
  owns the combo (1.6 tiles, 3 s, the dying enemy's strength); burn ticks 3 every 0.5 s (≤ 3 stacks), poison 2
  every 1 s (≤ 5).
- [FF12] decision: Overflow is a `shield` effect whose strength is the HP it absorbs (damage stage 5), topped up
  additively to 40 HP and 6 s; with Overflow, Field Medic heals full-HP players too (as shield).
- [FF12] decision: squad cards put small `squad:*` modifiers on the Commander's soldiers that read his live
  stacks; Veterans survivors are the soldiers alive at combat end (+10% max HP and damage per wave, max 5;
  replacements are new entities); soldiers with modifiers refresh their stats every step.
- [FF12] decision: shop upgrades are `shop:<item>` modifiers fitted on purchase and on creation (structures,
  soldiers, the base); a higher max HP comes in full. Charged walls deal 10 back to any non-dot enemy hit
  (source: the wall). Snare charges add 2 discharges a tier to every net, built ones included.
- [FF12] decision: shop rules not in the spec: squad stats sell one tier per regular wave cleared, shown only
  right after a regular wave; hold-to-confirm at a price ≥ 10 (`HOLD_CONFIRM_PRICE`); repair at full HP, sold-out,
  hidden or (for others) Quartermaster-only items ack `invalid`, a second held kit `cap`; requests only for
  visible items; phone crate buys aren't announced (personal inventory); a repeatable purchase announces tier 1.
  Starting prices: repair 4→14 (+2 a buy, 150 HP), sentry damage/range 8, third archer 12, turret rate and
  mortar radius 6/10/14, tower HP 5/8/12, wall HP and snare charges 4/7/10, charged walls 10, base armor
  8/12/16 (+0.1 DR a tier), kit 6, squad stats 5 + tier.
- [FF12] decision: difficulty was already baked at spawn since FF6 (enemy HP and damage, base HP, kill coins,
  wave budget); FF12 keeps the values and tests the Easy < Normal < Hard order.
- [FF12] decision: render: every structure of an upgraded type (and every wall on a Fault Line) flashes white
  for 220 ms with sparks while its new parts are already on; `whiteFlash` lives in `render/rig.ts` (it needs
  Phaser at runtime, and `render/structures.ts` must stay Node-safe for its tests). The mortar gains the
  defense-bonus pips; the Overflow icon sits right of the HP bar; the TV wishlist names the next tier.
- [FF7-fix-3] decision: Warden and Commander mains are aimed (user, C3 follow-up); quick tap still auto-aims.
- [FF7-fix-3] decision: content only plus the phone copy: `input.main: 'aimed'` (warden, commander) and
  `CLASS_INFO` mode `aim`; the sim already fired every shape along the tuple's aim (0,0 = nearest enemy in
  range, else facing) and the TV already previewed any held aim from `hitShape`, so no sim, render or contract
  change. A controller test pins copy modes to content input kinds. A hold past 150 ms that never leaves the
  dead zone cancels (the kit's aimed rule, §15.7), same as the Ranger and Artificer mains.
- [FF7-fix-3] decision: FF12's Heavy Slam, Bladework (arcDeg +20%, main scope) and Reach are stat mods, so
  they reach both the sim's sector and the aimed preview through `hitShape`; `sim/__tests__/aimPreview.test.ts`
  picks each real card and probes the aimed reach and edge. Aftershock drops its zone along `atk.aim`, the aim.

- [FF13] decision: SFX picks are by name only (not auditioned); swap in `scripts/pick-sfx.ts` `PICKS` and rerun. Cue gate: `Cue.when(e, kindOf)` takes an entity-kind resolver from the world; `marker` is the boss wind-up cue (no new SimEvent added); `purchase`/`cardPicked` already exist. Player: per-cue volume + max-per-window cap in `TUNING`; `createSfx(ThemeHost.sfx)` preloads behind the home bar (min of atlas and audio progress in `main.ts`), unlocks on first key or pointer.
- [orch] note for FF15: on main after FF10-fix-1/FF11/FF12 the Sim bench peak runs mean ~0.70 ms but p99
  2.09–2.28 ms (measured while other agents loaded the machine); FF15's Acceptance needs p99 ≤ 2 ms at peak,
  so profile the new 8-neighbor flowfield + Hunter tower-cost field, boss and card hooks first.
- [orch] cleanup for FF15: FF3-fix-2's Stalker-thread color (`THREAD_ALPHA`) and its test are unused since
  FF10-fix-1 removed the thread; delete both.
- [balance] decision (user, SPEC §15.11 #48): every balance number lives in `src/content/balance.ts`. The eight
  domain files (`base`, `difficulty`, `characters`, `structures`, `enemies`, `waves`, `cards`, `shop`) are merged
  into it in that order, under section headers; `map.ts` stays. Constants that leaked into the sim moved there
  with their values unchanged (replays and hashes are the same): Hunter close range, retarget, threat cost and
  pad (`hunter.hunt`); Swarm drift, pace and re-roll windows (`swarm.jitter`); Bombard shell speed and minimum
  flight, mortar minimum flight (`attack.speed`, `attack.minFlightMs`); snare trigger (`triggerFraction`); squad
  engage, leash, hurry and formation (`commander.squad`); crate throw minimum flight (`supply.throwMinFlightMs`);
  Colossus boulder minimum flight and slam reaches (`boss.params`); and in `rules` the projectile hit radius,
  enemy swing and shot slack, Fortify reach, card offer size and rare chance, burn and poison ticks and stack
  caps, and the Wildfire/Plague spread. Card and passive module params that only had code defaults (aura
  refresh `auraMs`, Aftershock `maxSlow`/`reachPct`, Fault Line `touch`, Volley/Bulk Buyer `minEvery`) are now
  in content. Modules read params through `num(p, key)`, which throws on a missing one; the sim reads optional
  content fields with `!`, not a fallback; content.test builds every module and checks those fields, and pins
  the phone card copy's numbers (Skyhunter, Volley, Triage…) to content. `RARE_CHANCE` left `sim/index.ts`.
  What stays in code is plumbing: `SIM_HZ`, flow-field steering (`systems/` can't import content), spatial
  hash, physics thresholds, spawn scatter, render-only arc heights, the autopilot's heuristics.
- [balance] contract+: `src/content/types.ts` `AttackDef.minFlightMs?`; `CharacterDef.squad` `aggro?`, `hurry?`,
  `formation?`; `CharacterDef.supply.throwMinFlightMs?`; `EnemyDef.hunt?`, `jitter?`; `StructureDef.triggerFraction?`;
  `RulesDef` `projectileRadius`, `enemySwingSlack`, `enemyShotSlack`, `fortifyReach`, `cardOffer`, `dots`,
  `comboSpread` (only content builds a `RulesDef`). `sim/types.ts` `EffectDef.maxStacks`/`tickEveryMs` stay but are
  unused (`rules.dots` replaces them). SPEC §15.4 sketch updated.
- [orch] decision (user, early C4 notes, 2026-11-05): FF7-fix-4 (aim line on cancel) and FF10-fix-2 (Wasp height, body hitboxes incl. the Colossus) run in parallel with FF14 ∥ FF15; the user is re-picking the SFX themselves, so no fix milestone touches audio picks.
- [orch] decision: since the Changesets setup on main, every FF branch that changes shipped code commits a `.changeset/*.md` note (`pnpm changeset --<level> @pcg/fort-frenzy -m "…"`); FF14 minor, FF15 and fixes patch.
- [FF14] contract+: `src/host/sim/snapshot.ts` `SnapshotStructure.owner?` and `RunSnapshot.runMs?` (plus the
  `takeSnapshot` / `parseSnapshot` / `resumeStart` / `restoreSnapshot` functions); `src/host/party/index.ts`
  `PartyScreen` gains `'claim'`, new `RestoredSlot` and `Party.restore` / `claimable` / `claim`. SPEC §15.6, §15.8 updated.
- [FF14] decision: the snapshot round-trip test checks that a restored world gives the same snapshot back and that
  every restore of one snapshot has the same state hash (and plays on identically); the live world's hash can't
  match, since the frozen snapshot holds no positions, cooldowns or tick.
- [FF14] decision: a resume restores the build phase with its full timer and the knights at the base (the
  snapshot holds neither); combat progress since the build start is lost (§11.5).
- [FF14] decision: the sim's `join` command takes a late joiner in any phase; the party alone gates late joins to
  the build phase, so the two never disagree about who is in.
- [FF14] decision: a late joiner joins by tapping Ready on the lobby screen in a build phase (name, class, Ready),
  not automatically.
- [FF14] decision: phones send `hello` again when the TV comes back (`host` `back`), since a reloaded TV has no
  party in memory and matches saved slots by the relay key from the reclaim roster.
- [FF14] decision: claims are open for any restored slot no phone has matched, in a reclaimed room as well as a new
  one; an unknown phone sees `claim` while such a slot exists.
- [FF14] decision: the snapshot autosave checks every 250 ms in the build phase and writes only when the snapshot
  changed (one rule covers commands, crates moved and debug changes); build start and `pagehide` write at once.
- [FF14] decision: Play again marks every connected player Ready (auto-start); Return to home kicks every phone,
  closes the client and drops the `pcg:hostToken:fort-frenzy` session key so the next Create gets a new code; the
  phone shows "The TV went home" for a kick while the summary is up.
- [FF14] decision: the TV shows the Resume / New run choice on the home screen (rows from `HomeRow`), with the
  room code once the relay answers; the build HUD shows the room code for late joiners. `TvScreen` `restoring`
  stays unused.
- [FF14] decision: replays build an input source for every slot in the recording (late joiners have no start
  slot).
- [FF10-fix-2] contract+: `src/content/types.ts` `EnemyDef.body?: { radius; bottom; top }` (every enemy has
  one; the sim throws without it); `src/host/sim/types.ts` `SpatialHash.queryBox(x0, y0, x1, y1, out)`.
  SPEC §2.5, §9, §9.6, §15.2, §15.3 step 6, §15.4 sketch and §15.11 #50 updated.
- [FF10-fix-2] decision: a body hitbox is the content body (drawn tiles above the feet, measured off each
  rig's part bboxes at rest: torso, head and legs) swept up the screen as a ground capsule (`sim/body.ts`:
  `lo` = bottom / 0.6, `hi` = top / 0.6 − r, so its cap reaches the drawn top), symmetric about the feet
  (no facing; the sim's facing and the render mirror can disagree mid-turn). The 0.6 is §2.5's projection,
  so it moved to `src/shared/projection.ts` (`render/camera.ts` re-exports it), not into the balance sheet.
- [FF10-fix-2] decision: bodies are hit by ours only: players' shots, arcs, cones and circles, towers, base
  archers and mortar shells. Squad soldiers' swings, enemy attacks, walking, separation and ground effects
  (snares, Aftershock, Wildfire/Plague, Fault Line, charged walls) keep feet circles. Auto-aim, pulse
  turrets and archers aim at the body's near end (`bodyAimY`: the feet on the ground, so ground aims are
  unchanged; the Wasp's hull, else a shot at its shadow would now pass under it). The mortar still lobs at
  the feet (it never hits Flyers).
- [FF10-fix-2] decision: sizes (radius, top; drawn tiles): Drone 0.42, 1.01 (radius to its head, so the
  blade arm reaching 0.6 out stays out; spine spikes too); Skitter 0.44, 0.57; mite 0.16, 0.19 (size 1);
  Brute 0.54, 1.5 (fists, arms, pauldrons out); Bombard 0.56, 1.18 (barrel, splayed legs out); Stalker
  0.54, 0.8 (tail out); Wasp 0.43, 1.37–1.76 (rotors, masts, thruster glow out); Colossus 1.0, 0.8 (its
  legs: bigger than its 0.9 feet, under half its 1.69-tile neck).
- [FF10-fix-2] decision: "half the height" is the gap the room reads, the hull's underside over its shadow:
  the Wasp art already lifts its hull 1.14 tiles over the rig's foot, so FF10's 1.6-tile hover drew it 2.74
  up; now 1.37 (`WASP_FLIGHT_TILES`, hover 0.23). Halving the 1.6 constant alone would only have lowered it
  ~30%. The sim's flyer `z` = 1 isn't drawn or read by any hit test, so it stays (hashes unchanged by it).
- [FF10-fix-2] decision: the sector test samples the capsule as feet-test circles r / 4 apart (covers it to
  0.01 r) after a reach reject; segments use exact segment–segment closest points; no per-test allocation.
  Projectile and blast candidates come from `queryBox`, reaching the tallest body (`Catalog.bodyMax`) south.
- [FF10-fix-2] decision: test fixtures: the aim-preview probes flatten the Grunt's body to its feet (they
  measure the shape; `body.test.ts` covers bodies); FF8's stand-in enemies get flat bodies; the Skyhunter
  Wasp, Plague neighbor and the aimed-melee "behind" Grunt moved so their drawn bodies are where the test
  means. No hashes or replays are pinned in tests; replays recorded before this change won't match.
- [FF10-fix-2] decision: the bench crashed on main (it starts all Engineers and `addSoldier` needs a squad
  lead since the balance sheet), so slot 0 is a Commander (FF15 rewrites the bench: take theirs on
  conflict). Peak, this machine, same load: main's sim mean 0.43–0.49 ms; this code with flat bodies 0.46;
  real bodies 0.54 ms, p99 1.4 ms (more footmen survive the run: 20 vs 4).
- [FF7-fix-4] contract+: `src/shared/messages.ts` `AIM_DEAD_ZONE` (0.12, the kit's aimed dead zone as a fraction of the clamp; a test pins it to `AIMED_DEFAULTS`) and `src/host/sim/types.ts` optional `AttackState.held` (`'out' | 'cancelled' | null`); SPEC §10.1, §15.7, §15.11 #51 updated.
- [FF7-fix-4] decision: the fix is in the sim (`players.ts` `heldAim`), not the phone: the tuple and its aiming flag are unchanged, and the TV keeps reading `PlayerEnt.mainAim`/`superAim` (null = no preview), so render is untouched. A held aim is `out` once its stick reads past the dead zone and `cancelled` once it reads back at or under it; cancelled hides the preview until the aiming flag drops (the brief's "stays hidden until a new press"). An aim that has not yet read past the dead zone shows nothing, so a slow drag rounding to the edge (stick ints) can't latch a cancel. Known edge: dragging out again after a cancel and releasing still fires (the phone's rule, unchanged) with no line shown; ask at C4 if the line should come back instead.
- [FF15] decision: soak = `sim/soak.ts` `soakRun`: autopilot in every slot, invincible, and the Citadel held at full
  HP (without it 6 of the 28 full-form runs fell at waves 9–14, so weak mixes never reached the boss); each player
  picks a card from every offer (`(wave + slot) % offer`) and tries one team-shop item a wave in a rotation (refused
  when unaffordable), so card and shop hooks run. Full form `pnpm --filter @pcg/fort-frenzy soak` (`scripts/soak.ts`):
  seeds 1 and 2 × (2 players in all 10 class pairs, same class twice included; 6 players in the 4 rotations of
  `CLASS_IDS`, so every class plays every slot), each run twice, state hash every 60 steps; fails on a throw, a run
  not ending in victory at wave 15, or differing rerun hashes; prints a per-run hash fingerprint. Short form in
  Vitest (`sim/__tests__/soak.test.ts`): one whole 2-player run and the 6-player boss waves (content waves 14–15).
- [FF15] decision: soak finding (autopilot, not a game rule): seed 2 Warden + Quartermaster stalled wave 6 for the
  whole hour cap: the invincible Warden stood under three Flyers it can't hit (holding their aggro), and the
  Quartermaster's shots hit a Warden wall on its line. The autopilot now picks only enemies its main attack can hit
  (`hitsFlyers`) and sidesteps (sides switch every 2 s) while a `blockedBy` wall or tower is on its line of fire.
- [FF15] decision: bench (`scripts/bench.ts`, loads in `sim/peak.ts`, shared with the stress mode): `boss` is the real
  peak (wave 15, the Colossus Mk III held at 45% HP so its final phase runs, Swarm packs through the `spawn` debug
  command up to 150 enemies, 60 lattice towers (2 pulse : 1 mortar) healed each step, two Commanders' squads to 30
  footmen, 100 projectiles, 6 knights of every class); `peak` is the same counts with the whole roster scattered
  (FF6/FF10's crowd; its footmen now belong to Commanders: on main the bench threw `slot 0 has no squad` since FF9);
  `run2`/`run6` time whole soak runs. Exits 1 when a peak's p99 or any mean is over 2 ms (was the mean only); each
  peak line prints the final state hash. `pnpm bench boss peak` runs a subset.
- [FF15] decision: perf, sim (every result exact: the 28 full-soak fingerprints and both bench state hashes are the
  same before and after): (1) soft separation finds its pairs on its own center-binned grid over typed copies of the
  bodies (was a spatial-hash query, sort and Map lookup per body, ~37% of the boss-peak step in dense Swarm packs),
  still visiting each body's overlapping higher-id neighbors in ascending id order, so pushes sum in the same order;
  (2) `hooks()` skips the modifier copy for units with no effects (a shared empty list with no mods either);
  (3) `refreshStats` sums each stat in one pass over the mods (same order and formula as `statValue`);
  (4) `nearestEnemy` skips the square root for enemies clearly out of range (a 1e-6 margin keeps kept results exact);
  (5) movement knows players by position (no Map lookup); the autopilot finds the Armory tile once (was a whole-map
  scan per sample, inside the timed step). The orch's suspects measured small at peak: hunted-field builds ~4% of
  the step, the Colossus < 1%, card and passive hooks ~2%; left as they are.
- [FF15] decision: perf, render: `RigSprite` poses parts without a per-part array, skips the per-frame order copy and
  join when the clip has no order swap (all but the Colossus legs) and builds an empty sample only with no clip; the
  stress overlay rewrites its DOM text every 15 frames. No visual change. `scene/worldView.ts` left alone (FF7-fix-4
  and FF10-fix-2 edit it in parallel). GPU and frame numbers are the user's at C4 (software GL here, FF3 decision).
- [FF15] decision: in-game stress mode `?debug=1&stress=1` (`host/stress.ts`): no relay or session (FF14 owns `net/`
  and the lifecycle), the `boss` peak load stepped by its own fixed-step loop on a 60 Hz timer as in a run, the real
  World scene (new optional `SceneHost.onWorld` hands over the RenderWorld) and FF3's overlay, moved to
  `render/stressOverlay.ts` (the gallery's `&stress=1` uses it too) with a sim line (step mean and p99 over the last
  600 steps, entity counts; also in `window.__pcgStress`). `&peak=synthetic`, `&seed=N`, `&fps=N`.
  `e2e/stress.spec.ts` checks it runs with no console errors or fallback shapes (not run by FF15: the orchestrator
  runs e2e).
- [FF15] decision: deleted FF3-fix-2's unused `THREAD_ALPHA` (`render/legibility.ts`) and its floor-contrast
  assertion ([orch] cleanup).

## 9. Final handoff

Manual steps, in order. No secrets are needed in v1 (milestones that add one must add a step here).

1. Review `git log --oneline`, then `git push origin main`; confirm the GitHub Actions run (`pnpm check`) is
   green.
2. **Relay:** relay code is unchanged, so no redeploy is needed. Its image now copies the new workspace
   manifests; if you redeploy anyway: `fly deploy --config apps/relay/fly.toml --dockerfile
   apps/relay/Dockerfile`, then `curl -sf https://relay.fostercurtis.dev/healthz`. Either way, Sunny Side
   redeploys on Vercel after the push (it now uses the kits): open `https://sunny-side.fostercurtis.dev`,
   join from a phone and play a round to confirm it still connects and plays.
3. **Vercel (Fort Frenzy):** New Project → import `foster-curtis/phone-controller-games` → Root Directory
   `apps/fort-frenzy`, framework Vite (build command `pnpm build`, which runs `pnpm assets`; output `dist`)
   → env var `VITE_RELAY_URL=wss://relay.fostercurtis.dev` (Production + Preview) → keep the
   `ignoreCommand` from `apps/fort-frenzy/vercel.json` (skips deploys unless `apps/fort-frenzy`, `packages/`
   or the lockfile changed) → Deploy.
4. Vercel → Domains → add `fort-frenzy.fostercurtis.dev`; create the DNS CNAME Vercel shows; wait for the
   certificate.
5. Smoke test on the real domain: open `https://fort-frenzy.fostercurtis.dev` on the TV; join by QR from an
   iPhone (Safari) and an Android (Chrome); confirm landscape, Wake Lock (screen stays on), fullscreen on tap
   (Android), `/play` loads without Phaser (DevTools Network); play a full wave; lock one phone ~10 s
   mid-wave and confirm it reconnects to its slot; reload the TV during a build phase and choose Resume.
   Check the keep favicon, brand fonts on both pages, and the "Add to Home Screen" icon on iOS.

## 10. Kickoff prompt

```text
You are the build orchestrator for Fort Frenzy. Read ONLY apps/fort-frenzy/BUILD_PLAN.md (never source
code) and follow it exactly.

1. Run every §1 pre-flight check (hand the commands to a haiku helper; failures only). If anything blocks
   the next milestone, stop and tell me exactly what to fix.
2. Read §6 Progress, §7 Blockers and `git log --oneline -15` to find where the build stands.
3. Run the next unchecked milestone(s) per §5, using the §4 brief and the §3 models:
   FF0 alone (opus, main checkout); then FF1 alone (opus, main checkout); then FF2 (opus), FF3 (opus),
   FF4 (sonnet) and FF5 (sonnet) in parallel in the same turn with isolation "worktree"; after C1, the C1
   fix milestones in parallel with FF6 (opus); then FF7 (opus); after C2, FF8, FF9 and FF10 (opus) in
   parallel; after C3, FF11 (opus), FF12 (opus) and FF13 (sonnet) in parallel; then FF14 and FF15 (opus)
   in parallel.
4. Hand everything that isn't milestone work (reading, summarizing, running checks, ticking the checklist,
   logging Blockers and Build decisions, research, drafting checkpoint instructions) to cheaper haiku or
   sonnet helpers per §5 rule 4.
5. Merge per §2 (`git merge --ff-only`, dependency order). After each merge, spawn a test-runner agent
   (model "haiku") on main with that milestone's Acceptance commands (Workspace checks after FF0 and FF1);
   on failure, resume that milestone's subagent with the output.
6. Stop at user checkpoints (C1–C4) and unresolved Blockers, and tell me exactly what is needed: the command
   to run, the URL or file to open, what to judge. Route checkpoint notes to fix milestones per §5 rule 10.
7. If everything in §6 is checked, run the final Workspace checks and print the §9 Final handoff.

{Optional: "Checkpoint approved: C1" / "C2 notes: …"}
```
