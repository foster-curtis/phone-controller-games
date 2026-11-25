# REDESIGN_BUILD_PLAN: Fort Frenzy, players-only wave defense

Orchestration plan for migrating Fort Frenzy from co-op tower defense to the players-only wave defense in
`apps/fort-frenzy/REDESIGN.md`. This is a migration of working code, not a greenfield build: reuse what
fits, cut what the redesign removes, and keep the game playable at every merge.

The orchestrator reads **only this file**. Subagents read their milestone entry, §2, §8 and the spec
sections and files the entry names. Commands are POSIX sh (Git Bash on Windows), run from the repo root
(or from the milestone's worktree, §2). `SPEC §` = `apps/fort-frenzy/SPEC.md`; `REDESIGN §` =
`apps/fort-frenzy/REDESIGN.md`; `PLATFORM §` = `PLATFORM.md`. `BUILD_PLAN.md` is the finished
tower-defense plan: read-only history, never edited.

**Source of truth:** `REDESIGN.md` until RD0 folds it into `SPEC.md`; after RD0, `SPEC.md`. If the two
ever disagree, `REDESIGN.md` wins: fix `SPEC.md` in the same milestone and log it under §8.

**Integration branch (user decision, 2026-11-18):** the redesign lands on the local branch
`redesign/fort-frenzy`, created from `main` by RD0. Milestones fast-forward into it; `main` stays free for
other work. The Final handoff (§9) pushes it as one PR, so a half-finished redesign never ships.

**Inputs already in the repo (read-only; wire them in, never redraw or restyle):**

| Spec                                               | Files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Redesign decisions                                 | `apps/fort-frenzy/REDESIGN.md` (groups A–G, Migration impact table)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Brand                                              | `src/styles/brand.css`, `brand/`, `public/`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Art (tower-defense set, on `main`)                 | `art/neon-knights/` (README, `rigs/*.json`, `sprites.json`, `icons/`, category folders)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **Redesign art (finished, branch `art/redesign`)** | Merged by RD1. Builds `structures/{shield-gen,beacon}/{flight,landed,active,damaged,destroyed}`, `structures/mine/{armed,trigger}`, `structures/rally-flag/flight-{pole,cloth,trim}`; portals `map/portal/{bottom,left,right}-{idle,flare}`; effects `shield-base`, `shield-shimmer-1..3`, `beacon-pulse`, `mine-blast-ring`, `mine-blast`, `brute-target`, `brute-target-arrow`, `shockwave`, `landing-dust`, `charge-dust`, `slam-cracks`, `slam-cracks-wide`, `portal-flare`; Commander rig parts `shield`/`shield-glow`/`scabbard`/`scabbard-glow`, attach `shield`, optional group `sword` (off); Warden rig optional group `slam` (`hammer-down`, `hammer-down-glow`, front/back), attach `hammer-ground`; icons `act-shield`, `act-mine`, `act-beacon`, `role-{tank,marksman,support,control}`, `card-build`, `card-tinkerer`, `base-hp`; replaced in place `main-commander`, `super-{commander,ranger,warden}`. Notes: art README sections "Builds (redesign)", "Redesign poses", "Effects", "Map", "Layers"; `review/redesign/*.svg` (intended layering), `review/redesign/obsolete.md` (what F5 retires) |
| Audio                                              | `audio/kenney/<pack>/` (CC0), `audio/neon-knights/*.mp3`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

Code-drawn by design (no art file, not a gap): enemy HP bars (violet), build HP bars (amber), the
build-meter ring on the phone's action button, build effect-radius ellipses (faint dotted amber 0.6),
build shadows and the in-flight shadow, the throw-landing aim ellipse and throw range, the red Charge lane
marker, "×2" Rally Cry text, the Hunter's lock-on flash, and everything the TD plan already listed as
code-drawn (rings, danger markers, aim previews, super pulse ring).

## 0. Sessions

The user runs `/clear` between sessions and pastes the §10 kickoff prompt to start each one.

| Session | Runs                                                                    | Ends at                                                                             |
| ------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| S1      | Pre-flight → **RD0** (main checkout)                                    | **RC0**: user reviews the rewritten `SPEC.md`                                       |
| S2      | RC0 notes (RD0-fix) → **RD1** (main checkout) → **RD2** (main checkout) | none (context break)                                                                |
| S3      | **RD3 ∥ RD4 ∥ RD5** (worktrees) → **RD6** (main checkout)               | **RC1**: vertical slice on real iOS + Android phones and a TV, solo and 2-player    |
| S4      | RC1 fixes → **RD7 ∥ RD8 ∥ RD9 ∥ RD10** (worktrees)                      | **RC2**: all four kits and every enemy play-tested, with the balance harness report |
| S5      | RC2 fixes → **RD11 ∥ RD12 ∥ RD13** (worktrees)                          | **RC3**: art gallery on the TV; solo play with every knight                         |
| S6      | RC3 fixes (worktrees, by owner dir) **∥ RD14**                          | **RC4**: full 15-wave run (pacing, hot side, economy) + resume                      |
| S7      | RC4 fixes → final test-runner on `redesign/fort-frenzy` → print §9      | Final handoff printed                                                               |

## 1. Pre-flight checklist

Keep it short (user preference): run only the quick checks that block the next milestone, then start.
The full gate and e2e run in the post-merge test-runner (§5 rule 6) and the final checks, never here.

| Item                                                                                                 | Check command                                                                                                                                                                     | Blocks                                         |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Before RD0: on `main`, clean tree                                                                    | `test "$(git branch --show-current)" = main && test -z "$(git status --porcelain)"`                                                                                               | RD0                                            |
| From RD0 on: on the integration branch, clean tree                                                   | `test "$(git branch --show-current)" = redesign/fort-frenzy && test -z "$(git status --porcelain)"`                                                                               | all after RD0                                  |
| This plan is committed                                                                               | `git log -1 --format=%H -- apps/fort-frenzy/REDESIGN_BUILD_PLAN.md` prints a hash                                                                                                 | all                                            |
| Up to date with `main` (AGENTS.md)                                                                   | `git fetch origin && git log --oneline HEAD..origin/main` prints nothing; otherwise `git merge origin/main` (stop and ask the user on a conflict)                                 | all after RD0                                  |
| Tag exists (after RD0)                                                                               | `git rev-parse -q --verify refs/tags/fort-frenzy-td-final >/dev/null`                                                                                                             | RD1 onward                                     |
| Art branch present (before RD1) / merged (after RD1)                                                 | before: `git rev-parse -q --verify art/redesign >/dev/null`; after: `git merge-base --is-ancestor art/redesign HEAD`                                                              | RD1 only (before); RD5, RD7–RD10, RD12 (after) |
| Balance harness runs (after RD3)                                                                     | `pnpm --filter @pcg/fort-frenzy balance --quick` exits 0                                                                                                                          | RC2, RC3                                       |
| Node ≥ 22, pnpm 10.x                                                                                 | `node -e "process.exit(+process.versions.node.split('.')[0]>=22?0:1)" && pnpm --version \| grep -q '^10\.'`                                                                       | all                                            |
| Install                                                                                              | `pnpm install --frozen-lockfile`                                                                                                                                                  | all                                            |
| Worktrees ignored by git, Prettier, ESLint                                                           | `git check-ignore -q .claude/worktrees/x && grep -q '.claude/worktrees' .prettierignore && grep -q "'.claude/worktrees/\*\*'" eslint.config.js`                                   | parallel waves                                 |
| No stale plan branches or worktrees                                                                  | `git branch --list 'build/rd*' --no-merged HEAD` lists only milestones still in progress per §6; `git worktree list` has no `rd*` worktree for a merged milestone (remove per §2) | parallel waves                                 |
| Ports free (4173 5173 5175 8787 8790)                                                                | `netstat -ano \| grep LISTENING \| grep -E ':(4173\|5173\|5175\|8787\|8790) '` prints nothing                                                                                     | e2e, check:routes, checkpoints                 |
| Playwright Chromium                                                                                  | `pnpm --filter @pcg/fort-frenzy exec playwright install chromium`                                                                                                                 | RD6, RD12, RD14 test-runs                      |
| Kenney packs + ffmpeg                                                                                | `ls apps/fort-frenzy/audio/kenney/*/License.txt >/dev/null && ffmpeg -version >/dev/null 2>&1`                                                                                    | RD13                                           |
| Live harness                                                                                         | No dev or LAN server is serving from the main checkout while a milestone edits it (§2 "Live harness")                                                                             | RD1, RD2, RD6                                  |
| LAN dev for checkpoints (firewall rule `pcg-dev` for TCP 5173, 8787; TV, PC and phones on one Wi-Fi) | `netsh advfirewall firewall show rule name=pcg-dev` / user confirms                                                                                                               | RC1–RC4                                        |
| `gh` CLI logged in                                                                                   | `gh auth status`                                                                                                                                                                  | Final handoff only                             |
| Unattended permissions                                                                               | Session in auto mode, or the TD plan's §1 allowlist in `.claude/settings.local.json`                                                                                              | all                                            |

## 2. Branches, merging, verification

- **Integration branch:** `redesign/fort-frenzy`. The orchestrator works on it in the main checkout.
  Nothing is pushed until the Final handoff, and nothing goes to `main` (the plan itself is the only
  redesign commit on `main`).
- Each milestone works on `build/rd<N>-<slug>` (slugs in the §3 table), branched from
  `redesign/fort-frenzy`. Fixes after checkpoint notes go on `build/rd<N>-fix-<k>`.
- **Worktrees are manual** (user setup: `Agent` `isolation: "worktree"` is refused in this repo because of
  the `c:\` vs `C:/` drive-letter case). For each parallel milestone the orchestrator (via a haiku helper)
  runs, from the repo root:
  `git worktree add .claude/worktrees/rd<N>-<slug> -b build/rd<N>-<slug> redesign/fort-frenzy && (cd .claude/worktrees/rd<N>-<slug> && pnpm install --frozen-lockfile)`,
  then launches the agent **without** `isolation`, telling it to run every command as
  `cd <absolute worktree path> && …` and to use absolute paths. After the merge, remove it:
  `git worktree remove .claude/worktrees/rd<N>-<slug>` (if that fails on long paths, PowerShell
  `Remove-Item -LiteralPath "\\?\<abs path>" -Recurse -Force`, then `git worktree prune`). Serial
  milestones run in the main checkout on their own branch.
- **Live harness:** while a dev or LAN server runs from the main checkout (checkpoints), the main
  checkout's working tree is read-only: no `git checkout`, `reset`, `stash` or edits there. Fix
  milestones during a checkpoint use worktrees; baselines are measured in a worktree.
- Subagent flow: commit → run Acceptance (no e2e, see below) → tick its own Progress items in this file →
  `git rebase redesign/fort-frenzy` → rerun Acceptance if the rebase pulled anything in → report.
- **Subagents never run Playwright** (`pnpm e2e:*`, `playwright test …`, user setup): they write and
  update specs, run typecheck, lint and Vitest, and report. The orchestrator's haiku test-runner runs the
  e2e items of Acceptance on the milestone branch before the merge and sends failures back to the same
  subagent (SendMessage). The full Fort Frenzy suite takes 20+ minutes: run it at most once per
  milestone; after a fix rerun only the failed specs.
- The orchestrator merges with `git merge --ff-only build/rd<N>-<slug>` on `redesign/fort-frenzy`. If that
  fails, it resumes the same subagent to rebase and rerun Acceptance.
- **RD1 is the exception:** its branch starts with `git merge --no-ff art/redesign` (a merge commit). RD1
  runs alone, so nothing moves under it; it never rebases across that merge (use
  `git rebase --rebase-merges` if a rebase is ever needed).
- Rebase conflict rules:
  - This plan's Blockers / Build decisions / Progress ticks: keep both sides.
  - Append-only registries and **sectioned files** (§3): keep both sides, rerun Acceptance.
  - Additive edits to a frozen contract (both sides appended): keep both sides, rerun Acceptance.
  - `pnpm-lock.yaml`: take the integration branch's, run `pnpm install`, commit the regenerated lockfile.
- **Deferred checks:** a milestone that needs a small piece of an unmerged sibling reports "done, checks
  pending RD#". The orchestrator merges RD# first, then resumes it to rebase and run its full Acceptance.
- **Changesets:** every milestone that changes shipped code commits a `.changeset/*.md`
  (`pnpm changeset --<level> @pcg/fort-frenzy -m "…"`). RD1 adds the redesign's **major** note
  (protocol 2, old saves dropped, PLATFORM §5); feature milestones add minor, fix milestones patch. RD0 is
  Markdown only and needs none. `check:changeset` compares against `main`, so it passes on every branch
  once RD1's note exists; still add each milestone's own line for the changelog.
- **Check sets:**
  - **RD checks** (milestones inside `apps/fort-frenzy`):
    `pnpm install --frozen-lockfile && pnpm check:fort-frenzy`
    (typecheck, ESLint, Prettier check, Vitest, build, check:bundle (`play.html` ≤ 100 KB gzipped, no
    Phaser), check:routes, check:changeset).
  - **Affected checks** (a milestone that edits root config or a file another app reads, e.g.
    `eslint.config.js` in RD1, `game.meta.ts` in RD3): RD checks + `pnpm check:affected`.
  - **RD e2e** (test-runner only): `pnpm e2e:fort-frenzy` (exclusive suite; relay 8790, Vite 5175), or
    the named specs.
  - **Inputs unchanged (I)** (every milestone except RD1 and RD12; run before rebasing):
    `git diff --quiet redesign/fort-frenzy -- apps/fort-frenzy/art apps/fort-frenzy/brand apps/fort-frenzy/public apps/fort-frenzy/src/styles/brand.css apps/fort-frenzy/audio/kenney`
    RD1's I: the diff against `art/redesign` for `apps/fort-frenzy/art` is empty. RD12's I: the only
    art changes are the deletions listed in its entry.
  - **Sim bench** (`pnpm --filter @pcg/fort-frenzy bench`): per-scenario mean and p99 step, non-zero over
    2 ms. Numbers swing ±50% under machine load; rerun once before reporting a miss.
  - **Balance report** (from RD3, a tool, never a gate): `pnpm --filter @pcg/fort-frenzy balance`
    prints each knight's solo clear time against the standard wave from one portal, and flags knights
    outside ±20% and ±25% of the mean (REDESIGN A1).
  - **Workspace checks** (contingency only; no milestone plans a shared-code change, §8): `pnpm check &&
pnpm e2e` plus the relay Docker healthz from the TD plan §2. A milestone that finds it must touch
    `packages/**` or `apps/relay` stops with a Blocker instead.

## 3. Milestones

| #    | Milestone (branch slug)                                                                           | Scope              | Model  | Parallel with  | User checkpoint                        |
| ---- | ------------------------------------------------------------------------------------------------- | ------------------ | ------ | -------------- | -------------------------------------- |
| RD0  | Tag, spec rewrite, contracts in the spec (`spec`)                                                 | docs               | opus   | none (serial)  | **RC0**: rewritten SPEC.md             |
| RD1  | Art merge, rename ids, remove the theme layer (`rename`)                                          | ff + root ESLint   | sonnet | none (serial)  | no                                     |
| RD2  | Cut removed systems, code contracts, portals (`cut`)                                              | ff                 | opus   | none (serial)  | no                                     |
| RD3  | Sim slice: builds, meter, Warden build, regen, hot side, build phase, solo, harness (`sim-slice`) | ff (+ game.meta)   | opus   | RD4, RD5       | **RC1** (with RD4–RD6)                 |
| RD4  | Controller slice: card pop-up, shop + stick, build button (`controller-slice`)                    | ff                 | sonnet | RD3, RD5       | **RC1**                                |
| RD5  | TV slice: build rendering, portal flare, HP bars, Warden clips (`tv-slice`)                       | ff                 | sonnet | RD3, RD4       | **RC1**                                |
| RD6  | Slice wiring, debug panel, e2e (`slice`)                                                          | ff                 | opus   | none           | **RC1**: slice on real phones and a TV |
| RD7  | Ranger kit: mines, shockwave, cards (`ranger`)                                                    | ff                 | opus   | RD8, RD9, RD10 | **RC2**                                |
| RD8  | Artificer kit: nanite blast, heal cone, beacon, gauge, cards (`artificer`)                        | ff                 | opus   | RD7, RD9, RD10 | **RC2**                                |
| RD9  | Commander kit: shield bash, Reinforcements, rally flag, squad, cards (`commander`)                | ff                 | opus   | RD7, RD8, RD10 | **RC2**                                |
| RD10 | Enemy changes + Colossus Charge (`enemies`)                                                       | ff                 | opus   | RD7, RD8, RD9  | **RC2**: every enemy type              |
| RD11 | Economy: commons, card rules, class growth, team shop, coins, difficulty (`economy`)              | ff                 | opus   | RD12, RD13     | no (judged at RC4)                     |
| RD12 | Art pass: gallery, retired art, asset checks (`art`)                                              | ff + art deletions | sonnet | RD11, RD13     | **RC3**: gallery on the TV             |
| RD13 | Audio cues + TV and phone polish (`polish`)                                                       | ff                 | sonnet | RD11, RD12     | **RC3**                                |
| RD14 | Lifecycle, resume, solo, soak, bench (`resume`)                                                   | ff                 | opus   | RC3 fixes      | **RC4**: full run + resume             |

Dependency graph (every edge points backwards): RD0 → RC0 → RD1 → RD2 → {RD3, RD4, RD5} → RD6 → RC1 →
{RD7, RD8, RD9, RD10} → RC2 → {RD11, RD12, RD13} → RC3 → RD14 (∥ RC3 fixes) → RC4.

**Freeze points** (later milestones may only add, and log `- [RD#] contract+: …` under §8):

| After | Frozen                                                                                                                                                                                                                                                                                                                                                    |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RD0   | SPEC §15 contract sketches (the shapes RD2 implements)                                                                                                                                                                                                                                                                                                    |
| RD2   | `src/shared/messages.ts` (PROTOCOL_VERSION 2, InputTuple v2, Intent, HostMsg, TeamView, MeView, RunStats), `src/shared/ids.ts`, `src/content/types.ts`, `src/host/sim/types.ts` + `events.ts`, `src/host/sim/snapshot.ts` types, `src/host/ui/types.ts`, `src/presentation/types.ts`, `src/host/systems/*/index.ts` signatures, `src/host/party/index.ts` |
| RD6   | `src/host/render/types.ts` (incl. RD5's build-view API), the build behavior registry `src/host/sim/builds/index.ts` and the scene build-view folder convention                                                                                                                                                                                            |

**Append-only registries** (any milestone may append; §2 conflict rule): `src/content/index.ts`,
`src/host/sim/registry.ts`, `src/host/sim/events.ts` SimEvent members, `src/host/audio/cues.ts`,
`src/host/sim/builds/index.ts` (build behaviors by `BuildId`), `src/host/sim/autopilot/builds.ts`
(per-knight build policy for the autopilot and the balance harness). Render clips
(`src/host/render/clips/<rig>.ts`) and scene build views (`src/host/scene/builds/<build>.ts`) are found
with `import.meta.glob`, so they need no registry.

**Sectioned files** (each milestone edits only its own section, marked by a `// ==== <Section> ====`
banner; §2 conflict rule): `src/content/balance.ts` (sections: run rules, scaling, classes, one per
knight, builds, enemies, Colossus, waves, cards common, cards per knight, shop, harness),
`src/controller/copy.ts` (one per knight, commons, shop, lobby and summary),
`src/host/scene/{support,supportView}.ts` (Artificer and Commander sections; RD8 and RD9 run in
parallel, and new visuals go in their own `scene/artificer*.ts` / `scene/commander*.ts` files where
possible), `src/host/render/gallery/pages.ts` (RD12 only after RD6), `assets/LICENSES.json` (append-only).

**Cut map** (where each removed system goes; dead code, tests and art references go with their system):

| Removed (REDESIGN)                                                                                                                                                                                                                                            | Cut in                                                                                                      | Why there                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Theme layer: `src/themes/`, ThemeId, theme row and `theme` intent, per-theme difficulty, Pillow Fort                                                                                                                                                          | RD1                                                                                                         | Touches everything; mechanical; runs alone before the fan-out                                       |
| Supply crates, power cells, Armory, repair zone, carry, cap, slowdown, give, throw, death drops, crate repair, emergency kit, QM supply perks and items, carry pips                                                                                           | RD2 (cut first)                                                                                             | Nothing replaces them; the game runs without them                                                   |
| Structures (pulse turret, mortar, walls, shock nets, Fortify), `building.ts`, ghost, placement, autotiles in use, structure shop items, structure cards (Master Mason, Bodyguard, Light Load, Bulk Buyer, old Fault Line), Mason passive, tower defense bonus | RD2 (cut first)                                                                                             | Builds are a new system (RD3), not a rewrite of structures; cutting first keeps RD3 free of TD code |
| Action priority table, build arc, radial input fields, `MeView.action/arc/buildKit/give/kits/crates/carryCap`, Build tab                                                                                                                                      | RD2 (cut first)                                                                                             | Same contract rewrite as the tuple; RD4 adds the build button                                       |
| `breaker` field, placement-triggered flow-field rebuilds, wall-smashing Brute and Colossus paths                                                                                                                                                              | RD2 (cut first)                                                                                             | Nothing a player places changes pathing (C4); the static ground field is built once per run         |
| Lanes, lane unlocks, sealed gates, "lanes open" column, lane warning bands                                                                                                                                                                                    | RD2 (replaced by 6 idle portals, every portal live, groups round-robin); hot side, cap and flare in RD3/RD5 | Wave data and map shapes change with the contracts; spawning needs a replacement in the same step   |
| Lead from the Front motes, morale super visuals, old Commander super                                                                                                                                                                                          | RD9 (replaced by Reinforcements and the Morale card)                                                        | Replaced in the milestone that owns the Commander                                                   |
| Removed-outright art files (obsolete.md)                                                                                                                                                                                                                      | RD12                                                                                                        | One place, after every code reference is gone                                                       |

### RD0: Tag, spec rewrite, contracts in the spec

- **Goal:** `SPEC.md` describes the redesigned game on its own, with §15 contract sketches exact enough
  for RD2 to implement without design choices; the TD build stays recoverable by tag; the integration
  branch exists.
- **Read:** `REDESIGN.md` (all); `SPEC.md` (all); this plan's §3 cut map and §8 (every `[plan]` decision
  is a spec input); `art/redesign`'s `apps/fort-frenzy/art/neon-knights/README.md` and
  `review/redesign/obsolete.md` (via `git show art/redesign:<path>`); `src/shared/messages.ts`,
  `src/shared/ids.ts`, `src/content/types.ts`, `src/host/sim/types.ts`, `src/host/sim/snapshot.ts`,
  `src/host/ui/types.ts`, `src/themes/types.ts` (current shapes to rewrite from).
