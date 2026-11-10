# Phone Controller Games — PLATFORM

> Repo-wide spec: what every game and the relay share. Only **decided** items go here.
> Each game's design lives in `apps/<game>/SPEC.md`; the relay and its protocol in [`apps/relay/SPEC.md`](apps/relay/SPEC.md).
> Last updated: 2026-11-10

## 1. Overview

A series of same-room party games. A shared screen (TV/laptop browser) runs the game (the **host**); phones act as controllers via a web page (room code or QR, no install). Host and phones never talk directly: every message goes through one shared, game-agnostic **relay**.

| Game | App | Status |
| --- | --- | --- |
| Sunny Side Slam | `apps/sunny-side` | Shipped (v1) |
| Fort Frenzy | `apps/fort-frenzy` | Shipped (v1) |
| Say Cheese! | `apps/say-cheese` | Shipped (v1) |

## 2. Architecture (settled)

- **Same-room only.** No remote/online play.
- **Host-authoritative.** Host browser runs the full simulation and rendering.
- **Phones send input state only** (joystick vector + button bits) at ~20–30 Hz or on change. Never discrete move commands.
- **Game-agnostic relay server**: rooms, join codes, host↔phone pairing, message forwarding, reconnects. No game rules. Rooms namespaced by game ID. In-memory only; no accounts, no DB. Spec: [`apps/relay/SPEC.md`](apps/relay/SPEC.md).
- **Transport:** WebSockets. WebRTC DataChannels are a possible later optimization (relay doubles as signaling; WebSocket as fallback, no TURN).

## 3. Phone controller requirements (settled)

