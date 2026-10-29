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
  resume. Notes become fix milestones; tuning goes to `src/content/**`.

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
    feature; numbers and pacing → a fix on the owning milestone changing only `src/content/**`. Fix
    milestones touching disjoint directories run in parallel in worktrees.
11. When everything in §6 is checked, run the Workspace checks once more on `main` via a test-runner, then
    print the §9 Final handoff list.

## 6. Progress checklist

- [ ] Pre-flight passed (S1)
- FF0 Shared kits
  - [ ] `@pcg/game-kit` (loop, lerp, RNG, host helpers, `/vite`) with tests
  - [ ] `@pcg/controller-kit` (platform, shell, router, widgets, gestures, sender, dev harness) with tests
  - [ ] Sunny Side on the kits, its copies deleted, its checks and e2e green
  - [ ] Dockerfile + `.prettierignore` + package tables updated
  - [ ] Merged to `main`
- FF1 Scaffold + contracts
  - [ ] App scaffold, deps, entries, configs, `check:fort-frenzy` green
  - [ ] Frozen contracts (7 files) + guards + theme parity
  - [ ] Asset manifest, icon sprite, portraits, LICENSES + test
  - [ ] Root wiring (scripts, ESLint boundaries, bundle limit, Dockerfile, doc tables)
  - [ ] Merged to `main`
- FF2 Systems + party
  - [ ] modifiers, effects, damage with tests
  - [ ] cards, waves, flowfield with tests
  - [ ] party with tests
  - [ ] Merged to `main`
- FF3 Art in engine
  - [ ] Atlases 1×/2×, unlit variants, rig validation
  - [ ] Theme pack + render core (camera, layers, rigs, clips, autotiles, Citadel, towers, bloom)
  - [ ] Gallery + stress mode + asset/rig tests + gallery e2e
  - [ ] Merged to `main`
- FF4 Controller
  - [ ] Client wiring, sender, `layoutCombat` + tests
  - [ ] All screens + components + dev mode
  - [ ] Controller e2e screenshots, bundle ≤ 100 KB
  - [ ] Merged to `main`
- FF5 TV UI
  - [ ] Home, lobby, summary screens
  - [ ] Combat + build HUD, alarms, lane bands
  - [ ] `?ui=` dev page + e2e safe-margin checks
  - [ ] Merged to `main`
- [ ] **User approved C1** (gallery, perf stress, phones, TV UI)
- FF6 Sim core
  - [ ] World, step order, movement, economy loop, building, phases
  - [ ] Engineer + pulse turret + Grunt + waves 1–2 content
  - [ ] Recorder, replay script, autopilot, determinism + scenario tests, bench
  - [ ] Merged to `main`
- FF7 Vertical slice
  - [ ] Host net + party bridge + input staleness + state sync
  - [ ] World scene + TV UI hookup + run flow
  - [ ] Debug panel + `__pcg` + smoke/reconnect e2e
  - [ ] Merged to `main`
- [ ] **User approved C2** (slice on real phones and TV)
- FF8 Warden + structures
  - [ ] Warden kit + clips
  - [ ] Walls, nets, Fortify, mortar (sim + render)
  - [ ] Merged to `main`
- FF9 Support classes
  - [ ] Artificer kit + gauge + throw + kit use
  - [ ] Commander + squad + flag
  - [ ] Merged to `main`
- FF10 Enemies
  - [ ] Six new AIs + leash + Flyer substitution
  - [ ] Enemy clips + status visuals
  - [ ] Waves 1–15 content
  - [ ] Merged to `main`
- [ ] **User approved C3** (class kits and enemies)
- FF11 Colossus
  - [ ] Boss module (forms, attacks, stagger, rewards)
  - [ ] Colossus render + clips + boss bar
  - [ ] Merged to `main`
- FF12 Economy
  - [ ] 64 cards + offers
  - [ ] Team shop + wishlist + announcements + tier visuals
  - [ ] Difficulty
  - [ ] Merged to `main`
- FF13 Audio
  - [ ] SFX picked and converted + LICENSES
  - [ ] Player + cues + unlock
  - [ ] Merged to `main`
- FF14 Lifecycle + resume
  - [ ] Victory/defeat/summary/end options, late joins
  - [ ] Snapshot + resume + device-ID claim
  - [ ] Resume e2e
  - [ ] Merged to `main`
- FF15 Soak + perf
  - [ ] Soak + determinism over full runs
  - [ ] Bench at real peak + stress mode + perf fixes
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