- **Depends on:** pre-flight; this plan committed on `main`.
- **Order:** (1) `git tag fort-frenzy-td-final main` (local), `git switch -c redesign/fort-frenzy`,
  then `git switch -c build/rd0-spec`; (2) rewrite §1–§14; (3) update §15; (4) decision log; (5) status
  lines.
- **Deliverables:**
  - `SPEC.md` §1–§14 rewritten from REDESIGN groups A–G: identity and pillars (A1, classes vs knights),
    no theme section (G2: §2.1 becomes the neon-knights look with no theme table; §2.2 Normal default
    and the respawn multiplier, G3), art rules kept (§2.4–§2.6) with the redesign's art (F5, the art
    README) and the icon list (§2.6, split into **in use**, **on file, unused** and **removed outright
    (deleted in RD12)**, so RD1's manifest test can list what is on disk), map with 6 portals (A2,
    positions from §8), base (A4, no repair zone or Armory), run structure (A5, 20 s build phase, card
    pop-up → shop, 15 waves, 20–24 min), death/respawn/regen (A6), economy (B, team coins only, growth),
    cards (E, with the card-mark table from §8), team shop (E4), builds (A5, C2–C5: the new §7 replaces
    "Building and pathing"), knights (C5, the new §8: class table, knight table, input types, passives as
    cards, squad), enemies (D, answered-by table, hot-side schedule, active portal cap, player-count
    table, per-wave enemy multiplier, Colossus Mk I–III with Charge), controls (F1–F3), TV (F4), lobby
    1–6 players and solo (A, "Solo play"), v1 scope, §13 v2 notes (build idea pool, personal currency,
    terrain and temporary walls, squad solo mode, more shop items, enemy back views, Hunter v2), §14 open
    items trimmed (#3 regen settled; numbers list rewritten for builds, meters, prices).
  - `SPEC.md` §15 updated: remove the theme layer, structures, crates, lanes, breaker field, placement
    rebuilds, build arc and radial input; `src/presentation/` replaces `src/themes/` (§8); exact
    sketches for: `InputTuple` v2 and `PROTOCOL_VERSION = 2`, `Intent` (no `build`, `give`, theme;
    `card` = confirm), `AckReason`, `TeamView`, `MeView` (build meter, input type, icon id, recall
    state, growth header, card selection state), `RunStats` and awards, `ids.ts` unions (`ClassId`
    `ranger|warden|artificer|commander`, `KnightId`, `RoleId` `tank|marksman|support|control`, `BuildId`,
    `PortalId`, `SideId`, icons), content types (`ClassDef` HP tier, damage band, growth; `KnightDef`
    main, super, build, input types, charge rates and sources, `hitsFlyers`, passive card; `BuildDef`
    input, throw range, HP or charges, radius, traits `targetable`, `dealsDamage`, `hidden`,
    `triggerRadius`, `maxActive`; `PlayerCountRow[]`; `WaveDef` with `hot` schedule, `enemyMult`,
    portal-aware `guaranteed`; `MapDef.portals`; `CardDef.requires?: CardId[]`; `ShopItemDef` without
    `qmOnly`), sim types (`BuildEnt`, `PlayerEnt.meter`, regen timers, `World.builds`, no
    `structures`/`cratePiles`/`thrown`), `generateWave` additive inputs (sides, hot share, active cap),
    `RunSnapshot` (bumped `v`, no theme/structures/crates/kits; builds with position and HP or charges,
    meters, squad soldiers and flag), step order, layers (builds on the world layer, rings under them),
    bench peak counts (6 knights, 30 soldiers, 150 enemies, 100 projectiles, 24 builds), soak forms
    (solo runs added), the balance harness (§15.9), and the frozen-contract list.
  - Decision log rows #58 onward: one per REDESIGN group and one per §8 `[plan]` decision that the spec
    now states.
  - `SPEC.md` header and Status say: redesigned 2026-11; REDESIGN.md is the decision record.
    `REDESIGN.md` Status line: "Folded into SPEC.md at RD0 (<commit>); kept as the decision record."
- **Acceptance:** RD checks (Markdown only: Prettier skips both specs; check:changeset passes with no
  shipped change) + I, and:
  - `git rev-parse -q --verify refs/tags/fort-frenzy-td-final` prints a hash equal to `main`'s.
  - `git branch --list redesign/fort-frenzy` prints it.
  - These greps print nothing in `SPEC.md` outside §13, §15.11's old rows and explicit "removed" notes
    (the agent lists any intentional hit under §8): `grep -nE "Quartermaster|Engineer|carry cap|supply crate|Armory|repair zone|build arc|sealed lane|Pillow Fort|ThemeId|breaker" apps/fort-frenzy/SPEC.md`.
  - A coverage table at the end of the agent's report (not in the spec): every REDESIGN section (A1–G4)
    and every Migration impact row → the SPEC section that now states it.
- **Risks / fallbacks:** the rewrite drifts from REDESIGN → REDESIGN wins, quote it; a REDESIGN gap not
  covered by §8 → pick the simplest, add a `[RD0]` line to §8 and a log row.
- **Leave out:** code, `BUILD_PLAN.md`, anything REDESIGN marks v2 or pool (§13 notes only).
- **User checkpoint (RC0):** open `apps/fort-frenzy/SPEC.md` on the `build/rd0-spec` branch (rendered in
  the editor). Judge: §1–§14 match REDESIGN; §15 sketches; the decisions logged from this plan's §8
  (portal positions, tuple v2, snapshot, class multipliers, card marks, the `[plan]` gap resolutions).
  Notes become RD0-fix; the orchestrator merges RD0 only after approval.

### RD1: Art merge, rename ids, remove the theme layer

- **Goal:** the finished redesign art is in; code ids are the display names (`ranger`, `artificer`);
  the theme layer is gone; the game plays exactly as before otherwise.
- **Read:** SPEC §2 (look), §2.6 (icon lists), §15.1 (layout), §15.4 (presentation types), §15.10, §15.11
  (frozen list); art README "Builds (redesign)" and "Layers"; `src/themes/**`,
  `src/shared/ids.ts`, `src/shared/messages.ts` (theme, ClassId uses), `src/host/ui/screens/home.ts`,
  `src/host/ui/homeNav.ts`, `scripts/build-atlases.ts`, `src/themes/__tests__/*`, root
  `eslint.config.js` (`themes` pattern).
- **Depends on:** RD0 merged (RC0 approved).
- **Order:** (1) `git merge --no-ff art/redesign`; update `rig-contract.test.ts` (commander attach
  `shield`, optional groups `['banner','sword']`; warden attach `hammer-ground`, optional `['slam']`, out
  of the "no optional groups" list) and `manifest.test.ts` `SPEC_ICON_IDS` (the 10 new ids plus SPEC
  §2.6's three lists, matching the disk); RD checks green; commit. (2) Rename `engineer` → `ranger`,
  `quartermaster` → `artificer` everywhere (ids, content keys, card ids that embed the class, file names
  such as `sim/cards/engineer.ts`, tests, e2e, copy); commit. (3) Remove the theme layer: move
  `src/themes/neon-knights/{shared,host}.ts` and `src/themes/types.ts` into `src/presentation/`
  (`PresentationShared`, `PresentationHost`, `RigDef`, `Clip`; no `ThemeId`, no `defaultDifficulty`, no
  rig-id mapping since rig ids now equal code ids for knights); drop ThemeId from `ids.ts`, `messages.ts`
  (leader `theme` intent, `TeamView.theme`), snapshot `settings`, recorder and home screen (no theme
  row; Normal default); `build-atlases.ts` keeps one art set at `art/neon-knights/` (constant
  `ART_SET`); move the tests to `src/presentation/__tests__/`; update the ESLint `themes` pattern to
  `presentation` (root config); commit.
- **Deliverables:** the merge; renamed ids; `src/presentation/`; `PROTOCOL_VERSION = 2` (ClassId values
  and the theme intent changed; it stays 2 for the whole redesign, §8); snapshot `v` bumped (old saves
  discarded); the major changeset; SPEC §15 paths already say `src/presentation` (fix if not).
- **Acceptance:** Affected checks (root ESLint changed) + RD1's I, and:
  - `grep -rniE "engineer|quartermaster" apps/fort-frenzy/src apps/fort-frenzy/e2e apps/fort-frenzy/scripts` prints nothing.
  - `test ! -d apps/fort-frenzy/src/themes && grep -rn "ThemeId\|themeId" apps/fort-frenzy/src` prints nothing.
  - Rig-contract, manifest, asset-keys, unlit and presentation key-whitelist tests pass from
    `src/presentation/__tests__/`.
  - Test-runner (orchestrator): `pnpm e2e:fort-frenzy` (behavior unchanged; specs updated for ids and the
    missing theme row).
- **Risks / fallbacks:** the merge brings the art changeset (minor) — keep it. Flattening `art/neon-knights/`
  is out (§8). A rename collides with an existing id → log and pick `<id>_old`; never edit art JSON.
- **Leave out:** any gameplay change; wiring the new art (later milestones).

### RD2: Cut removed systems, code contracts, portals

- **Goal:** the TD-only systems are gone, every contract file has its redesign shape, and enemies spawn
  from 6 always-live portals; knights fight with mains and supers, the shop sells repair and sentry
  upgrades, cards still work; nothing builds yet (meters exist, stay empty, and the action button is
  dimmed).
- **Read:** SPEC §3, §4, §6, §6.2, §7 (builds: contract only), §9.3, §9.4, §10.1, §10.2, §15 (all);
  this plan's §3 cut map and §8; the files the code inventory names for crates, structures, action
  table, Build tab, breaker, lanes (ask a haiku helper for `grep -rln` lists, don't read broadly):
  `sim/{crates,building,players,state,lifecycle,snapshot,peak,soak,sources,recorder}.ts`,
  `sim/structures/**`, `sim/shop/**`, `sim/cards/**`, `sim/ai/{field,path,threat,siege,brute}.ts`,
  `sim/boss/colossus.ts`, `systems/flowfield`, `systems/waves`, `content/{balance,types,map,index}.ts`,
  `net/{session,views,input}.ts`, `controller/{input,components,copy,samples,state}.ts`,
  `controller/screens/{build,combat}.ts`, `render/{structures,structureFx,autotile,buildFx,map,ground,
groundMarks,gauge}.ts`, `scene/{structuresView,supportView,worldView}.ts`, `ui/{labels,samples,types}.ts`,
  `ui/screens/hud.ts`, `debug.ts`, `stress.ts`, `scripts/bench.ts`, e2e specs.
- **Depends on:** RD1 merged.
- **Order:** commit after each step with RD checks green: (1) contract files to the SPEC §15 shapes,
  with the new fields present and stubbed (`MeView.build.meter` 0, `World.builds` empty, `hot` unset);
  (2) crates and the QM supply kit; (3) structures, building, Fortify, Mason, structure cards and shop
  items, tower defense bonus; (4) action table, build arc, radial fields, Build tab (the build phase
  shows the existing shop view, no tabs); (5) breaker field and placement rebuilds (the ground field is
  built once per run; Brute and Colossus walk the ground field; Hunter threat counts sentries only until
  RD10); (6) lanes → portals (map, waves, debug "spawn at portal", idle `map/portal/<side>-idle` frames
  at the portal anchors with the edge frames skipped on portal tiles, no sealed gates, no lane bands);
  (7) tests, soak, bench, autopilot, stress mode, e2e specs.
- **Deliverables:**
  - Contracts: `messages.ts` (InputTuple v2: `[moveX, moveY, mainX, mainY, superX, superY, buildX,
buildY, flags (1 main aiming, 2 super aiming, 4 build aiming), mainFires, superFires, buildFires]`;
    Intent without `build`/`give`; AckReason without `crates`/`cap`; `TeamView`/`MeView`/`RunStats` per
    SPEC §15.6), `ids.ts`, `content/types.ts`, `sim/types.ts` + `events.ts`, `snapshot.ts` (v bumped,
    builds and meters in the shape, empty until RD3/RD14), `ui/types.ts`, guards; host `net/input.ts`
    maps tuple v2 to `PlayerInput` (`buildAim`, `buildAiming`, `buildFires`).
  - The cuts in the cut map, with their tests deleted or rewritten, pinned-balance tests updated
    (`c3-tuning`, `speeds`, `aimPreview`, `content`, `boss`), the Artificer's super heals knights only,
    the Ranger has no build, the Warden no walls or nets.
  - Portals: `PortalId`/`SideId`, `MapDef.portals` (positions from SPEC §3.1), waves dealt round-robin
    over all 6 portals (temporary until RD3), Colossus spawns at a seeded portal, debug spawn by portal.
  - Bench peak with builds in place of structures (24 placeholder build bodies until RD3), soak short form
    green (2-player pairs and 6-player rotations; victory at wave 15 with invincible players and the
    Citadel held), autopilot without Armory/crates.
  - e2e specs updated (smoke: lobby → class → start → shop → combat; no Build tab, no crates).
  - Minor changeset.
- **Acceptance:** RD checks + I + Sim bench, and:
  - `grep -rnE "crate|cratePile|Armory|armory|repairZone|carryCap|emergency|kits\b|StructureId|structures/|building\.ts|radial|actionTaps|breaker|LaneId|sealed" apps/fort-frenzy/src --include=*.ts` prints nothing
    (art frame keys for kept-on-file art are allowed only under `src/host/render/gallery/`; list any hit
    under §8).
  - `pnpm --filter @pcg/fort-frenzy exec vitest run src/host/sim/__tests__/soak.test.ts` passes.
  - Tests: tuple v2 guards and encoding; snapshot round trip with the new shape; a 6-portal wave spends
    within ±1 of budget and only uses map portals; the ground field is built once per run (spy on
    `buildField`).
  - Test-runner: `pnpm e2e:fort-frenzy`.
- **Risks / fallbacks:** the cut leaves a hook nobody calls → delete it; a contract shape in SPEC is
  wrong for the code → fix SPEC §15 and log `[RD2] contract: …`. The milestone is large: use haiku helpers
  for grep lists and mechanical deletions, sonnet helpers for test rewrites; keep contract and sim logic.
- **Leave out:** builds, meters filling, hot side, regen, new kits, new art beyond idle portals.

### RD3: Sim slice

- **Goal:** the headless rules of the vertical slice: the build system and meter, the Warden's shield
  generator and jump-slam super, delayed regen, classes vs knights, the player-count table, the hot side
  with the active-portal cap and spawn flares, the 20 s card-then-shop build phase, solo lobby, and the
  balance harness.
- **Read:** SPEC §2 (classes), §4, §5, §6.1 (random pick), §7, §8 (class table, Warden), §9 (targeting,
  hot side, cap, player-count table), §9.3, §9.4, §11.1 (lobby minimum 1), §15.3, §15.4, §15.5,
  §15.9 (harness, tests); `sim/types.ts`, `content/types.ts`, `systems/waves/index.ts`,
  `party/index.ts`, `sim/sources.ts` (autopilot), `sim/ai/path.ts` (aggro, leash), `sim/classes/warden.ts`,
  `game.meta.ts`.
- **Depends on:** RD2 merged.
- **Order:** test-first per rule (each listed test before its feature).
- **Deliverables:**
  - Classes and knights live: `ClassDef` HP tier and damage band applied at spawn (SPEC §8 table; §8
    decision), `KnightDef` per knight; content for four classes, the Warden knight complete and the
    others' mains and supers as today.
  - `src/host/sim/builds/` core: meter (passive fill + per-knight action sources from content, a build's
    own damage or healing charges the super, never the meter; a super's own damage never charges the
    super; starts the run full; carries over; no fill in the build phase or while down or dazed), one
    active build per knight (registry hook for `maxActive` exceptions), placement by input type (tap at
    feet; aimed: throw within range, flight, landing, quick tap → feet; slide back cancels), HP builds
    targetable exactly like a knight (aggro radius, leash, nearest wins), charge builds untargetable,
    builds persist between waves, effects active in combat only, build HP bars data in events, behavior
    registry `builds/index.ts` (append-only).
  - Warden: shield generator (thrown, HP, radius, damage-reduction aura on knights and soldiers,
    strongest wins, §8); jump-and-slam super (airborne wind-up, then arc damage and stun as SPEC §8).
  - Delayed regen (4 s without damage, 8% max HP per 1 s tick, combat and build phase).
  - Player-count table (budget, boss HP, respawn), difficulty respawn multiplier, Quick Recovery floor
    rule (§8); waves 1–15 `hot` schedule data and the generator's additive hot-side inputs: hot share,
    mid-wave shifts, per-group hot sides for 12–15 (never the same side twice in a row), boss side hot,
    `players + 1` active-portal cap per spawn pulse with at least one hot-side portal; `portalFlare`
    SimEvent 1 s before each group; boss spawns at a seeded hot-side portal.
  - Build aim preview data in `sim/preview.ts` (landing point clamped to throw range, the build's
    radius, the throw range), one source for the sim's landing and the TV's preview.
  - Build phase: 20 s cap, card offer first (`card` intent = confirm), random pick at the deadline from
    the `cardPick:<wave>:<slot>` stream, ready ends early.
  - Solo: party minimum 1, auto-start and leader start with one Ready player; `game.meta.ts`
    `minPlayers: 1` (the gallery card then reads "1–6 players").
  - Autopilot uses builds through `sim/autopilot/builds.ts` (append-only; Warden policy).
  - Balance harness: `src/host/sim/balance/harness.ts` + `scripts/balance.ts` + package script
    `balance` (`--quick` = 1 seed): each knight in the policy registry, alone, autopilot, no cards, meter
    full, against `balance.harness` (standard wave from one portal, solo scaling) over 5 seeds; prints
    median, min, max clear time and % from the mean, flags outside ±20% and ±25%. Report only.
- **Acceptance:** Affected checks (game.meta) + I + Sim bench + `pnpm --filter @pcg/fort-frenzy balance --quick`, and tests:
  hot-side schedule (waves 1–3 one side, 4/6–8 one shift, 9/11 two shifts, 5/10 boss side, 12–15 per
  group and never twice in a row; ≥ 50% of budget on the hot side while hot, within the content share
  ± 10%); active portal cap (never more than `players + 1` portals per pulse, 2 in solo, all 6 with ≥ 5
  players, each pulse includes a hot-side portal); flare 60 steps before each spawn; build meter rules
  (passive rate, action rate, start full, carry over, no fill in build phase or while down, build damage
  charges super not meter, super damage charges neither); one active build replaces the old one; HP build
  aggro vs knight nearest tie-break; build persists across waves with its HP; regen timing (4 s, 8% per
  tick, interrupted by damage, runs in build phase); player-count table rows 1–6 (budget, boss HP,
  respawn 6 s solo / 10 s); Quick Recovery floor 4 s solo / 5 s; 20 s cap and random pick at timeout is
  identical for the same seed; solo lobby (one Ready player starts, leader start with one); determinism
  hash over 2 waves with builds.
- **Risks / fallbacks:** `generateWave` must stay content-free (lint) → pass sides and shares as
  parameters; the jump slam's airborne window must not make the Warden untargetable unless SPEC says so.
- **Leave out:** rendering, controller, other knights' builds, cards beyond the random pick, shop
  changes, enemy behavior changes, snapshot of builds (RD14).

### RD4: Controller slice

- **Goal:** the phone side of the slice: card pop-up, shop with the movement stick, and the 68 px build
  button with its meter ring and per-build gesture.
- **Read:** SPEC §2.6 (phone screens, icons), §10 (all), §15.6 (MeView, tuple v2), §15.7; art icons
  README, `icons/{act-*,role-*,card-*}.svg`; `controller/{layout,components,input,state,samples,copy}.ts`,
  `controller/screens/{combat,build,lobby,common}.ts`; `@pcg/controller-kit` index (`aimedGesture`,
  `tapGesture`, `bindGesture`).
- **Depends on:** RD2 merged.
- **Deliverables:** `layoutCombat` with the action button at 68 px (gaps ≥ 24 px, edges ≥ 64 px, re-laid
  offsets); build button: icon from `me.build.icon` (`act-shield`, `act-mine`, `act-beacon`, `act-flag`,
  `act-recall`), aimed or tap gesture from `me.build.input` (kit gestures, unchanged), clockwise meter
  ring (app `ChargeRing` variant: dimmed until full, steady amber when full, no pulse), recall state;
  status strip HP + base HP; card pop-up (full screen, no stick: growth header, three cards with rarity
  frames and marks, tap to select, Confirm, phase timer); shop (right 2/3, stick on the left third, team
  coins, rows with price, hold-to-confirm, Request, Ready top right, no tabs); class select cards show
  class role (`role-*` icon), main, super, build and input types; lobby shows Start for a solo leader;
  `?dev=1` samples for every new state; sender fills tuple v2.
- **Acceptance:** RD checks + I, and: `layoutCombat` tests at 644×300, 844×390, 932×430, 1180×820,
  1366×1024 with the 68 px button; tuple v2 encoding of every build gesture outcome (tap, aimed fire,
  cancel); card select → Confirm sends one `card` intent; ring state classes for empty, filling, full;
  `grep -rnE "from '[^']*host/" apps/fort-frenzy/src/controller` prints nothing; check:bundle ≤ 100 KB.
  Test-runner: `pnpm --filter @pcg/fort-frenzy exec playwright test controller`.
- **Leave out:** host code, sim, controller-kit changes (none needed: §8).

### RD5: TV slice

- **Goal:** the TV draws builds through their whole life, portals flare, enemies and builds show HP bars,
  build throws preview their landing, and the Warden's slam and jump slam use the new art.
- **Read:** SPEC §2.4–§2.6, §7 (build look), §9.6, §10.1 (aim previews), §15.2 (layers, frames); art
  README "Builds (redesign)", "Redesign poses", "Effects", "Map", "Layers"; `review/redesign/{builds,
motion,portals}.svg`; `render/types.ts`, `render/{rig,effects,groundMarks,map,keys}.ts`,
  `render/clips/warden.ts`, `scene/{worldView,wardenFx,aimPreview}.ts`, `ui/screens/hud.ts`; sim types.
- **Depends on:** RD2 merged (RD3 for checks only: "done, checks pending RD3" is fine).
- **Deliverables:**
  - Build-view API (additive in `render/types.ts`) and `scene/builds/<build>.ts` found by glob; a generic
    life cycle: flight (spin the `flight` frame, shadow on the ground), landed → active, `damaged` below
    50% HP, `destroyed` briefly → `scrap-ours`; amber HP bar only once damaged; faint dotted amber
    effect-radius ellipse; the frame-cost rule (per frame only alpha, crop, scale; §8).
  - Shield generator view: `shield-base` + `shield-shimmer-1..3` (~6 fps), drawn under the build.
  - Portals: `portal-flare` + the `<side>-flare` frame at attach `center` for the 1 s `portalFlare`.
  - Enemy HP bars: violet, only once damaged, width by enemy size, none for Scrap mites; the Colossus keeps
    its bottom bar.
  - Build aim preview: landing ellipse at the build's real radius plus its throw range, drawn from the
    sim's preview data (RD3 adds it; render only reads it).
  - Warden clips (`render/clips/warden.ts`): front and back slam impact switches group `slam` on and hides
    `hammer`/`hammer-glow` until the recover (no negative `sy`); `hammer-down-glow` pulses with the coil;
    `scene/wardenFx.ts` puts `slam-cracks` at `rig.attach('hammer-ground')` at `SLAM_IMPACT_MS`, fading
    ~1 s; jump slam: crouch → airborne (torso up ~34 units, shadow stays) → land with the same impact
    swap, `landing-dust` at the feet and `slam-cracks-wide` at `hammer-ground` (poses in
    `review/redesign/motion.svg`, keys in the README).
  - HUD: next-wave preview shows types and counts, never the hot side; lane bands gone.
- **Acceptance:** RD checks + I, and: asset-keys test covers every new frame key; a frame-cost test shows
  no texture or graphics rebuild per frame for a steady build; build life-cycle state picker tests
  (HP 49% → damaged; destroyed → scrap); HP bar hidden at full HP and for mites. Test-runner:
  `pnpm --filter @pcg/fort-frenzy exec playwright test gallery tv-ui`.
- **Leave out:** gallery pages (RD12), other knights' build views and clips (RD7–RD9), Brute and Charge
  cues (RD10).

### RD6: Slice wiring, debug panel, e2e

- **Goal:** the slice plays end to end from real phones: solo or with friends, the Warden throws shield
  generators from a charged meter, enemies pour from flaring portals, the build phase runs card → shop.
- **Read:** SPEC §9.5, §10, §11, §15.3, §15.6, §15.9 (e2e); `src/host/{game,main,debug,tv}.ts`,
  `src/host/net/**`; RD3–RD5 reports; `e2e/{helpers,smoke,reconnect,late-join,pause}.spec.ts`.
- **Depends on:** RD3, RD4, RD5 merged.
- **Deliverables:** net views fill `MeView.build`, growth header and card state, `TeamView` without hot
  side; `buildFires`/`buildAim` route into the sim; debug panel: spawn any enemy at any portal, fill a
  player's meter, force a hot side, show portal activity and hot-side state; `__pcg` hooks for builds
  and meters; e2e specs: `smoke` (solo start, wave 1, throw a shield generator, card confirm, shop,
  wave 2), `reconnect`, `late-join`, `pause` updated.
- **Acceptance:** RD checks + I, and: a session test that a `buildFires` edge places a build and acks
  nothing else; `PhoneInputSource` staleness still holds with tuple v2. Test-runner:
  `pnpm e2e:fort-frenzy`.
- **Leave out:** other kits, enemy changes, economy, resume of builds.
- **User checkpoint (RC1):** `pnpm dev:lan:fort-frenzy`; TV at `http://<LAN-IP>:5173/`; join by QR from
  an iPhone (Safari) and an Android (Chrome). (1) Solo: one phone, pick the Warden, Start alone, play
  waves 1–3. (2) Two phones (one Warden, one any knight), play waves 1–4. Judge: build button size, ring
  and feel (thrown aim, quick tap at feet, cancel); throw preview, flight and landing; shield generator
  read and HP bar; jump slam tell; portal flare (~1 s) and whether the hot side reads without being
  announced; regen pacing; card pop-up → shop in 20 s with the stick; enemy HP bars; lock one phone ~10 s
  mid-wave and confirm it reconnects. Notes become fix milestones per §5 rule 10.

### RD7: Ranger kit

- **Goal:** the Ranger complete: long-range bow, shockwave super, mines, and his cards.
- **Read:** SPEC §2.4 (Ranger), §6.1 (Ranger cards, Steady Aim card), §7 (mines), §8 (Ranger), §9.6
  (Hunter sees mines), §10.1; art README (mine, shockwave); `structures/mine/*`,
  `effects/{shockwave,mine-blast-ring,mine-blast}.svg`; `sim/cards/ranger.ts`, `sim/modules/steadyAim.ts`,
  `render/clips/ranger.ts`; RD3 builds core, RD5 build-view API.
- **Depends on:** RC1 approved (fixes merged).
- **Deliverables:** mines (tap at feet, one per full meter, up to 3 active, 4th removes the oldest; charge
  build, untargetable, trait `hidden` + `triggerRadius`; ground enemies only, Flyers pass over; trigger
  after the short delay; mine damage charges the super only); shockwave super using the `shockwave`
  frame in place of the code-drawn ring; Steady Aim as the unique passive card (visuals only when owned),
  Deadeye requires it; build cards Shrapnel Charge and Minefield; kept cards re-pointed; mine view:
  `mine/armed` full opacity ~1 s after placing, then 40% while live; `mine/trigger` at full opacity for
  the delay; then `mine-blast-ring` (ground) + `mine-blast` (effects); autopilot policy; content in the
  Ranger sections of `balance.ts` and `copy.ts`.
- **Acceptance:** RD checks + I + balance report includes the Ranger, and tests: 4th mine removes the
  oldest; Flyers never trigger; trigger delay in steps; mine damage charges super, not meter; Minefield
  raises the cap to 4; Deadeye excluded until Steady Aim is owned.
- **Leave out:** Hunter mine avoidance (RD10), gallery (RD12).

### RD8: Artificer kit

- **Goal:** the Artificer complete: nanite blast, healing cone, healing beacon, gauge as build meter,
  and his cards.
- **Read:** SPEC §2.4 (Artificer, gauge), §6.1 (Artificer cards), §7 (beacon), §8 (Artificer); art
  README (beacon, gauge rule); `structures/beacon/*`, `effects/beacon-pulse.svg`;
  `sim/classes/artificer.ts`, `sim/cards/artificer.ts`, `sim/modules/fieldMedic.ts`,
  `render/clips/artificer.ts`, `render/gauge.ts`; RD3 builds core, RD5 build-view API.
- **Depends on:** RC1 approved.
- **Deliverables:** nanite blast main (about 5 nanites at seeded random spots in a narrow cone over
  ~0.8 s, one burst per release, cooldown ≥ 0.8 s, combat RNG stream); super heals himself and knights
  in the wide cone, not builds; healing beacon (thrown, HP, heals knights in its radius; its healing
  charges the super, never the meter); meter action sources: damage + healing; Field Medic as the unique
  passive card, Wide Aura requires it, Plague requires Venom Bolts + Field Medic; Strong Arm (longer,
  faster build throws); Booster Beacon; backpack gauge = build meter (`k = floor(meter × 6)`, cell N full
  when `k ≥ 2N`, half when `k = 2N − 1`); beacon view with `beacon-pulse`; autopilot policy; content
  sections.
- **Acceptance:** RD checks + I + balance report includes the Artificer, and tests: nanite burst count,
  spread inside the cone and identical for the same seed; super heals knights only; beacon healing charges
  super not meter; gauge cells for meter 0, 1/6 … 1; Plague prerequisites.
- **Leave out:** gallery.

### RD9: Commander kit

- **Goal:** the Commander complete: shield bash, Reinforcements, rally flag, squad, and his cards.
- **Read:** SPEC §2.4 (Commander, footmen, flag), §6.1 (Commander cards, Morale), §7 (flag exception),
  §8 (Commander, squad), §10.1 (recall); art README commander rig notes; `review/redesign/commander.svg`,
  `structures/rally-flag/*`; `sim/classes/commander.ts`, `sim/squad/**`, `sim/cards/commander.ts`,
  `sim/modules/leadFromTheFront.ts`, `render/clips/{commander,footman}.ts`, `scene/{support,supportView}.ts`.
- **Depends on:** RC1 approved.
- **Deliverables:** shield bash main (short aimed hit with knockback; clip: shield-arm punch with
  `spark-ours` at attach `shield`; `shield-glow`, `scabbard-glow` in the glow list; slash, trail and
  `sword-tip` only while group `sword` is on, off by default); Reinforcements super (aimed throw of one
  soldier a short distance; quick tap aims toward the flag; charged by own damage + squad damage at a
  reduced rate; at the squad cap the button dims and the charge is held); squad starts at 2, no respawn,
  cap from content, survivors carry over; rally flag build (thrown; meter full → new flag replaces the
  old; meter not full + flag out → tap recalls; untargetable; stays until recalled or replaced, also
  between waves); flight art `rally-flag/flight-{pole,cloth,trim}` (cloth tinted, spun about its anchor);
  Morale card (merged with Lead from the Front: knights and soldiers near the flag or the Commander, one
  effect, no stacking); Rally Cry (50% seeded double spawn, +25% per extra copy to 100%, "×2" on the
  TV); Drillmaster, Reinforced Ranks, Heavy Bash; Warcry reuses the morale effect; remove the morale
  super visuals and Lead from the Front motes; aim preview for the flag uses the squad's flag ring;
  autopilot policy (own + squad damage counted for A1); content sections.
- **Acceptance:** RD checks + I + balance report includes the Commander, and tests: Rally Cry roll from
  the seeded stream (same seed → same doubles; 1 copy ≈ 50% over 1,000 seeded rolls ± 5%, 3 copies =
  100%); squad cap holds the charge; recall vs throw by meter state; flag survives a wave change; squad
  damage charges super at the reduced rate and never the meter.
- **Leave out:** gallery.

### RD10: Enemy changes + Colossus Charge

- **Goal:** the roster's redesign behavior, the per-wave enemy multiplier, and the Colossus's new move
  set with the Charge tell.
- **Read:** SPEC §9 (all: roster, answered-by, Flyer rule), §9.2, §9.6, §15.3 (BossBehavior), §15.5;
  art README "Redesign poses" (Charge), `effects/{brute-target,brute-target-arrow,charge-dust}.svg`;
  `sim/ai/**`, `sim/boss/**`, `render/clips/{brute,colossus,stalker,wasp}.ts`, `scene/{enemyFx,colossusView}.ts`;
  RD3 build traits.
- **Depends on:** RC1 approved.
- **Deliverables:** Brute build hunter (nearest targetable build at any distance on a per-target ground
  field reusing the hunted-field mechanism; fallback Grunt behavior; violet lock-on cue with
  `brute-target` (ground, under the build) + `brute-target-arrow` (anchor at its tip, just above the
  build)); Siege paths toward the base and stops only with something in range, priority players > builds
  > base, nearest within each, retargets when a player enters range; Flyer range up, ignores ground
  > builds; Hunter field prices sentries, damage-dealing builds and `hidden` trigger radii, stalks at
  > normal speed until its quarry is within ~5 tiles, then locks on (the flash moves to this moment) and
  > sprints; Flyers spawn only if a connected knight has `hitsFlyers`; `WaveDef.enemyMult` applied at
  > spawn (difficulty × player table × wave multiplier); Colossus Mk I slam + boulder at players, Mk II
  > adds Charge (lock on a knight, red lane marker, run knocking knights back, destroying HP builds it
  > crosses; mines trigger normally; the flag is untouched), Mk III adds Runner calls and the final-phase
  > shockwave; Charge tell clip (yoke down, paw, `charge-dust` at the feet during the run) and the red
  > lane marker (code).
- **Acceptance:** RD checks + I + Sim bench, and tests: Brute picks the nearest build at any distance,
  falls back after the last build dies; Siege priority order and immediate retarget; Hunter avoids a
  fixture `hidden` trigger radius and sprints only after lock-on; Flyer substitution by `hitsFlyers`;
  wave multiplier applies to HP and damage; Mk I/II/III move sets by wave; Charge destroys an HP build in
  its lane and not the flag; answered-by spot checks from SPEC §9.
- **Leave out:** gallery, enemy back views (v2).
- **User checkpoint (RC2):** the orchestrator first has a haiku helper run
  `pnpm --filter @pcg/fort-frenzy balance` and pastes the table. Then `pnpm dev:lan:fort-frenzy`, TV at
  `http://<LAN-IP>:5173/?debug=1`, 1–4 phones. Play each knight for a few waves (solo and with others);
  use the debug panel to spawn every enemy type at different portals and jump to waves 5, 10 and 15.
  Judge each kit's feel (main, super, build, meter pace), each enemy's new behavior and tell, the Brute
  bait tactic, the Charge, and the harness numbers against the ±20–25% rule; the user may set target
  values. Notes become fix milestones (numbers only in `balance.ts`).

### RD11: Economy

- **Goal:** the shared commons and card rules, the Warden's cards (his kit landed in the slice without
  them), per-wave class growth, the thin team shop with its pricing curve, and lower coin income.
- **Read:** SPEC §2.2, §3.4, §3.5, §6 (all), §6.1, §6.2, §9.1 (coins), §10.2; `sim/cards/{common,index}.ts`,
  `systems/cards`, `sim/shop/**`, content cards/shop/difficulty sections, `controller/copy.ts` commons and
  shop sections, `icons/{card-build,card-tinkerer,base-hp,base-armor}.svg`.
- **Depends on:** RC2 approved.
- **Deliverables:** 9 shared commons incl. Tinkerer (+build charge rate) and Quick Recovery's floor;
  picker: passive cards unique and rare, cards that need a passive appear only once it is owned
  (`requires` list), every TD exclusion kept; card marks per SPEC §6.1 (`card-build`, `card-tinkerer`);
  class growth at every wave end from the class table (bigger after bosses; uncapped stats only;
  additive) and the growth header data; shop: repair (rising price), sentry damage, range, third sentry,
  base max HP ×3, base armor ×3, priced to SPEC §6.2's curve (repair affordable after wave 2, a tier I
  around waves 3–4, tier III after saving), the Commander squad-stats item removed (now cards); coin
  income lowered; Warden cards per SPEC §6.1 (Challenger as the unique passive card: nearby enemies
  target him first; Wide Field; Reinforced Generator; Earthshaker without boss stagger; Fault Line
  reworked to a slowing fissure along the super's arc; kept cards re-pointed; `sim/cards/warden.ts` and
  the Warden card sections of `balance.ts` and `copy.ts`).
- **Acceptance:** RD checks + I, and tests: content validation (every card id, prerequisites, marks,
  shop targets); growth adds the class's stats at wave end and more after waves 5/10; growth never
  touches capped stats; Wide Aura/Deadeye excluded before their passive; Challenger makes an enemy in
  aggro range pick the Warden over a nearer knight; Fault Line needs Aftershock + Earthshaker; base max
  HP and armor tiers
  apply; repair price rises per purchase; an autopilot economy run buys about 10 items over 15 waves
  and nothing before wave 2 (coin curve check, logged numbers).
- **Leave out:** knight cards owned by RD7–RD9 (only commons and rules here), reroll, crits.

### RD12: Art pass

- **Goal:** the gallery shows every redesign piece, the retired art is deleted, and the asset checks pass
  with nothing dangling.
- **Read:** SPEC §2.4–§2.6, §15.2, §15.10; art README; `review/redesign/obsolete.md`;
  `render/gallery/**`, `src/presentation/__tests__/*`.
- **Depends on:** RC2 approved (RD7–RD10 merged).
- **Deliverables:** gallery pages: builds in every state (shield generator, beacon, mine armed/trigger,
  rally flag flight parts), portals idle/flare per side, every new effect, the Warden `slam` group, a
  Commander `sword` group toggle, portals on the map page in place of lanes; turret, autotile and other
  kept-on-file pages removed (the art stays packed, unused); deletion of exactly the obsolete.md
  "Removed outright" files (Armory kiosk and pad, repair-zone pad, power cell, `carry-pip`,
  `carry-pip-empty` and its review sheet, icons `cell`, `act-pickup`, `act-deliver`, `act-buy`,
  `act-throw`, `act-give`, `act-drop`) and their `sprites.json` entries; the manifest test's icon list
  and SPEC §2.6 updated to match (art is covered by one `art/neon-knights/**` LICENSES glob, so
  deletions need no LICENSES edit).
- **Acceptance:** RD checks + RD12's I, and: asset-keys test (every key the code references exists),
  rig-contract (every rig has its required parts, views, attach points and optional groups), manifest
  and unlit tests pass; `pnpm --filter @pcg/fort-frenzy assets` exits 0. Test-runner:
  `pnpm --filter @pcg/fort-frenzy exec playwright test gallery` (no console errors, no fallback shapes,
  screenshots).
- **Risks / fallbacks:** a piece doesn't work in engine → list it for the art agent under §7 Blockers with
  the frame name and what's wrong; never redraw.
- **User checkpoint (RC3, art):** `pnpm dev:lan:fort-frenzy`; open `http://<LAN-IP>:5173/?gallery=1` on
  the TV from across the room. Judge: builds in every state (layering: rings under their build), portals
  and flares, effects, the Warden slam and jump poses, the Commander shield and bash, the Charge tell,
  tint in all six player colors, glow and bloom. Notes become RD12-fix or the owning kit's fix.

### RD13: Audio cues + TV and phone polish

- **Goal:** sound for the redesign's events and the remaining UI details.
- **Read:** SPEC §2.6, §4 (summary), §12, §14 #4, §15.10; `host/audio/**`, `scripts/pick-sfx.ts`,
  `assets/LICENSES.json`, `host/ui/screens/{summary,lobby,home}.ts`, `controller/screens/{summary,lobby}.ts`.
- **Depends on:** RC2 approved; pre-flight "Kenney packs + ffmpeg".
- **Deliverables:** SFX ids and cues for build placed, build destroyed, mine trigger and blast, shield
  hit, beacon heal tick (rate-limited), portal flare, Brute lock-on, Colossus Charge wind-up, jump-slam
  landing, Rally Cry double; crate and structure cues removed; files converted to
  `audio/neon-knights/` with LICENSES entries; TV summary awards from the new `RunStats` (builds placed,
  healing, damage; no crate awards); TV lobby and phone lobby copy for 1–6 players; phone summary
  matches.
- **Acceptance:** RD checks + I, and: every `SfxId` has a file and a LICENSES entry; a cue fired 20 times
  in a step is capped; `git diff --quiet redesign/fort-frenzy -- apps/fort-frenzy/audio/kenney`.
- **Leave out:** music (v2), anything in RD11 or RD12's files.

### RD14: Lifecycle, resume, solo, soak, bench

- **Goal:** the redesigned run survives a TV reload, late joins and full soak runs at every player count
  including solo, inside the performance budget.
- **Read:** SPEC §4, §11 (all), §15.2 (performance), §15.8, §15.9; `sim/{snapshot,lifecycle,soak,peak}.ts`,
  `net/{resume,session}.ts`, `scripts/{soak,bench}.ts`, `host/stress.ts`, e2e `resume*`, `late-join`.
- **Depends on:** RD11, RD12, RD13 merged (RC3 notes may run beside it, in disjoint directories).
- **Deliverables:** snapshot saves builds (position, HP or charges, owner), meters, mines, squad soldiers
  with Veterans gains and the flag, growth state; restore puts them back exactly; late joiner gets a full
  meter (a Commander gets 2 soldiers); soak forms: each knight solo, 10 pairs, 4 six-player rotations,
  two seeds, each twice; bench peak with 24 real builds, 30 soldiers, 150 enemies; `?debug=1&stress=1`
  with builds; perf fixes logged.
- **Acceptance:** RD checks + I + Sim bench (p99 ≤ 2 ms at peak), and tests: snapshot round trip with
  builds, mines and a flag (same hash at the build phase; restored world gives the same snapshot); old
  `v` discarded; late join in combat waits; soak short form passes; full soak
  (`pnpm --filter @pcg/fort-frenzy soak`) passes once, duration logged. Test-runner:
  `pnpm --filter @pcg/fort-frenzy exec playwright test resume resume-new-room late-join stress`.
- **User checkpoint (RC4):** TV at `http://<LAN-IP>:5173/` with 2–6 phones: a full 15-wave run on Normal
  (target 20–24 min), plus a few waves on Easy and Hard and a solo run to wave 5. Judge pacing per wave,
  the hot side (felt but never announced; shifts at 4, 6–9, 11; per-group at 12–15), economy (about 10
  purchases, nothing affordable in the first waves), card and growth value, the three Colossus visits,
  regen vs support healing, any crash (the debug panel's replay goes to the fix agent). Then reload the
  TV mid-build and resume. Notes become fix milestones; tuning only in `balance.ts`.

### Fix milestones (`RD<N>-fix-<k>`)

Same model as RD<N>. **Read:** the checkpoint notes + RD<N>'s Read. **Acceptance:** RD<N>'s
Acceptance + one runnable check per note where possible (a test, a config value, a grep); pure feel or
visual notes are re-judged at the next checkpoint.

## 4. Subagent brief template

```text
You are building {RD#}: {milestone name} for Fort Frenzy (apps/fort-frenzy), part of the players-only
redesign.
Goal: {Goal}
Branch: `{build/rd<N>-<slug> or build/rd<N>-fix-<k>}`, from `redesign/fort-frenzy`.
{Worktree: you work ONLY in {absolute worktree path}. Run every command as `cd {path} && …` and use
absolute paths. Never touch the main checkout. | Main checkout: create the branch from
redesign/fort-frenzy and work there.}

Read ONLY: apps/fort-frenzy/REDESIGN_BUILD_PLAN.md §2, the §3 entry for {RD#}, §3 cut map and freeze
points, §8 Build decisions; {Read list}. The redesign's source of truth is SPEC.md (rewritten in RD0);
if SPEC.md and REDESIGN.md disagree, follow REDESIGN.md, fix SPEC.md in this milestone and log it.
{For fix milestones: Checkpoint notes: …}

Deliverables: {Deliverables}
Acceptance (build until every item passes; run them yourself, EXCEPT Playwright/e2e: never run
`pnpm e2e:*` or `playwright test`; write or update the specs, and the orchestrator's test-runner runs
them): {RD checks | Affected checks} + Inputs unchanged (I) + {Acceptance items}.
Order: {Order or "none"}
Leave out: {Leave out}
Risks / fallbacks: {Risks / fallbacks}

Rules:
- Frozen contracts ({freeze points in force from §3}): additive changes only. When you add, update the
  contract file + the matching SPEC.md section + one line `- [RD#] contract+: …` under Build decisions.
- Art, brand and audio packs are inputs: never edit, redraw, regenerate or restyle anything under
  apps/fort-frenzy/{art,brand,public,audio/kenney} or src/styles/brand.css (RD1 merges art/redesign;
  RD12 deletes only its listed files). If an asset is missing or wrong, write it under Blockers for the
  art agent with the frame name; no placeholders are needed (the redesign art is finished).
- Shared code (packages/**, apps/relay, other apps) stays game-agnostic and backward compatible. This
  plan expects no shared change; if you find you need one, write a Blocker and stop.
- Append-only registries and sectioned files (§3): append or edit only your section.
- Live harness: if a dev server runs from the main checkout, don't change its working tree.
- Add a changeset (`pnpm changeset --<level> @pcg/fort-frenzy -m "…"`) for shipped-code changes.
- If you can spawn agents, hand side work to cheaper helpers: haiku for file lookups, grep lists, running
  commands and digesting long logs; sonnet for docs research, drafting tests or fixtures and mechanical
  multi-file edits. Keep this milestone's hard logic for yourself. Ask helpers for short answers.
- A choice the spec and this plan don't cover: pick the simplest, log one line under Build decisions.
- Blocked: write `- [RD#] YYYY-MM-DD: …` under Blockers, commit, stop. Don't guess.
- If a dependency isn't merged yet and only its checks are missing, finish everything else and report
  "done, checks pending RD#".
- Done: tick your Progress items in REDESIGN_BUILD_PLAN.md, commit, `git rebase redesign/fort-frenzy`,
  rerun Acceptance if the rebase pulled anything in. Don't merge, don't push.
- Reply in 150 words or fewer: what was built, what was deferred, blockers, branch name, which e2e specs
  the test-runner should run.
```

## 5. Orchestrator rules

1. Read only `apps/fort-frenzy/REDESIGN_BUILD_PLAN.md`. Never read source code. Trust subagent reports
   and the checklist.
2. To resume: read §6 Progress, §7 Blockers and `git log --oneline -15`, then run §1 pre-flight (quick
   checks only).
3. One subagent per milestone via the Agent tool with the §3 `model`. Parallel milestones run in the same
   turn, each in its own manual worktree (§2), launched without `isolation`; serial ones run in the main
   checkout. RD0, RD1 and RD2 run alone.
4. **Use cheaper helper agents for everything that isn't milestone work:** `haiku` for reading and
   summarizing files, logs, diffs or command output, running pre-flight and check commands, creating and
   removing worktrees, ticking the checklist and logging Blockers / Build decisions here, and other
   mechanical edits; `sonnet` for research, drafting checkpoint instructions and small judgment fix-ups.
   Ask each helper for only the answer you need (failures only). Use `opus` only where §3 says so. A
   helper may read source code to answer a narrow question; you still don't.
5. Merge per §2 in dependency order (§3 graph). Merge a deferred-check dependency first, then resume the
   dependent milestone.
6. Before each merge, spawn a `test-runner` agent (`model: "haiku"`) on the milestone branch (in its
   worktree) for the milestone's e2e items; after each merge, run the milestone's non-e2e Acceptance on
   `redesign/fort-frenzy`. Only failures come back; on failure, resume that milestone's subagent with the
   output. Run each e2e set at most once per milestone; after a fix rerun only failed specs. After
   stopping an e2e run, check that ports 5175 and 8790 are free.
7. Stop at user checkpoints (RC0–RC4) and unresolved Blockers. Tell the user exactly what's needed: the
   command, the URL or file, what to judge, the question to answer. Checkpoint notes become fix subagents.
8. No extra reviews, audits or re-exploration unless an Acceptance check fails.
9. Before each parallel wave, confirm §1 "Worktrees ignored" and "No stale plan branches or worktrees".
10. Route checkpoint notes by owner directory: phone UI → RD4-fix; TV render, scene, HUD → RD5-fix (or
    the kit or enemy milestone that owns that rig, build view or clip after RD6); host wiring, net, debug,
    flow → RD6-fix (RD14-fix after RD14); build-system rules, meter, hot side, regen, scaling → RD3-fix; a
    knight's kit → RD7/8/9-fix; enemies and the Colossus → RD10-fix; cards, growth, shop → RD11-fix;
    gallery and art assembly → RD12-fix; audio and summary → RD13-fix; numbers and pacing → a fix on the
    owning milestone changing only `src/content/balance.ts` (map layout: `map.ts`). Fix milestones in
    disjoint directories run in parallel in worktrees.
11. Art problems go to the art agent: write them under §7 as `[art]` with the frame names, and tell the
    user at the next stop.
12. When everything in §6 is checked, run RD checks + `pnpm check:affected` + `pnpm e2e:fort-frenzy` once
    more on `redesign/fort-frenzy` via a test-runner, then print §9.

## 6. Progress checklist

- [x] Pre-flight passed (S1)
- RD0 Spec rewrite
  - [x] Tag `fort-frenzy-td-final` on `main`; branch `redesign/fort-frenzy`
  - [x] SPEC §1–§14 rewritten; §15 contract sketches; decision log rows
  - [x] **User approved RC0**; merged
- RD1 Art merge, rename, de-theme
  - [x] `art/redesign` merged; rig-contract and manifest tests updated
  - [x] `engineer` → `ranger`, `quartermaster` → `artificer`
  - [x] Theme layer removed (`src/presentation/`, no ThemeId, no theme row); ESLint pattern; major changeset
  - [x] Merged; e2e green
- RD2 Cut + contracts + portals
  - [x] Contract files to the redesign shapes (tuple v2, views, snapshot, content and sim types)
  - [x] Crates and QM supply kit cut
  - [x] Structures, building, Fortify, Mason, structure cards and shop items cut
  - [x] Action table, build arc, radial, Build tab cut; breaker and rebuilds cut
  - [x] Lanes → 6 live portals
  - [x] Tests, soak, bench, autopilot, e2e updated; merged; e2e green
- RD3 Sim slice
  - [x] Classes vs knights; build system core + meter; Warden shield generator + jump slam
  - [x] Regen; player-count table; hot side + cap + flares; 20 s build phase + random pick
  - [x] Solo lobby; autopilot builds; balance harness
  - [x] Merged
- RD4 Controller slice
  - [x] 68 px build button + ring + gestures; card pop-up; shop + stick; class select; dev samples
  - [x] Merged
- RD5 TV slice
  - [x] Build-view API + life cycle + shield generator; portal flare; HP bars; throw preview; HUD
  - [x] Warden slam group swap, jump slam, cracks, dust
  - [x] Merged
- RD6 Slice wiring
  - [x] Views, input routing, debug panel, `__pcg`, e2e specs
  - [x] Merged; e2e green
- [x] **User approved RC1** (slice on phones and TV)
- RD7 Ranger
  - [x] Mines + shockwave + cards + views; merged
- RD8 Artificer
  - [x] Nanite blast + heal cone + beacon + gauge + cards; merged
- RD9 Commander
  - [x] Shield bash + Reinforcements + flag + squad + cards; morale visuals removed; merged
- RD10 Enemies
  - [x] Brute, Siege, Flyer, Hunter, `hitsFlyers`, wave multiplier
  - [x] Colossus Mk I–III + Charge + tells; merged
- [x] **User approved RC2** (kits, enemies, balance report)
- RD11 Economy
  - [x] Commons + card rules + marks; Warden cards; class growth; shop + pricing + coins; merged
- RD12 Art pass
  - [x] Gallery pages; retired art deleted; asset checks (merge and gallery e2e: orchestrator)
- RD13 Polish
  - [x] SFX + cues + LICENSES; summary awards; lobby copy; merged
- [ ] **User approved RC3** (gallery on the TV, solo play)
- RD14 Lifecycle + resume + soak
  - [ ] Snapshot with builds, meters, squad; late join; resume e2e
  - [ ] Soak (solo, pairs, six) + bench + stress; merged
- [ ] **User approved RC4** (full run + resume)
- [ ] Final checks green on `redesign/fort-frenzy`
- [ ] Final handoff printed

## 7. Blockers

_None._

Format: `- [RD#] YYYY-MM-DD: what's blocked, what was tried, what's needed from whom.` Art problems:
`- [art] YYYY-MM-DD: frame name, what's wrong` (for the art agent).

## 8. Build decisions

Format: `- [RD#] decision: one line, with the reason.` (`contract+:` for additive contract changes.)
`[plan]` lines were set while writing this plan; RD0 folds them into SPEC.md.

**Process**

- [plan] decision: land on a local integration branch `redesign/fort-frenzy` and ship as one PR (user,
  2026-11-18): AGENTS.md routes everything to `main` through PRs, and a Version Packages merge would
  otherwise deploy a half-done redesign.
- [plan] decision: the Warden is the slice knight (user, 2026-11-18): his shield generator proves the
  shared thrown, HP-based, targetable build pipeline once, so RD7–RD9 only add their own build.
- [plan] decision: no placeholders: the redesign art finished on `art/redesign` before planning
  (REDESIGN §0.4 assumed it would come later). RD1 merges it; each feature milestone wires its own art;
  RD12 does the gallery and deletions.
- [plan] decision: RD12 deletes exactly obsolete.md's "Removed outright" files and their `sprites.json`
  entries (user, 2026-11-18); "kept on file" art stays on disk and in the atlas, unused.
- [plan] decision: keep `art/neon-knights/` and `audio/neon-knights/` (no flatten): `build-atlases.ts`
  treats `art/<set>` as the root, 13 clips import rig JSON by path, the art README and review sheets cite
  the path, and the art agent owns the folder; flattening buys nothing once the theme layer is gone.
- [plan] decision: `src/themes/` becomes `src/presentation/` (PresentationShared, PresentationHost, rigs,
  clips): the layer stays a presentation boundary the sim can't import, minus theme selection. The ESLint
  `themes` pattern changes with it (RD1, Affected checks).
- [plan] decision: cut crates, structures, the action table, build arc, Build tab and breaker first in
  RD2 (they have no replacement or are replaced by a new system); replace lanes with portals in RD2 too,
  because the map and wave contracts change there and spawning needs a replacement in the same step.
- [plan] decision: contracts are settled in SPEC §15 by RD0 and implemented once in RD2 (code can't hold
  new contract types without compiling against them); they freeze after RD2 for the parallel waves.
- [plan] decision: `PROTOCOL_VERSION` goes 1 → 2 in RD1 and stays 2 for the whole redesign: phones and
  TV always ship from one commit, so only the production change (1 → 2) matters. The snapshot `v` bumps
  whenever its shape changes (old saves are discarded, never migrated).
- [plan] decision: no shared-code change: `layoutCombat`, `ChargeRing` and `RoundButton` are
  Fort Frenzy's own; the build button reuses controller-kit's `aimedGesture` and `tapGesture` unchanged;
  `radialGesture` stays exported (frozen API) and unused; catalog validation already accepts
  `minPlayers: 1`; the relay is game-agnostic (`maxPlayers` 8). So no Workspace checks and no relay
  redeploy.
- [plan] decision: one changeset level for the release: RD1's **major** (protocol 2, old saves dropped);
  the art branch's minor note merges in with it.
- [plan] decision: the balance harness is a report, not a gate: `balance.harness` content (standard wave:
  12 Grunts, 4 Runners, 1 Swarm group, 1 Brute from `bottom-w`, solo scaling, Normal, 5 seeds, no cards,
  meter full) until the user sets values at RC2.
- [plan] decision: per-wave class growth, commons, card rules and the shop are RD11; each knight's own
  cards (passive, build cards, kept and changed cards) belong to that knight's kit milestone, so card
  modules sit beside the class code they hook. The Warden's kit lands in the slice (RD3) without cards,
  so RD11 owns his cards.
- [plan] trap (from the TD plan): agents can't judge GPU performance (headless software GL); per frame,
  change only alpha, crop and scale, never re-upload text or rebuild graphics (FF7-fix-1, FF8, FF9);
  render code names frames only through typed keys (`fk`, `ik`); `pnpm assets` runs before build, test
  and typecheck; tests that pin balance numbers break on tuning, so update them in the same commit;
  `Sim.spawnEnemy/place/addSoldier` bypass the command log (use commands in replays); bench scenarios run
  one per process; e2e uses `__pcg.speed(0)` + `advance` and `?bloom=0&fps=15`, never sleeps.

**Redesign gaps and choices (REDESIGN didn't say; simplest option picked)**

- [plan] decision: stale lines in REDESIGN: §0.4 placeholders (art is done), F2's "(A5 said 30 s)"
  (20 s everywhere), E3's "Code IDs: Engineer = Ranger" (G2 wins: the code ids become `ranger` and
  `artificer`), C5's Reinforcements "(as the old super)" (the old super was morale; read it as F1's
  aimed throw of one soldier), the Migration impact heading "so far: group A" (it covers A–G).
- [plan] decision: portals `bottom-w` (cols 9–10, row 23), `bottom-e` (cols 25–26, row 23), `left-n`
  (col 0, rows 11–12), `left-s` (col 0, rows 18–19), `right-n` (col 35, rows 11–12), `right-s` (col 35,
  rows 18–19); sides `left`, `bottom`, `right`. Side portals sit in the lower two-thirds; a starting
  layout to tune in `map.ts`.
- [plan] decision: active portals are chosen per spawn pulse: `min(players + 1, 6)` portals, always
  including at least one hot-side portal while a side is hot; the hot side's share (content, start 0.55)
  goes to its portals and the rest is spread over the others. Solo: one hot-side and one other portal.
- [plan] decision: mid-wave hot-side shifts happen at 1/2 (one shift) or 1/3 and 2/3 (two shifts) of the
  wave's duration, to a different side, seeded (`waves:<n>`); the boss spawns at a seeded portal on the
  hot side.
- [plan] decision: the class table's damage band is a multiplier on the knight's attack damage (tank
  0.9, marksman 1.15, support 0.8, control 0.95) and the HP tier multiplies a baseline knight HP (1.6,
  0.8, 0.9, 1.0); starting values in `balance.ts`.
- [plan] decision: `WaveDef.enemyMult?: { hp?: number; damage?: number }` (default 1); order
  difficulty × player-count table × wave multiplier (G3), baked in at spawn.
- [plan] decision: respawn = base(players) × difficulty (Easy 0.8, Normal 1, Hard 1.2 to start); Quick
  Recovery subtracts 2 s per stack but never takes it below 4 s solo / 5 s otherwise (the floor never
  raises a respawn that's already shorter).
- [plan] decision: build effects (shield aura, beacon healing) run in combat only; builds don't regen;
  the meter doesn't fill while the knight is down or dazed; a dead knight's builds stay on the map.
- [plan] decision: the shield generator's damage reduction is a status effect (strongest of overlapping
  generators wins), applied after card damage reduction and outside its +40% cap.
- [plan] decision: beacon healing charges the Artificer's super (like build damage), never the meter;
  super healing charges neither. Field Medic healing (card) charges the super as before.
- [plan] decision: v1 has no offensive thrown build, so every quick-tapped thrown build lands at the
  knight's feet; the Commander's quick tap with the meter not full and a flag out recalls; recall never
  uses the meter. The flag's aim preview uses the squad's flag ring as its radius.
- [plan] decision: the Brute reaches its build on a per-target ground field (the hunted-field
  mechanism keyed by the build's tile), so "straight for the build" still works with v2 terrain.
- [plan] decision: the Hunter's player-color flash moves to the lock-on moment (quarry within ~5
  tiles), and its field prices sentries, damage-dealing builds and `hidden` trigger radii.
- [plan] decision: the Colossus Charge destroys HP builds it crosses, triggers mines like any ground
  enemy, and leaves the rally flag alone (the flag is untargetable).
- [plan] decision: `CardDef.requires` becomes a list (1 or 2 ids), so a passive card can gate cards
  that improve it (E1) with the combo rule's check.
- [plan] decision: card marks: `card-build` for Shrapnel Charge, Minefield, Wide Field, Reinforced
  Generator, Booster Beacon and Strong Arm; `card-tinkerer` for Tinkerer; `card-passive` for Steady Aim,
  Challenger, Field Medic, Morale, Deadeye and Wide Aura; `card-squad` for Forced March, Veterans, Last
  Stand, Drillmaster and Reinforced Ranks; `card-attack` for Heavy Bash and the kept attack cards;
  `card-super` for Blast Radius, Earthshaker and Rally Cry; the rest keep their TD marks; `card-supply`
  goes on file, unused.
- [plan] decision: Morale reaches allied knights and soldiers inside either area (flag or Commander),
  one effect; Warcry gives nearby knights the morale effect briefly and reuses its flash.
- [plan] decision: card selection is phone-local; Confirm sends the existing `card` intent; at the 20 s
  deadline the host picks from the `cardPick:<wave>:<slot>` stream. `MeView.screen` stays `build`; the
  phone shows the pop-up until `cards.picked` is set, then the shop.
- [plan] decision: late joiners start with a full meter (a Commander with 2 soldiers); two Commanders
  each keep their own squad and flag.
- [plan] decision: enemy code ids stay (`grunt`, `runner`, …); G2 renames only the knights. Display
  names live in one table in `src/presentation/shared.ts`.
- [plan] decision: `RunStats` drop crate and structure counts and add builds placed and healing done;
  the summary's award cards follow (RD2 shape, RD13 copy).

**RD0 (spec rewrite; each is a SPEC §15.11 row)**

- [RD0] decision: `KnightId` is the knight and `ClassId` stays its alias (the wire's `classId` and the
  `class` intent); REDESIGN's "class" is `RoleId`, and `ClassDef` is keyed by it (#94): no rename churn.
- [RD0] decision: sentry upgrades keep their `archer_*` code ids; `base_hp` is new and a tier raises
  current HP by the same amount; every shop item is always visible (#95): G2 renames only knights.
- [RD0] decision: `AckReason` drops `crates`; `cap` = shop item at its max tier (#96): nothing is carried.
- [RD0] decision: `InputTuple` v2 = move, main, super and build aims, flags (4 = build aiming), main,
  super and build fire counters (12 fields); the sim resolves a build press from state at its step
  (full → place/throw, else Commander flag out → recall) (#97): the build uses the attack grammar.
- [RD0] decision: regen isn't a heal (no hooks, charge or stats; not while down or dazed) (#98): it
  would charge the Artificer's super from everyone's regen.
- [RD0] decision: late joiners start with no class growth, like no cards (#99): simplest.
- [RD0] decision: the leader can force-start with one player Ready (#100): "can start alone" (A).
- [RD0] decision: builds don't snap to tiles; thrown landings clamp to the playfield outside the
  Citadel; a new build removes the old one at release (#101): nothing a build does needs the grid.
- [RD0] decision: effects add `guard` and `taunt`; `morale` carries damage, attack and move speed;
  `haste`, `tower_defense`, `aura_mason`, `aura_bodyguard`, `aura_lead_from_the_front` go (#102).
- [RD0] decision: squad cap starts at 4; soldiers keep HP between waves (no regen); the snapshot keeps
  soldier HP and Veterans gains and the flag as a build (#103): C5's "about 4–5"; regen is for knights.
- [RD0] decision: `TvView.laneWarnings` is removed; the World scene draws the portal flare (#104).
- [RD0] decision: the 68 px build button keeps the (−118, +20) offset; it meets every rule at 844×390
  (#105): F1's re-layout isn't needed at the reference viewport.
- [RD0] decision: Reinforcements' quick tap with no flag out throws straight ahead (#106): F1 gap.
- [RD0] decision: SPEC's RD0 grep has two intentional hits outside §15.11's old rows: the card id
  `siege_breakers` (ids sketch, §15.4) and `breakerWallCost` in the `RulesDef` removed-fields note.
- [RD0] note: `art/redesign` is already an ancestor of `main` (PR #34 merged it, and the art folders
  match), so RD1's `git merge --no-ff art/redesign` is a no-op.
- [RD0-fix-1] decision: the end-of-run option says **Change Knight** and the screen is "knight select"
  in SPEC prose (#107, user RC0): players choose a knight, not a class; the `class` intent, `classId`
  and the `'classes'` leader option keep their ids (#94). This plan's RD4 text still says "class
  select" (same screen). REDESIGN never named the button, so it is unchanged there.
- [RD0-fix-1] decision: the Bombard's priority is base > players > builds, nearest within each (#108,
  user RC0); simplest reading of "retargets the moment a player enters range" is now "a higher-priority
  target", and §3.3's "shells the base only when nothing else is in range" became "base first". SPEC
  §9 and §15.5 and REDESIGN D1 updated; #61's old order stays as history.
- [RD0-fix-1] decision: base respawn is 15 s for 5–6 players (#109, user RC0); difficulty multiplier
  and Quick Recovery unchanged; SPEC §5, §9.4 and REDESIGN A3, A6 updated.
- [RD0-fix-1] decision: §13 gains a v2 row for per-player stats banners on the end-of-run screen
  (#110, user RC0); v1's summary and award cards are unchanged.
- [RD1] decision: step (1) was a no-op: `art/redesign` is already an ancestor, and its commit already updated `rig-contract.test.ts` and `manifest.test.ts` (attach, groups, icon ids), so the tests needed nothing; recorded as an empty commit.
- [RD1] decision: the manifest keys by art set as SPEC §15.4 says: `AssetManifest.sets`, `ArtSetAssets` (was `ThemeAssets`; field `set`), `ArtSetId`, and the constant `ART_SET = 'neon-knights'` in `src/presentation/types.ts` (read by `build-atlases.ts`, `host.ts` and the loaders). `generated/keys.ts` `atlasFiles[].theme` became `.set`.
- [RD1] decision: `rigFor.class` and `CLASS_RIG` (presentation) are gone: a knight's rig id is its `ClassId`. `rigFor.enemy/soldier/structure` and `map.lanes` stay until RD2 (lanes, structures). `ui/labels.ts` keeps its own identity `CLASS_RIG` for portrait files.
- [RD1] decision: `PROTOCOL_VERSION` 2 and `SNAPSHOT_VERSION` 2; the only home rows now are create and difficulty (Normal default); the leader `theme` intent and `TeamView.theme` are removed from the wire.
- [RD1] decision: the phone's "Change Knight" copy stays "class" wording until RD4; renamed copy only (Engineer/Quartermaster to Ranger/Artificer, a/an fixed).
- [RD2] decision: the wire contract landed first (step 1), which left the action table, build arc, Give, the `build`/`give` intents and crate input unreachable, so their phone, view and input paths went in step 1 and the dead sim code in steps 2–3 (the "hook nobody calls" rule); steps 4 and 5 had nothing left of their own and are folded into steps 1 and 3.
- [RD2] contract: `SNAPSHOT_VERSION` is 3, not 2 (RD1 had already used 2 for the renamed ids); SPEC §15.8 and §15.11 fixed.
- [RD2] decision: until RD4 the phone's build button keeps the old action button's size and spot, is tap-only (no aimed build gesture, flag 4 never set) and stays dimmed while `me.build.mode` is `none`; the build phase shows the shop view (coins, the private card offer, shop rows, Ready) with no tabs and no stick.
- [RD2] decision: `MeView.build` comes from a knight → build table in `net/views.ts` (shield generator, mines, beacon, rally flag; `act-*` icons) until RD3 reads it from content; `meter` stays 0, so every button is dimmed except the Commander's recall (none can happen yet: nothing plants a flag until RD9).
- [RD2] decision: the autopilot only moves and fights (no Armory, crates or structures); soak and the recorder ready every slot 2 s into each build phase.
- [RD2] decision: the `aura_field_medic` effect keeps its id with no stats (Light Load's carry relief went with the crates); RD8 gives it a use.
- [RD2] decision: commits: step 1 alone; steps 2–6 landed as one commit (the content-type rewrite, the structure cut and the portals touch the same files, and the sim didn't compile between them); step 7's tests, soak, bench and e2e specs came with them.
- [RD2] contract: `Content` keeps arrays and nullable singletons (`knights`, `classes`, `builds`, `scaling: PlayerCountRow[]`, `harness`), not SPEC §15.4's records: the catalog already looks content up by id (SPEC §15.4 note, #111).
- [RD2] contract: transitional fields until their milestones remove them: `KnightDef.passive?` (always-on Steady Aim, Field Medic, Lead from the Front until each kit milestone), `KnightDef.super.selfEffects`, `AttackDef.shape 'buff'`, `EFFECT_IDS` `aura_lead_from_the_front` and `haste` (appended after the v2 list) until RD9; the Warden has no passive until RD7/RD11 (Mason is cut).
- [RD2] contract: `EnemyDef.vsStructure` is gone; the Colossus's ×1.5 on the Citadel is its boss param `baseMult`; `DangerMarker.payload.hitsBuilds` also gates the Citadel, as `hitsStructures` did.
- [RD2] contract+: `Sim.addBuild(kind, x, y, slot)` (tooling, replaces `place`: the bench's 24 placeholder builds and resume tests), `StateExtras.addBuild` and `repriceHunters` (replaces `rebuildFields`: the ground field is built once in `createState`), `__pcg.addBuild` / `builds()` and `stats().builds` on the TV debug API.
- [RD2] decision: knight HP = `rules.knightHp` 110 × class HP tier (Warden 176, Ranger 88, Artificer 99, Commander 110); the damage band waits for RD3 ("classes vs knights"). Respawn = player-count row × difficulty `respawn`, set at each wave start; Quick Recovery keeps its −5 s cap until RD3's floors. `buildCapMs` stays 45 s until RD3. Coins = budget × `coinRate` 1 × difficulty.
- [RD2] decision: the squad stays at `squad.start` (2) all run until RD9's Reinforcements (the TD growth by boss waves is cut with `squad.size`).
- [RD2] decision: waves deal groups round-robin over all six portals (`generateWave` with `lanes: PORTAL_IDS`; the v2 `sides`/`hot`/`hotShare`/`activeCap` inputs are typed and unused until RD3); the boss spawns at `rng.pick(PORTAL_IDS)` on the same `waves:<n>` stream right after the wave is generated; portals flare `rules.flareMs` (1 s) ahead (event `portalFlare`; RD5 draws it). Guaranteed spawns lost their lanes (`portal` optional, none set).
- [RD2] decision: Siege shells only the Citadel, the Brute walks like a Grunt, the Hunter's field prices sentries only, and the Colossus walks the ground field with slam, boulder and calls, until RD10 adds builds and players as targets.
- [RD2] decision: `MeView.build` reads the knight's build and input from content (`KnightDef.build`, `input.build`) and the icon from a table mirroring `iconFor.build`.
- [RD2] decision: the build cues are `build_placed` (`buildPlaced`) and `build_destroyed` (`buildGone` destroyed); their mp3s were renamed from the structure ones (`audio/neon-knights`, not an input pack) with their LICENSES paths.
- [RD2] decision: the mortar's render clips stay (`render/clips/mortar.ts`): its rig is kept-on-file art and the rig contract test wants an idle clip for every rig; nothing in the game draws it.
- [RD2] decision: acceptance grep hits that stay: the card id `siege_breakers` (SPEC §15.4 ids, as RD0 noted) and the icon id `emergency-kit` in `presentation/__tests__/manifest.test.ts` (the on-disk icon list; the icon is kept on file until RD12). No gallery hits.
- [RD4] decision: `ChargeRing(variant)`: the build variant (`.charge-ring.build`) is dimmed until full, then a steady amber with no flash and no pulse; both variants carry the state class `empty` / `filling` / `full` (`ringState`).
- [RD4] decision: an aimed build rides the existing floating aim zones (`AimKey` adds `build`, mapped to the layout's `action` zone); the zone ignores touches while the build is dimmed (`enabled`), and the button rebinds when `me.build.input` flips (Commander recall tap, flag throw aimed). Dimmed aimed builds never send flag 4.
- [RD4] decision: the build view is one view with two states by `me.cards`: pop-up while `offer` is non-empty and `picked` is null, the shop otherwise; the one Ready button sits in the top bar (left of the pause button) on both, coins only in the shop; the combat status strip is not shown in the build phase. Confirm locks for 1.5 s after it sends so a double tap makes one `card` intent.
- [RD4] decision: knight select copy comes from `CLASS_INFO` (role + `role-*` icon, main, super, build with tap/aim, passive card); the build input type shown is a copy field (`build.mode`) like main and super; the Commander's super stays tap as in content (SPEC §8.2's table says aimed; RD9 settles it). Start's minimum ready count is 1 (#100); end-of-run option reads CHANGE KNIGHT (#107).
- [RD4] decision: host-side view fields needed later: none; `MeBuild` carries everything the button uses. RD6 note: the host must deal `me.cards.offer` and set `picked` for the pop-up to leave; `smoke.spec.ts` now picks a card through the pop-up (select, Confirm) before the shop rows exist.
- [RD3] contract+: `SimEvent` `buildHp { build; kind; owner; hp; maxHp }` (HP bar data, on landing and with every `buildHit`); `HarnessDef.durationMs?` and `capMs?` (the harness wave's spawn window and the not-cleared cap); SPEC §15.3, §15.4 and #112 updated.
- [RD3] decision: a spawn pulse is up to `activeCap` groups at one time, each pulse in its own slice of the duration; "per spawn group" hot sides (waves 12–15) roll per pulse. The hot/other split is chosen over the whole wave (an exact small knapsack: share closest to 0.55, never under half, a group elsewhere per pulse of two or more where the costs allow), because a pulse-by-pulse greedy left lumpy solo waves (one Brute) at 67% hot.
- [RD3] decision: the boss spawns at a seeded portal on the first pulse's hot side (boss waves 5 and 10 hold it all wave); unpinned guaranteed spawns are dealt like any group (SPEC's "guaranteed spawn without lane goes hot" comment rewritten: the boss is the caller's).
- [RD3] decision: SPEC §7.2/§8.3 and REDESIGN B2 say main _and super_ damage charge the meter; this plan's RD3 acceptance line "super damage charges neither" contradicts them, so the code follows SPEC: super damage charges the meter, never the super; super healing charges neither (the heal path never charges the meter; only Field Medic healing does).
- [RD3] decision: a thrown build lands at the knight + aim × throw range (the stick's length sets the distance, so it never passes the range), clamped to the field and pushed out of the Citadel by its body radius (`builds/landing.ts`, shared with `buildPreview`). Flight = max(minFlightMs, distance / throw speed); `armMs` after landing it switches on.
- [RD3] decision: builds with no registered behavior (mine, beacon, rally flag until RD7–RD9) can't be placed: the press does nothing, the meter stays full, and `MeView.build.mode` stays `none` (`canPlace` in views). Placing on the Commander's full meter therefore never recalls; recall needs the meter not full, as SPEC says.
- [RD3] decision: the build meter starts full for every knight; only the Warden's fill rates are set (1/45 per s, 0.002 per damage point); the others' stay 0 until their kits. Passive fill runs before the build press in a step, so a placed build leaves the meter at exactly 0.
- [RD3] decision: the random card pick happens whenever the build phase ends with an offer unconfirmed (the 20 s deadline or everyone Ready), stream `cardPick:<wave>:<slot>`, event `cardAuto`. Test harness `toCombat` drops unpicked offers first, so existing tests get no random cards; the balance harness does the same (no cards).
- [RD3] decision: regen's first tick lands exactly `delayMs` after the last damage taken (dealt or absorbed), then every `everyMs`; HP is set directly (no event). Tests that check heals hold regen off with `regen.quietUntil`.
- [RD3] decision: the class damage band multiplies the main and super's base damage when they fire (`fire` in players.ts: base × band, then the cards), read from the knight's class each time (the knight can't change mid-run), so tests pinning Ranger/Warden damage now include the band.
- [RD3] decision: the jump slam is the Warden's existing wound-up super arc, widened to the slam's 102°; the sim keeps no airborne state (the TV's clip draws the jump), so the Warden stays targetable throughout (tested). `windupMs` stays 320 (the clip's impact, speeds.test).
- [RD3] decision: Quick Recovery's old −5 s stat cap (`statCaps.respawnMs`) is gone; the respawn is max(stat, min(base, floor)) with floor 4 s when the wave started with one player, 5 s otherwise (`lifecycle.ts` `respawnMs`).
- [RD3] decision: HP builds join the spatial hash so enemy shots (the Wasp) hit them; aggro-leash AIs (`path`, `swarm`, `flyer`) consider landed HP builds after knights (a knight wins an exact tie). Brute, Siege, Hunter and boss targeting stay as RD2 left them (RD10).
- [RD3] decision: the balance harness runs every knight in content (the plan said "each knight in the policy registry", which is only the Warden until RD7–RD9 and would make a one-row report); knights without a policy fight without builds and the report marks them. The harness wave is a one-wave content override with every group pinned to `harness.portal`, spread over `harness.durationMs`.
- [RD3] decision: the party's default `minPlayers` is 1 (and `game.meta.ts` says 1), so one Ready player auto-starts and the leader can force-start with one Ready player; the option still allows a larger minimum.
- [RD3] decision: `portalFlare` is sent once per portal per step (a pulse may put two groups on one portal).
- [RD5] contract+: `Keyframe.groups` (`src/presentation/types.ts`: a clip switches optional rig groups per key; `ClipSample.groups`), `EffectSpawner.mark?` and `MarkKind`, `BuildPhase`/`BuildViewState`/`BuildView`/`BuildViewFactory` (`render/types.ts`, the build-view API; SPEC §15.2).
- [RD5] decision: the build-view API is a `view: BuildViewFactory` export per `scene/builds/<build>.ts`; `render/buildKit.ts` `LifecycleBuild` is the generic life cycle (RD7–RD9 name their frames only), and `scene/buildsView.ts` drives it from `world.builds` (flight along the sim's `Flight`, wreck 600 ms then `scrap-ours` 3).
- [RD5] decision: HP bars (enemy violet, build amber) are two images of Phaser's white texture made once and only moved and scaled; the dotted effect ellipse is one generated texture scaled to the radius; the shimmer cycles by alpha over three pre-made images (frame-cost rule, tested in `scene/__tests__/builds.test.ts`).
- [RD5] decision: the jump slam stays the `super` clip and lands at `JUMP_IMPACT_MS` (`STOMP_IMPACT_MS` is an alias, 320 = content `warden.super.windupMs`, `speeds.test` pins it); if RD3 changes the windup, change that one constant. Gallery pages still import the alias (RD12).
- [RD5] decision: the XX
- [RD5] decision: the HUD already met the preview rule after RD2 (types and counts, no hot side, no lane bands); RD5 pinned it with `ui/__tests__/hud-preview.test.ts`.
- [RD6] contract+: `SimCommand` debug `meter` takes `target?: number` (a run slot; none = every knight) and a new debug `hot { side: SideId | null }` (`src/host/sim/types.ts`); `Sim.debugHot` and `StateExtras.debugHot` read it (outside `World`, so state hashes and snapshots don't change); SPEC §9.5, §15.3 and #114 updated.
- [RD6] decision: most of the wiring was already in place from RD2–RD4 (`MeView.build`, `cards.offer`/`picked`, `TeamView` without the hot side, `buildFires`/`buildAim` through `PhoneInputSource` into the sim's build press); RD6 adds the growth header, the debug tools, the `__pcg` hooks and tests that pin the routing (session: a `buildFires` edge places one build and acks nothing; `PhoneInputSource` staleness with flag 4 and the build counter).
- [RD6] decision: forcing a hot side moves only spawn groups that haven't flared (a flare already shown keeps its group) and only those on their pulse's hot side (the rest stay put), then holds for every later wave until cleared: the simplest tool that shows "enemies pour from the hot side" on demand while keeping replays exact (a logged command).
- [RD6] decision: the growth header is the class's growth list for the wave just cleared (the `boss` list after a boss wave), shown once the knight has a bump (`PlayerEnt.growth`), null before wave 1, for a late joiner and when the list grows none of HP / DMG / healing; today's content grows nothing and the sim never bumps (RD11), so it stays null until then.
- [RD6] decision: the debug panel's readout (hot side, portal activity, meters) and `__pcg.portals()` / `meters()` share one pure module, `src/host/debugInfo.ts`; the panel refreshes it every 500 ms with the seed.
- [RD6] decision: the smoke spec is one solo Warden (start alone, Ready on the wave 1 pop-up so the phase's end picks the card, a thrown shield generator, wave 2's card Confirm and a purchase); two-phone flows stay in reconnect, late-join and pause. `e2e/helpers.ts` gains `pickKnight` (one swipe per card), `joinPhone(…, knight)`, `confirmCard` and `holdBuildAim`.
- [RD6] decision: `render/types.ts`, `sim/builds/index.ts` and `scene/builds/<build>.ts` freeze as RD5 and RD3 left them (no changes needed): RD7–RD9 register a `BuildBehavior` and add a `scene/builds/<build>.ts` exporting `view: BuildViewFactory`.
- [RD4-fix-1] decision: build button 60 px at (-134, +24) (pre-RD4 56, RD4 68), ring reach 11 px and caption top 14 px under the face; captions are proven clear of every button and label by `layoutCombat` rect tests (SPEC #115, revises #105).
- [RD4-fix-1] decision: the shop 50/50 split was `.shop-body { flex-direction: row }` turning header, rows and hint into three columns; it is now one column with a one-line header (hint hidden under 400 px high), price min 96 px, no wrapping.
- [RD3-fix-1] contract+: `SimEvent` `windupCancelled { source; slot }` (a knight's wound-up attack cut short: down, dazed or phase end), so the TV calls off the impact it scheduled at the press; SPEC §15.3 and #116 updated.
- [RD3-fix-1] decision: the jump slam winds up 1.8 s inside a 2.2 s clip (RC1 "~2 s"; `windupMs` = `JUMP_IMPACT_MS`, `speeds.test`); damage, stun, `landing-dust` and `slam-cracks-wide` land together at the impact.
- [RD3-fix-1] decision: from press to landing the Warden is committed (simplest rule for a long wind-up): rooted, aim and facing locked, main and build presses lost, no aim preview, still a target. Down, dazed or a phase end cancels the slam, and the charge stays spent (#116).
- [RD3-fix-1] decision: Aftershock is now a 5 s slow (`slowMs`) on every enemy the jump slam hits, through the attack's own effects; the old slam zone and its params are gone, so Fault Line (RD11) stays the only ground fissure (#118). RD11 keeps this behavior.
- [RD3-fix-1] decision: the main reads "already stunned" before its own effects and then skips only the knockback (#117).
- [RD3-fix-1] decision: the shield generator's throw speed goes 12 → 6 (1 s at full range); `minFlightMs` stays 300 so a quick tap at his feet stays quick; the beacon and flag are untouched (#119).
- [RD3-fix-1] decision: regen waits 5 s and `fire()` restarts it, so a wound-up attack restarts it at the press and at the landing; placing a build doesn't. This supersedes the 4 s in RD3's Deliverables and Acceptance (#120).
- [RD3-fix-1] decision: left for RD12, which owns `render/gallery/pages.ts`: `ONE_SHOTS.super` needs a period of at least the Warden's jump slam clip + 400 ms (RD3-fix-2: 1350 + 400 = 1750 ms; it is 1600 ms).
- [RD3-fix-1] decision: `src/controller/copy.ts` line 199 is outside this fix; its Aftershock text should become `'Jump slam slows enemies for 5 s.'`.
- [RD3-fix-1] note for RD12 (updated by RD3-fix-2): `ONE_SHOTS.super` in `render/gallery/pages.ts` (1600 ms) cuts the Warden's 1.35 s jump slam short of its recover pause; set it to at least 1750 ms (clip + 400 ms).
- [RD3-fix-2] decision: the Warden's slam reaches 1.65× (1.75 → 2.89 tiles; the aim preview reads the same content) and `landArc` has no knockback code left (the jump slam never had any), so #117's "already stunned" check is gone (#124).
- [RD3-fix-2] decision: the jump slam winds up 1.1 s (66 steps exactly) inside a 1.35 s clip, ~61% of RC1's 1.8 s / 2.2 s; every clip beat is scaled by the same factor (crouch 260, lift 610, hang/landing hold 75, hammer swap 160 ms) instead of cutting poses. This revises RC1's "~2 s" ([RD3-fix-1], #116) (#125).
- [RD3-fix-2] decision: one `THROW_SPEED` (5 tiles/s) in balance.ts's builds section for the generator, beacon, flag and Reinforcements soldier; the Commander's `spawn.throwSpeed` reads it through a getter, since his section sits above the builds section and a plain reference would hit the const's temporal dead zone (#126).
- [RD3-fix-3] decision: the Warden's slam cone goes a third narrower, `arcDeg` 102 → 68 at the same 2.89-tile reach (aim preview, shockwave and Heavy Slam read the same content); the jump slam keeps 102° since the fix covers only the main, so it is now wider than the slam (revises §8.2's "as wide as the main's"; REDESIGN.md still says it, flag for the next checkpoint) (#127).
- [RD7] contract+: `BuildViewState.triggered?`, `MarkKind` `shockwave` / `mine-blast-ring` / `mine-blast`, `BuildLook.liveAlpha?` / `trigger?`, `BUILD_FRAMES.mine`, sim exports `steadyOn` and `buildEffectRadius`; SPEC §15.2 and #123 updated.
- [RD7] decision: a mine delay cut off by the wave's end re-arms with its charge (`stepBuilds` clears `triggerAt` outside combat); Shrapnel Charge's delay floor is the mine's `minTriggerMs` 120 ms, in the Builds section, because `statCaps` is the run rules' section (#121).
- [RD7] decision: `cardEligible` treats only two-card `requires` as unique combos, so Deadeye (and RD8's Wide Aura) stack once their passive is owned, as §6.1 says (#122).
- [RD7] decision: Ranger meter starts at 0.025/s + 0.0015 per damage point (about one mine per 9–10 s of steady fire); balance report: Ranger −13%, Warden +28% (a report for RC2, not tuned here).
- [RD7] decision: a used-up charge build leaves after `stepBuilds`' loop (`charges === 0`), so a burst never skips the next build in the array.
- [RD7] decision: left for RD13: §2.4's bolt and rails brightening in steps while Steady Aim builds isn't in the renderer (the rig has only a whole-body `setGlow`); RD7 gates the existing `ready` pose on the card.
- [RD8] contract+: `AttackDef.burstMinReach`, `PlayerEnt.burst` + `NaniteBurst` (`sim/types.ts`), `BuildViewState.nextPulse?` (`render/types.ts`); SPEC §15.2–§15.4 and #130 updated.
- [RD8] decision: each nanite restarts regen (`sim/regen.ts`, shared with `fire`), so the 5 s runs from the blast's last shot; the heal cone goes through `fire` (#130).
- [RD8] decision: Field Medic and beacon healing share `superCharge.perHeal` through Focus; the beacon's first pulse is at switch-on and it works while its owner is down (#131).
- [RD8] decision: a resume recomputes a build's max HP from its owner's cards, or a boosted beacon would be clipped to base HP (#132).
- [RD8] decision: Wide Aura stacks under RD7's one-prerequisite rule (#122); RD8 doesn't touch `cardEligible` or pin that behavior.
- [RD8] decision: the beacon's flight still starts at his ground point (RD5's shared flight view); the throw clip and a nanite puff at `pack` mark the release.
- [RD9] contract+: `AttackDef.shape` gains `spawn` and drops `buff`; `super.spawn.spread`; `KnightDef.super.selfEffects` and the effect ids `haste`, `aura_lead_from_the_front` removed as RD2 scheduled; SPEC §15.4 updated.
- [RD9] contract+: `BuildBehavior.placed?`, `BuildViewState.ownerTint?`, `PlayerEnt.squadSeeded?`, `StateExtras.refreshUnit`, SimEvent `warcry { slot; targets; durationMs }`; sim exports `soldierPreview`, `superHeld`, `squadCapOf` (replaces `squadSize`); SPEC §8.5, §15.3 updated.
- [RD9] decision: the Commander's super is an aimed throw (settles §8.2 vs content, as the RD9 entry says); a quick tap goes toward the flag, stopping at it, or straight ahead (#106, #140).
- [RD9] decision: the bash has no wind-up (the hit lands on the press, sparks on the clip's 110 ms impact), so it never roots him; `fire()` carries both his main and super, so regen needs no code path of its own (#140).
- [RD9] decision: `PlayerEnt.flag` stays as the flag's position, set at the throw; the `BuildEnt` is what's drawn and saved (#141).
- [RD9] decision: Last Stand counts soldiers short of the cap (#142); Morale's flag area lives in the flag's build behavior so it works while he's down (#143).
- [RD9] decision: Warcry still skips the Commander himself (the kept card's behavior) and flashes through its own `warcry` event, because the Morale card uses the same effect with no visual (#143).
- [RD9] note: balance report after rebasing on RD7 and RD8, at starting values: Commander 35.0 s (-27%, outside ±25%), Warden 64.2 s (+34%, outside ±25%), Ranger 43.5 s (-10%), Artificer 49.7 s (+3%). Left for the RC2 tuning pass (a report, never a gate).
- [RD10] contract+: `EnemyEnt.huntBuild?` and `locked?`, with `huntSince` now the lock-on tick (Hunter and Brute, as SPEC §15.3 sketched); `BossAct.hit?` and kind `chargeRun`; `DangerMarker.shape` `lane` with `x2?`, `y2?`; `MarkKind` `brute-target`, `brute-target-arrow`, `charge-dust`; `EffectSpawner.mark` optional `flipX`; `SimState.bruteField`, `StateExtras.dropBruteField`; nine `charge*` Colossus params.
- [RD10] decision: the Hunters' pricing compares the landed priced builds' ids on each field request instead of relying on hooks, so RD7's mines re-price however they're placed or removed.
- [RD10] decision: the Brute rechecks the nearest build every step (a nearer build is bait) (#150); "ignores ground builds" for Flyers means trap builds, so they still shoot HP builds (#151).
- [RD10] decision: Charge starting values, soldiers hit like knights, one hit per run, lane width = hit width (#152); Mk III Runner calls run all fight (#153); Hunter stalk speed 1.3 per §9.1 (#154); boulder, rings and Charge take the wave multiplier (#155).
- [RD10] decision: the peak bench's p99 swings around 2 ms under the parallel load on both this branch and its base (best runs 1.90 and 2.07 ms; means equal at 0.63 and 0.65 ms), so it's load, not this milestone.
- [RD10] decision: the Charge skips soldiers in the air (RD9 Reinforcements), matching the slam and every marker.
- [RD13] contract+: sim events `beaconPulse`, `chargeWindup`, `windupLanded` and the optional `buildHit.kind` (`sim/events.ts`, SPEC §15.3); `SFX_IDS` gains nine ids (`shared/ids.ts`).
- [RD13] decision: the summary awards (RunStats, no crate awards) and the 1–6 lobby copy on the TV and phones already matched SPEC §4 and §11.1 from RD2, so only the audio changed; the RD7 note on Steady Aim's stepped bolt glow stays deferred (needs a rig change, not audio).
- [RD9-fix-1] contract+: `AttackDef.shape` gains `rect` and `AttackDef.width?`; `STAT_IDS` appends `width` (Heavy Bash widens the rectangle); sim `HitShape` gains `{ kind: 'rect'; range; width }`; SPEC §15.4 updated.
- [RD9-fix-1] decision: the bash rectangle is 2.25 × 2 tiles (old 1.6-tile reach + 40%, a bit narrower than long), knockback 0.96 (1.2 × 0.8); knockback still pushes away from him (simplest, same as the arc), and an enemy body counts if any of its capsule overlaps the rectangle (the arc test's circles along the body, `stripHitsBody`) (#156).
- [RD9-fix-1] decision: soldier speed is a value, 3.9 (90.7% of his 4.3), not a ratio: units live in content like every other speed; the hurry (×1.3 = 5.07 past 3 tiles) still catches him (#156).
- [RD9-fix-1] decision: the unwound `arc` shape handler stays (no content uses it now); the optional sword slash trail (group `sword`, off in v1) keeps its 90° sweep since it is not a hit area.
- [RD5-fix-1] decision: facing holds on the rig's own clip (`heldAim`, render/aim.ts): while attack, super, build or throw plays and isn't done, the knight keeps the attack's angle; no new timer. Throws and mine kneels have no aim event, so they hold the player's facing at placement.
- [RD5-fix-1] decision: next-wave banner sizes tiles by `previewLayout` (spacing 14 down to 6, then tiles 120 down to 56, in a 230 px text allowance); the widest wave has 7 types.
- [RD10-fix-1] contract+: `EnemyEnt.dropped?` (the target let go at the leash); `ai: 'return'` stays in the type but is no longer entered (a saved `return` resumes as `path`); SPEC §15.3 updated.
- [RD10-fix-1] decision: a leashed enemy goes on toward the base from where it stands, and ignores the target it let go until that target leaves its aggro radius; without that a kiting knight would be taken again the next step and the leash would never end a chase (#157).
- [RD10-fix-1] decision: soldiers join the aggro scan as one more loop over `world.soldiers` (a few per Commander) between knights and builds, so a knight wins an exact tie; no second spatial scan was needed (bench below) (#158).
- [RD10-fix-1] decision: the Brute's build hunt, the Hunter's quarry rules and the Colossus's lock-ons (boulder target, Charge target) stay knight-only, as SPEC §9 and §9.2 name each rule; the slam and the Charge already hit soldiers (#158).
- [RD10-fix-1] decision: burn and corrosion share one size rule, 0.45 × the body height capped at 1.1× the frame, bottom at the top of the legs (`bodyLookScale`, render/status.ts); still only scale and position per frame (#159).
- [RD10-fix-1] note: bench under heavy parallel load swings widely (peak p99 2.0–11 ms on this branch, 6.1 ms on its base in the same window); best peak run mean 0.63 ms, p99 2.01 ms, matching RD10's 0.63 / 1.90–2.07, so the soldier loop costs nothing visible. After the rebase on RD9-fix-1: boss 0.61 / 2.00 ms, peak 0.52 / 1.52 ms (mean / p99). In this worktree `presentation-keys` (atlas URLs empty under a `.claude/` path, fails on the base too) and three timing tests (flowfield < 1 ms, wave generator, regen timeout) fail from load and the path; every sim, scene and render test of this change passes.
- [RD10-fix-1] decision: RD10's roster test "Siege never picks a soldier" now keeps the soldiers out of range (they rank with the players), and the flag test removes them so it still tests the flag alone.
- [RD9-fix-2] decision: soldier speed 3.45 (80.2% of his 4.3, was 3.9); the hurry factor goes 1.3 → 1.45 so the regroup pace stays about 5 tiles/s (3.45 × 1.3 = 4.49 would only just beat his 4.3, and any buff on him would leave them behind) (#160).
- [RD9-fix-2] decision: the bash rectangle is 1.5 tiles wide (2 × 0.75), reach kept at 2.25; knockback 0.864 (0.96 × 0.9, kept exact rather than rounded to 0.86); Heavy Bash's +20% width applies to the new base; the TV aim preview already reads both from content via `rectGeometry`, so no visual changed (#160).
- [RD10-fix-2] decision: burn and corrosion still share one rule, now 0.7 × the body height capped at 4× the frame (`BODY_LOOK_FRACTION`, `BODY_LOOK_MAX_SCALE`, render/status.ts), about halfway by on-screen height between the old full-height flame and RD10-fix-1's: flame height in sprite units old / fix-1 / now, Grunt 80 / 36 / 56, Flyer 50 / 22.5 / 35, Brute 125 / 44 / 87.5, Colossus 280 / 44 / 160, mite 22 / 9.9 / 15.4 (halfway 58, 36, 84.5, 162, 16); only the Colossus is capped; corrosion keeps the shared rule (the note named only flames, and on a Grunt 0.7 fills the torso above the legs); still only scale and position per frame (#161).
- [RD10-fix-2] note: render-only change (no sim file touched; bench state hashes unchanged, boss 3314c3, peak 10a554e). Bench peak 0.49 / 1.24–1.42 ms passes; boss p99 sits at 2.03–2.07 ms (mean 0.61–0.64), the same as RD10-fix-1's boss 0.61 / 2.00 and RD10's 1.90–2.07 under parallel load, so it's the base, not this fix. After the rebase on RD9-fix-2 (its squad changes move the hashes to c9d0cbed / ef74323): boss 0.55 / 2.01 ms, peak 0.61 / 1.97 ms (mean / p99).
- [RD6-fix-1] contract+: `Intent` gains `{ k: 'leave' }` and `{ k: 'leader'; action: 'endGame' }` (guards too; `PROTOCOL_VERSION` stays 2); `Party` gains `leave(playerId)` (any stage: the member goes, leadership passes, a late join never reuses the left slot); SPEC §10.5, §11.1, §11.3, §15.6 and #162 updated.
- [RD6-fix-1] decision: Leave game drops the player from the party and kicks the phone (the relay forgets its token, so the phone rejoins as a new player); the knight stays in the sim, dazed for the rest of the run, like a dropped phone (§11.3's held slot): removing a knight mid-run touches builds, squads, targeting, stats, the snapshot and the TV for little gain.
- [RD6-fix-1] decision: End game goes straight to the lobby (the session's `endRun`, as Change Knight: knights kept, nobody Ready, snapshot cleared), not the summary: `RunSummary.result` is a win or a loss and a forced end is neither.
- [RD6-fix-1] decision: both work in the countdown, build and combat phases (the pause button's phases), else `phase`; End game from a non-leader acks `notLeader` and changes nothing; the last slotted player to leave ends the run (lobby), so an empty run never sits paused.
- [RD6-fix-1] decision: the confirm step lives on the paused card (title, one line, Cancel + a `--danger` action); after a confirm both buttons lock for 1.5 s (as the card Confirm, RD4) so a double tap sends one intent, and the menu returns if the host refuses. The kicked phone shows the room-code join screen with a "You left the game" toast (the app tracks the leave's seq; a refused leave clears it).
- [RD6-fix-1] decision: `copy.ts` had no "Lobby and summary" banner yet; RD6-fix-1 adds it at the end of the file with the pause menu copy (`PAUSE_MENU`). The confirm buttons use `data-pause-confirm` / `data-pause-cancel` (the card pop-up already owns `data-confirm`).
- [RD12] decision: new gallery pages `builds` (each real build view in all five states, the mine's trigger frame, the flag's flight parts, the beacon's pulse) and `portals` (idle and flare per side with the `portal-flare` sparks); the map page flares its six portals in turn; the effects page drops every `MARK_FRAMES` mark on a loop. No turret, autotile or other kept-on-file page existed in the gallery, so none was removed.
- [RD12] decision: `sword` (Commander) and `slam` (Warden) are gallery checkboxes and URL params (`sword=1`, `slam=1`), off by default; `ONE_SHOTS.super` is 1750 ms.
- [RD12] decision: 15 files deleted (8 art and review files, 7 icons) and 6 `sprites.json` frames; the art README's stale mentions stay (input, read-only).
- [RD11] decision: no frozen contract changed: growth lives in a new `sim/growth.ts` (one `growth` modifier from `PlayerEnt.growth`'s counts, re-attached on resume), the Warden modules append to the registry, and `TeamState.coins` keeps its type but now holds a fraction (#165).
- [RD11] decision: coin rate 0.25 with the pool kept fractional (`coinsFor` no longer rounds, `TeamView.coins` floors) rather than a rate of 1 and 4× prices: a rate under 1 rounded a Grunt's pay to 0, and the knob stays the one the spec names (#165).
- [RD11] decision: the economy run (`sim/economy.ts`, `scripts/economy.ts`, `economy.test.ts`) is an autopilot team that repairs below 75% base HP and otherwise saves for a fixed want list, base not held (players invincible, as the soak). Seed 1, Normal, purchases by build phase: 2 players (Ranger + Artificer) w4 sentry damage, w7 base HP I, w8 sentry range, w10 base armor I, w11 repair, w12 repair ×2, w14 base HP II, w15 third sentry = 9; solo Warden 7 (first at w6); 4 players 9 (first at w4, 46 coins left). Coins before waves 2/3/4: 3/7/12 (2 players).
- [RD11] decision: income scales with the player-count table (more enemies, more coins), so the §6.2 curve is tuned for 2 players (the wave budgets' reference); solo buys about 7, 4 players run out of things to buy by wave 15. Left for RC4 (a per-player-count coin factor would be one line in `coinsFor`).
- [RD11] decision: growth runs at the wave end before `startBuild` (so the pop-up header shows it), for every knight in the run including down and disconnected ones; none after wave 15 or on debug `jumpWave`; the sim skips any stat with a `statCaps` entry even if content lists one (#166).
- [RD11] decision: Challenger is the `taunt` effect re-applied each combat step (200 ms) by his card module; `leash` (ai/path.ts) picks a taunting knight in the aggro radius first and switches an enemy already in `aggro` to him, but a swing already wound up lands first; Siege, Hunters, the Brute's build hunt and the Colossus keep their own targeting (#167).
- [RD11] decision: Fault Line's fissure is a straight strip from his feet along the jump slam's aim (its center line, reach × `lengthPct` 1, 0.9 wide, 4 s), kept on the card's modifier like the old slam zone; the TV lays `slam-cracks` every 0.9 tiles along it for the same 4 s (`wardenFx` gets an optional `FissureLook`), no new art (#167).
- [RD11] decision: Wide Field +25% `buildRadius`; Reinforced Generator +40% `buildHp` and +20% `buildPower` per stack (rare, not unique, so no cap on the guard: three stacks give 0.48); Tinkerer +15% `buildCharge` for every knight; `HOLD_CONFIRM_PRICE` 10 → 20 so only tier II/III and the third sentry need the hold.
- [RD11] decision: Earthshaker needs no code: the Colossus fills its stagger by a fixed `staggerStun` per stun whatever its length, so a longer stun adds none (tested).
- [RD11] decision: the commons, Warden card copy and marks were already in `copy.ts` and `presentation/shared.ts` from RD2–RD4 (they match §6.1, now tested); the Commander's squad-stats shop item was already gone (RD2/RD9), so the shop is the six §6.2 items.

## 9. Final handoff

Manual steps, in order. No secrets are needed.

1. Review `git log --oneline main..redesign/fort-frenzy`. If `origin/main` moved, merge it in and rerun
   the final checks (§5 rule 12).
2. Push the tag and the branch: `git push origin fort-frenzy-td-final` and
   `git push -u origin redesign/fort-frenzy`.
3. Open one PR: `gh pr create --base main --head redesign/fort-frenzy --title "Fort Frenzy redesign:
players-only wave defense"` with a summary of the milestones. Wait for CI (`check` and `e2e-result`)
   to pass, then merge it (a merge commit keeps the milestone history).
4. **Deploy:** the release workflow updates the "Version Packages" PR with `@pcg/fort-frenzy`'s major
   bump and changelog. Merge it; Vercel builds production for Fort Frenzy (its version changed) on the
   existing project. The relay is unchanged: no `fly deploy`.
5. **Real-device smoke test** on `https://fort-frenzy.fostercurtis.dev`: join by QR on an iPhone (Safari)
   and an Android (Chrome); start a solo run; then play a full wave with every knight's build (Warden
   shield generator, Ranger mines, Artificer beacon, Commander flag throw and recall); lock one phone
   ~10 s mid-wave and confirm it reconnects to its slot; reload the TV in a build phase and choose Resume
   (builds, meters and squad come back). Check the gallery card at `https://games.fostercurtis.dev`
   says 1–6 players.
6. Cleanup: remove the `.claude/worktrees/art-redesign` worktree and the merged `art/redesign` branch,
   and any `rd*` worktrees left. Per REDESIGN §0.5, move `REDESIGN.md` to `docs/` or delete it once the
   release is live (your call).

## 10. Kickoff prompt

```text
You are the build orchestrator for the Fort Frenzy redesign. Read ONLY
apps/fort-frenzy/REDESIGN_BUILD_PLAN.md (never source code) and follow it exactly. Before RD0 it is on
`main`; from RD0 on, work on the integration branch `redesign/fort-frenzy`.

1. Run the §1 pre-flight quick checks (hand them to a haiku helper; failures only). Don't run the full
   gate or e2e in pre-flight. If anything blocks the next milestone, stop and tell me exactly what to fix.
2. Read §6 Progress, §7 Blockers and `git log --oneline -15` to find where the build stands.
3. Run the next unchecked milestone(s) per §5, using the §4 brief and the §3 models:
   RD0 alone (opus, main checkout), then stop for RC0; RD1 (sonnet) then RD2 (opus), each alone in the
   main checkout; RD3 (opus), RD4 (sonnet) and RD5 (sonnet) in parallel, then RD6 (opus), then stop for
   RC1; after RC1, RD7, RD8, RD9 and RD10 (opus) in parallel, then stop for RC2; after RC2, RD11 (opus),
   RD12 (sonnet) and RD13 (sonnet) in parallel, then stop for RC3; then RD14 (opus) beside the RC3 fixes,
   then stop for RC4.
   Parallel milestones each get a manual worktree (§2): create it with a haiku helper, launch the agent
   WITHOUT isolation, and pin it to the worktree's absolute path.
4. Tell every milestone agent not to run Playwright. Before each merge, a haiku test-runner runs the
   milestone's e2e items on its branch; failures go back to the same agent (SendMessage).
5. Hand everything that isn't milestone work (reading, summarizing, running checks, worktrees, ticking
   the checklist, logging Blockers and Build decisions, drafting checkpoint instructions) to haiku or
   sonnet helpers per §5 rule 4.
6. Merge per §2 (`git merge --ff-only` into redesign/fort-frenzy, dependency order). After each merge,
   a haiku test-runner runs that milestone's non-e2e Acceptance on redesign/fort-frenzy.
7. Stop at user checkpoints (RC0–RC4) and unresolved Blockers, and tell me exactly what is needed: the
   command, the URL or file, what to judge. Route notes to fix milestones per §5 rule 10; art problems go
   under §7 for the art agent.
8. While I'm testing on a LAN dev server, treat the main checkout as read-only (§2 "Live harness").
9. If everything in §6 is checked, run the final checks (§5 rule 12) and print the §9 Final handoff.

{Optional: "Checkpoint approved: RC0" / "RC1 notes: …"}
```