- `touch-action: none`, locked viewport
- Wake Lock
- Fullscreen on tap: every tap requests fullscreen while the page isn't fullscreen (so it also re-enters after an exit); a silent no-op where unsupported (iPhone Safari). Comes from `@pcg/controller-kit`'s app shell, so every game gets it (decision #4).
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
  controller-kit/   phone platform (Wake Lock, fullscreen on tap, rotate), input widgets, sender, app shell
  game-kit/         fixed-step loop, lerp, seeded RNG, host helpers, Vite plugins (/play, LAN URL)
PLATFORM.md  tsconfig.base.json  pnpm-workspace.yaml
```

- Controller is a separate Vite entry (not a route) so phones never download the host's engine (`check:bundle` enforces this for Phaser). QR → `/play?code=XXXX`.
- Relay lives under `apps/` (deployable), not `packages/`.
- **Shared code:** `packages/` only holds code that two or more apps really use. `@pcg/controller-kit` and `@pcg/game-kit` are extracted with Fort Frenzy, the second game, and Sunny Side moves onto them (decision #4; contents in Fort Frenzy's SPEC §15.1). Game systems only one game uses yet (waves, cards, effects) stay in extraction-ready folders inside that game.
- **Docs:** this file for repo-wide rules; `apps/relay/SPEC.md` for the relay; each game keeps its own `SPEC.md` (design) and `BUILD_PLAN.md` (build plan) in its app folder.
- **Scripts:** per-game root scripts (`dev:<game>`, `dev:lan:<game>`, `build:<game>`, `e2e:<game>`, `check:<game>`). Work on one game runs only that game's build, e2e and check.
- **Affected gate (decision #6):** everything lands on `main` through a PR, and the gate runs over what the changes reach (locally `pnpm check:affected` + `pnpm e2e:affected`; CI enforces it), worked out from git against the merge-base with main, never from a hand-kept list. Packages: the changed ones plus every package that depends on them, so the relay or `packages/` reach every game. Shared config outside any package (lockfile, root config, `scripts/`, `.github/`, any unknown root file) runs everything; root Markdown and `.changeset/` get a format check only. Unit tests: `vitest related` per package, plus every test that reads files from disk; a changed non-code or config file runs the package's whole suite. E2E: each spec's loaded files are recorded per run (the impact map, gitignored `.pcg-cache/`); a change runs the specs that loaded a changed file, and anything the map can't vouch for (no map yet, unrecorded file, shared e2e code) runs the app's whole suite. Suites run side by side on per-app ports (`pcg.e2e` in the app's `package.json`); an `exclusive` suite (Fort Frenzy: CPU- and timing-sensitive) runs alone afterwards. Every suite runs to the end. `pnpm retest` reruns only the failed tests plus specs reached by changes since that app's last run. The full `pnpm check` + `pnpm e2e` is run by hand when wanted.
- **CI (decision #7):** `.github/workflows/ci.yml` runs on PRs to `main`, on pushes to `main`, and by hand (workflow_dispatch, which runs everything; there is no scheduled run). A PR is diffed against the merge-base with `main`, so it covers the whole branch; a push to `main` against its `before`. The `check` job runs each gate as its own step (`check-affected.mjs --only <step>`), then, on PRs, `changeset status` (not for Dependabot or the Version Packages PR). The `plan` job lists the affected apps with an e2e suite, and the `e2e` matrix runs each app's whole suite on its own VM (CI keeps no impact map), uploading traces and reports on failure. `e2e-result` is the single required e2e check whatever the matrix holds. Actions are pinned to commit SHAs; Dependabot (`.github/dependabot.yml`) updates them and the npm dependencies weekly.

## 5. Versioning (settled)

Every app and package carries a semver `version` in its `package.json` and a `CHANGELOG.md`, managed by [Changesets](https://github.com/changesets/changesets) (`.changeset/config.json`). Starting points: `@pcg/sunny-side` and `@pcg/relay` 1.0.0 (live); `@pcg/fort-frenzy`, `@pcg/say-cheese` and the three `packages/` 0.1.0 (pre-launch; each game goes to 1.0.0 at launch).

- **Note with every change.** A change to a package's shipped code adds a changeset (`pnpm changeset`): which packages, which level, one line for the changelog. Tests, fixtures, e2e and Markdown don't count as changes (`changedFilePatterns`). A change that needs no release (a pure refactor) can use `pnpm changeset --empty`.
- **Bump at release (decision #8).** Versions don't move per commit, and nobody runs `pnpm changeset version` by hand. Feature PRs merge to `main` without deploying. On every push to `main`, the release workflow (`.github/workflows/release.yml`, changesets/action) keeps a "Version Packages" PR open from `changeset-release/main` that folds the pending notes into version bumps and changelog entries. Merging it is the deploy: Vercel builds production only for apps whose `version` changed (`scripts/vercel-ignore.mjs`, every game's `vercel.json` `ignoreCommand`), so a version number always names something that shipped. The relay still deploys by hand (`fly deploy` from the repo root) after a Version PR bumps it. Parallel branches never conflict over `package.json` or changelogs, since each note is its own file.
- **Dependents follow.** A bump to a `packages/` library or the relay patch-bumps every app that depends on it, so a game's version changes whenever its shipped code does.
- **Enforced** by `pnpm check:changeset` (`changeset status --since=main`), the last step of each `check:<game>`: it fails when a branch changes a package without a note. The note must be committed or staged (`git add`). CI checks every PR the same way (`changeset status --since=origin/main`), except Dependabot's and the Version Packages PR (which uses the notes up).
- **Dependabot PRs** carry no note. A bump to a runtime `dependencies` entry (e.g. `phaser`) needs a patch note for the apps that ship it, pushed to the Dependabot PR before merging; without one it reaches production only with the next release that bumps that app. Dev-dependency bumps need none.
- **On screen.** Each game shows `v<version>` in a corner of the TV, and on the phone's join and lobby screens (`src/shared/version.ts`), so the build on a TV is easy to name.

What each level means:

| Level | Games | Shared packages and relay |
| --- | --- | --- |
| Major | Breaks compatibility (old phones can't join a new TV, a `PROTOCOL_VERSION` bump, saved runs or settings lost), or a relaunch | A breaking change to a frozen contract (rare: contracts take additive changes only) |
| Minor | A new feature, mode, character, content or screen | A new export, option or message |
| Patch | A bug fix, balance tweak, copy or visual polish | A bug fix or internal change |

## 6. Decision log

| # | Date | Decision | Choice | Why |
| --- | --- | --- | --- | --- |
| 1 | 2026-10-22 | Repo layout | `apps/relay`, `apps/<game>` (multi-page host + controller), `packages/net-client`; kits deferred; relay at `relay.fostercurtis.dev` | Relay contract is the one settled shared boundary; everything else waits for a second consumer. Separate controller entry keeps phone joins fast. (Was Sunny Side #7.) |
| 2 | 2026-10-26 | Spec split | Repo-wide spec at root `PLATFORM.md`; relay at `apps/relay/SPEC.md`; each game's `SPEC.md` + `BUILD_PLAN.md` in its app folder | A second game is starting; the shared architecture and the relay protocol shouldn't live inside one game's spec. |
| 3 | 2026-10-26 | Per-game scripts | `dev:` / `build:` / `e2e:` / `check:<game>`; full `pnpm check` + `pnpm e2e` only before landing on `main` (or after touching shared code) | Work on one game shouldn't pay for, or be blocked by, another game's build and e2e. |
| 4 | 2026-10-27 | Shared kits | Extract `@pcg/controller-kit` and `@pcg/game-kit` with Fort Frenzy; migrate Sunny Side; fullscreen on tap is a platform requirement provided by the kit's app shell | The second game shows what's common; one copy instead of two drifting ones, and every controller gets the same phone behavior. |
| 5 | 2026-11-04 | Versioning | Semver per app and package via Changesets: a note with every change, versions bumped on deploy, dependents patch-bumped; `check:changeset` in each `check:<game>`; version shown on TV and phone join/lobby (§5) | Each game needs a version that names what's live and a changelog of major and minor changes. Bumping per commit would make parallel agent branches conflict on every merge. |
| 6 | 2026-11-10 | Affected gate | Gate before `main` is `check:affected` + `e2e:affected` (git diff → packages and dependents; `vitest related`; e2e specs by recorded loaded files); shared config runs everything; e2e suites side by side on per-app ports, `exclusive` ones alone; `pnpm retest` for failed tests plus what a fix reaches; CI runs `check:affected`, no nightly | The full gate grew with every game. Selection comes from git and recorded runs, not a hand-kept list, so it can't go stale, and every gap falls back to running more. Revises #3's "full set before `main`". |
| 7 | 2026-11-10 | CI | Everything lands through PRs. CI on PRs to `main`, pushes to `main` and by hand (full run); PRs diffed against the merge-base, pushes against `before`; one Actions step per gate; changeset check on PRs (not Dependabot or the Version PR); e2e as a per-app matrix (one VM each) behind a single `e2e-result` check; actions pinned to SHAs; weekly grouped Dependabot for actions and npm | A push's own diff can go green after an earlier push failed; the PR's merge-base covers the whole branch. Per-app VMs keep exclusive suites alone for free, and one aggregate check stays required as games are added. |
| 8 | 2026-11-10 | Release | changesets/action keeps a "Version Packages" PR open (PAT-opened so its checks run); merging it is the deploy; Vercel production builds only when the app's version changed; the relay deploys by hand | Nobody has to remember `changeset version`, and production moves only at a release. Revises #5's "versions bumped on deploy" mechanism: bumps still happen once, at release. |
