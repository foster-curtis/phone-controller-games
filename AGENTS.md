# AGENTS.md

Guidance for coding agents working in this repo. Human-facing setup lives in [README.md](README.md).

## What this repo is

A pnpm monorepo of same-room party games. A TV or laptop browser runs the game (the **host**), and
players' phones load a web page that acts as the **controller**. Host and phones never talk directly:
every message goes through a shared, game-agnostic WebSocket **relay**.

| Path                      | Package               | What                                                                     |
| ------------------------- | --------------------- | ------------------------------------------------------------------------ |
| `apps/relay`              | `@pcg/relay`          | Node WebSocket server, deployed to Fly.io. No game rules.                |
| `apps/sunny-side`         | `@pcg/sunny-side`     | Sunny Side Slam (Phaser + Matter.js). Vite multi-page app on Vercel.     |
| `apps/fort-frenzy`        | `@pcg/fort-frenzy`    | Fort Frenzy (Phaser). Vite multi-page app on Vercel.                     |
| `apps/say-cheese`         | `@pcg/say-cheese`     | Say Cheese!, the photo-tag party game (DOM, no Phaser). Vite on Vercel.  |
| `apps/gallery`            | `@pcg/gallery`        | Game Gallery (games.fostercurtis.dev): one static page from the catalog. |
| `packages/net-client`     | `@pcg/net-client`     | Relay protocol types plus host and controller clients (TS).              |
| `packages/controller-kit` | `@pcg/controller-kit` | Phone platform, app shell, widgets, gestures, input sender, dev harness. |
| `packages/game-kit`       | `@pcg/game-kit`       | Fixed-step loop, lerp, seeded RNG, host helpers; `/vite` plugins.        |
| `packages/catalog`        | `@pcg/catalog`        | Game catalog: schema, ordered list of games, validation, launch URLs.    |

`apps/` holds deployables (games and the relay). `packages/` holds code shared by more than one app.
Each game's release status is in `PLATFORM.md` §1.

Each game describes itself in `apps/<game>/game.meta.ts` (title, short and long description, card
art, player range, status). `@pcg/catalog` lists those entries in order and validates them, and the
gallery, each game's own UI and later surfaces read from it. A game's title and player limits come
from its `game.meta.ts`: never hardcode them in game code (`PLATFORM.md` §4, decision #9).

## Where to look

Shared code and repo-wide rules:

| You need…                                                | Look in                                                                                             |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Repo-wide rules (architecture, phones, hosting, layout)  | `PLATFORM.md`                                                                                       |
| Relay wire protocol (envelope, rooms, reconnect, errors) | `apps/relay/SPEC.md` §3, then `packages/net-client/src/protocol.ts`                                 |
| Host/controller client API (`createHostClient`, etc.)    | `packages/net-client/src/api.ts` (public API is `src/index.ts`)                                     |
| Relay server internals                                   | `apps/relay/src/` (`rooms.ts`, `heartbeat.ts`, `http.ts`; env in `main.ts`)                         |
| Relay hosting, config defaults, deploy                   | `apps/relay/SPEC.md` §2, `apps/relay/fly.toml`, `apps/relay/Dockerfile` (deploy from the repo root) |
| Fixed-step loop, lerp, seeded RNG, host helpers          | `packages/game-kit/src/` (`src/index.ts`; Vite plugins `src/vite.ts`; Playwright `src/e2e.ts`)      |
| Phone platform, shell, widgets, gestures, input sender   | `packages/controller-kit/src/` (public API `src/index.ts`)                                          |
| Game catalog: schema, game list, validation, launch URLs | `packages/catalog/` (README; `src/games.ts` order, `src/url.ts` routing, `/node`, `/vite` check)    |
| Versions, changelogs, major/minor/patch rules            | `PLATFORM.md` §5, `.changeset/` (config and pending notes), each package's `CHANGELOG.md`           |
| Lint boundary rules                                      | `eslint.config.js`                                                                                  |
| Build checks                                             | `scripts/check-bundle.mjs`, `scripts/check-routes.mjs`                                              |
| Affected selection, e2e runner, retest                   | `scripts/check-affected.mjs`, `scripts/e2e.mjs`, `scripts/lib/` (state in gitignored `.pcg-cache/`) |
| CI                                                       | `.github/workflows/ci.yml` (affected gate + e2e matrix on PRs and pushes to `main`)                 |
| Release, Vercel production builds, Dependabot            | `.github/workflows/release.yml`, `scripts/vercel-ignore.mjs`, `.github/dependabot.yml`              |

Inside a game (`apps/<game>/`), the layout is the same for every game:

| You need…                                        | Look in                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| Game design, technical design, decision log      | `SPEC.md` (the decision log is its last numbered section or table)       |
| Title, player range, catalog copy, card art      | `game.meta.ts`, `catalog/` (`card.jpg`, `share.webp`; schema in catalog) |
| Build history, freeze points, past build choices | `BUILD_PLAN.md` (§3 milestones and freeze points, §8 build decisions)    |
| Phone↔host game messages                         | `src/shared/messages.ts`                                                 |
| Host wiring, TV rendering, game logic            | `src/host/` (entry `main.ts`)                                            |
| Phone controller UI, screens, input              | `src/controller/` (entry `main.ts`)                                      |
| Brand tokens (colors, fonts, spacing)            | `src/styles/brand.css` (Phaser games mirror it in `src/shared/theme.ts`) |
| Tuning constants                                 | Named in the game's `SPEC.md`; each game keeps them in one place         |
| Playwright specs                                 | `e2e/`                                                                   |

Read the spec section that covers your change before you edit code. Source files open with a comment
that cites the spec section they implement (for example `// ... (SPEC §8)`). Follow those references:
`SPEC §` is the app's own `SPEC.md`, `PLATFORM §` is the root `PLATFORM.md`, and `relay SPEC §` is
`apps/relay/SPEC.md`.

## Commands

Run everything from the repo root with pnpm 10 and Node ≥ 22. Shell commands in the docs are POSIX sh
(Git Bash on Windows).

Root scripts are per app. `<game>` is the app folder name (`sunny-side`, `fort-frenzy`, `say-cheese`).
The gallery has its own set, listed after the block.

```sh
pnpm install                       # install the workspace
pnpm dev:<game>                    # relay on :8787 + the game's Vite on :5173 (phones at /play)
pnpm dev:lan:<game>                # same, with Vite bound to the LAN for real phones
pnpm dev:relay                     # the relay alone
pnpm check:<game>                  # that game's gate: typecheck, lint, format:check, test, build, check:bundle, check:routes, check:changeset
pnpm build:<game>                  # that game's Vite build
pnpm e2e:<game>                    # that game's Playwright suite (own relay and Vite, ports in package.json pcg.e2e)
pnpm --filter @pcg/<package> test  # one package's tests
pnpm affected                      # what your changes affect and what would run, without running it
pnpm check:affected                # the gate over only what changed (CI runs this on every push)
pnpm e2e:affected                  # the e2e specs your changes reach, plus last run's failures
pnpm retest                        # after a fix: failed e2e tests + specs the fix reaches; unit tests again
pnpm check                         # the full gate, every package
pnpm e2e                           # every app's Playwright suite (side by side; exclusive ones alone)
pnpm format                        # Prettier --write
pnpm changeset                     # add a version note for your change (see Versioning)
pnpm check:changeset               # fails if this branch changed a package without a note
```

The gallery (`apps/gallery`, no relay):

```sh
pnpm dev:gallery                   # Vite on :5173
pnpm dev:lan:gallery               # same, bound to the LAN
pnpm check:gallery                 # typecheck, lint, format:check, test (unit + build tests), build, check:changeset
pnpm build:gallery                 # its Vite build
pnpm e2e:gallery                   # its Playwright suite (Vite on :5177)
pnpm lighthouse:gallery            # build, vite preview on :4173, Lighthouse mobile ≥ 90 (performance, accessibility)
```

Never run `pnpm changeset version`: the release workflow does it (see Versioning).

- **Stay in your app.** While working on one game, run only that game's `check:<game>`, `build:<game>`
  and `e2e:<game>`. Don't run the full `pnpm check` / `pnpm e2e`, or another game's build or e2e.
- **Land through a PR; the affected gate guards `main`.** Nothing is pushed to `main` directly: open
  a PR, and CI runs the gate over what the branch reaches (`check` and `e2e-result` must pass). Run it
  locally first with `pnpm check:affected` and `pnpm e2e:affected`. They work out from git what your
  changes reach (changed packages plus everything that depends on them; specs that loaded a changed
  file), so a change to `packages/**` or the relay reaches every game by itself, and shared root config
  (lockfile, `eslint.config.js`, `tsconfig.base.json`, `scripts/`, `package.json`) runs everything. Run
  `pnpm affected` to see the selection and why. After a failure, fix it and run `pnpm retest`. The
  full `pnpm check` + `pnpm e2e` is for when you want everything; in CI, run the workflow by hand.
  Merging a feature PR doesn't deploy; merging the Version Packages PR does (see Versioning).
- `check:<game>` must pass before you call work on a game done. Run `e2e:<game>` when you change host
  wiring, the controller, or anything on the relay round trip. A game's first e2e run needs
  `pnpm --filter @pcg/<game> exec playwright install chromium`.
- Offline controller dev: open `/play?dev=1` (no relay; a fake client and a screen switcher).
- Host debug hooks: `window.__pcg`, on in dev or with `?debug=1`.
- Ports used: dev 5173/8787 (every game and the gallery share them, so run one dev server at a time),
  preview 4173 (`check:routes`, `lighthouse:gallery`), Docker relay smoke 8789. E2E ports are per app
  in its `package.json` `pcg.e2e` (Sunny Side 8788/5174, Fort Frenzy 8790/5175, Say Cheese 8791/5176,
  gallery 5177 with relay port 8792 reserved but unused), so suites can run side by side. Keep them
  free.

## Architecture rules

These rules are enforced by ESLint or by `pnpm check`. Don't work around them.

- **Host-authoritative.** The host runs the whole simulation and all rendering. Phones send input state
  only (stick vector plus button bits), never discrete commands. The relay holds no game rules.
- **`packages/**` must not import from `apps/**`.** Shared code depends on nothing game-specific.
  The one exception is `packages/catalog/src/games.ts`, which may import `apps/<game>/game.meta.ts`
  and nothing else from `apps/` (`PLATFORM.md` decision #9).
- **Title and player limits come from `game.meta.ts`.** Game code imports the named `title`,
  `minPlayers` and `maxPlayers` exports (not the default export, so phones don't bundle the
  descriptions). Every game's `vite.config.ts` runs `catalogCheck()` from `@pcg/catalog/vite`, which
  fails the build on an invalid catalog: a missing field, bad player range, duplicate id, a short
  description over 160 characters, missing card or share art, or a page `<title>` or web-manifest name that
  differs from `title`.
- **The controller never loads Phaser or host code.** Files in `src/controller/**` must not import
  `phaser` or anything under `host/`. The host (`index.html`) and controller (`play.html`) are separate
  Vite entries so that phones load quickly; `check:bundle` fails the build if Phaser reaches `play.html`
  or its JS passes the game's gzipped limit in `PLAY_JS_LIMIT_KB`.
- **Game logic is plain TS.** `src/host/{sim,match,systems,party}/**` must not import `phaser` or
  `@pcg/net-client`, and ESLint adds determinism and no-DOM rules there (`eslint.config.js` has the
  exact list). Rendering only reads sim snapshots, and the host wiring file connects client, rules and
  renderer. This keeps game logic testable headless.
- **Wire encoding lives in `net-client/src/codec.ts`**, so a later move to binary stays a contained change.

## Contracts and docs

- **Frozen contracts take additive changes only.** A file is frozen when its header says "Frozen".
  Repo-wide these are `net-client/src/protocol.ts`, `net-client/src/api.ts`, `createRelay`/`RelayOptions`
  in `apps/relay/src/index.ts`, the relay env var names, and the public APIs of `@pcg/controller-kit`
  (`src/index.ts`) and `@pcg/game-kit` (`src/index.ts`, `src/vite.ts`, `src/e2e.ts`). Each game also freezes its own
  contracts (always `src/shared/messages.ts`; the rest are listed in its `BUILD_PLAN.md` §3). Every game
  depends on the relay protocol, so a breaking change there breaks all of them. If you add to a
  contract, also update the matching spec section (`apps/relay/SPEC.md` for the relay and net-client).
- **Tuning values are not frozen.** Change balance and timing values freely, in the file the game's
  spec names for them, even when that file's header says "Frozen" (that freezes the names, not the
  values). Don't scatter new tuning numbers or fallbacks through game logic.
- **Brand kits are read-only.** Every game's `src/styles/brand.css`, `public/**` and `brand/**` came from
  a delivered brand kit. Don't edit them. Take colors, fonts and sizes from `brand.css` variables (DOM)
  or `theme.ts` (Phaser), never from literals. `theme.test.ts` fails if `theme.ts` drifts from
  `brand.css`. The gallery's kit is the same: `apps/gallery/src/brand/**`, `public/**` and `brand/**`
  are read-only, and its colors, fonts and sizes come from the kit's CSS variables and classes.
- **Specs record decisions.** When a change settles or reverses a design decision, update the game's
  spec, and add a row to its decision log. Settled sections are marked "(settled)". Don't reopen them
  without the user.
- **Where a decision goes:** rules every game shares go in `PLATFORM.md`. Relay and net-client behavior
  goes in `apps/relay/SPEC.md`. Everything game-specific goes in that game's `SPEC.md` (and its build
  plan) in its app folder. Each of these has its own decision log. Game-specific rules belong there,
  not in this file.

## Versioning

Every app and package has a semver version and a `CHANGELOG.md`, managed by Changesets. The rules and
the major/minor/patch table are in `PLATFORM.md` §5.

- **Add a note with every change.** When you change a package's shipped code, run
  `pnpm changeset --<level> <@pcg/package,...> -m "<one line for the changelog>"` (or plain
  `pnpm changeset` for prompts) and commit the `.changeset/*.md` file with your work. Name only the
  packages you edited. Apps that depend on a changed package get their patch bump automatically.
  Tests, fixtures, e2e and Markdown need no note. A pure refactor can use `pnpm changeset --empty`.
- **Pick the level from what players notice:** major breaks compatibility (old phones vs. new TV, a
  `PROTOCOL_VERSION` bump, lost saves); minor adds a feature, mode or content; patch is a fix, balance
  tweak or polish. In doubt between two, ask the user.
- **Don't bump versions yourself.** Never edit a `version` field or a `CHANGELOG.md` by hand, and never
  run `pnpm changeset version`. The release workflow runs it: on every push to `main` it keeps a
  "Version Packages" PR open with the pending bumps and changelogs. Merging that PR is the deploy:
  Vercel builds production only for apps whose version changed. The relay still deploys by hand
  (`fly deploy` from the repo root) after a Version PR bumps it.
- `check:<game>` ends with `check:changeset`, which fails if your branch changed a package without a
  note. The note must be committed or staged. CI runs the same check on every PR (not Dependabot's;
  `PLATFORM.md` §5 says when a Dependabot PR needs a note pushed to it).

## Code conventions

- TypeScript strict, ESM, `verbatimModuleSyntax`. Use `import type` for type-only imports (lint enforces
  it). Prefix unused parameters with `_`.
- `net-client`, the two kits and `relay` ship as TS source with no build step (`exports` points at
  `src/index.ts`). The kits are `sideEffects: false` so phones only bundle what they import.
- Dependencies are pinned to exact versions (`.npmrc` has `save-exact=true`). Commit the
  `pnpm-lock.yaml` changes with them.
- Tests:
  - Games keep tests in `__tests__/` next to the code (a few co-located `*.test.ts` files too). Files
    under `src/controller/**` run in jsdom, and everything else runs in node.
  - The relay, net-client and kits keep tests in `test/` with fakes and helpers there (controller-kit
    runs in jsdom), plus a few co-located `*.test.ts` files.
  - Playwright specs are in `apps/<game>/e2e/`. Screenshots in `e2e/__screens__/` are gitignored output.
    Specs import `test` from `./helpers` (lint enforces it): its fixture records the files each test
    loads, which `pnpm e2e:affected` and `pnpm retest` select specs by.
- Line endings are LF (`.gitattributes`), even on Windows. Prettier formats everything except the files
  listed in `.prettierignore`, which include the specs, build plans and the brand `<head>` HTML.
- Comments are short and explain _why_, often with a spec or decision citation. Match the density of the
  surrounding code.

## Adding a new game

Write the game's `SPEC.md` and `BUILD_PLAN.md` first; they drive the build. When it gets code:

- Model it on an existing game: separate `index.html` (host) and `play.html` (controller) entries,
  `src/host`, `src/controller`, `src/shared`, a unique game ID (`GAME_ID`) for the relay namespace, and a
  `@pcg/<name>` package.
- Reuse `@pcg/net-client`, the kits and the relay as they are. Don't fork the protocol.
- Create its catalog entry (`packages/catalog/README.md` has the details):
  - Create `apps/<game>/game.meta.ts` (copy an existing game's). The `id` is the app folder name,
    which is also its subdomain. Export `title`, `minPlayers` and `maxPlayers` as named constants and
    the full entry as the default export (`satisfies GameMeta`). Write the descriptions for players.
  - Put its 1200×630 card art at `apps/<game>/catalog/card.jpg` (`image`) and a smaller link-share
    copy at `apps/<game>/catalog/share.webp` (`shareImage`, never SVG). Use placeholders until real
    art exists. Never use `public/` or `brand/`: those are the brand kit's.
  - Add the entry to `GAMES` in `packages/catalog/src/games.ts` (the order is the gallery order).
    The gallery (`apps/gallery`) then shows it from `GAMES` at its next build, with no gallery change,
    unless its `status` is `hidden`.
  - Add `"@pcg/catalog": "workspace:*"` to the game's devDependencies, `catalogCheck()` to its
    `vite.config.ts` plugins and `"game.meta.ts"` to its `tsconfig.json` `include`.
  - Take the title and player limits in game code from `game.meta.ts`, never from literals. The
    page `<title>` in `index.html` and `play.html` must match `title`.
- Only extract code into `packages/` once two games really need it (`PLATFORM.md` §4, decisions #1 and
  #4). Propose any further extraction before making it.
- Root wiring to add:
  - In `package.json`, copy an existing game's five scripts (`dev:`, `dev:lan:`, `build:`, `e2e:`,
    `check:<game>`) and swap in the new folder and package names.
  - Add the game's gzipped `play.html` JS limit to `PLAY_JS_LIMIT_KB` in `scripts/check-bundle.mjs`.
  - In the game's `package.json`, add `"pcg": { "e2e": { "relayPort", "webPort" } }` with the next free
    pair (the runner refuses duplicates), plus `"exclusive": true` if the suite is CPU- or
    timing-sensitive so it runs alone. Its `playwright.config.ts` and `e2e/helpers.ts` read them with
    `readE2EConfig` from `@pcg/game-kit/e2e`, and `helpers.ts` adds the `impact` fixture (copy an
    existing game's). Add `@pcg/relay` as a devDependency: the e2e suite starts it.
  - In the game's `vercel.json`, set `"ignoreCommand": "node ../../scripts/vercel-ignore.mjs <game>"`
    (production builds only on a version bump; previews when the app, `packages/` or the lockfile
    changed).
  - Add the game to the tables in `PLATFORM.md` §1, `README.md` and this file.
- Already generic, so no edits needed: `eslint.config.js` (boundary rules by folder, app names from
  `apps/*/package.json`), `check-bundle.mjs` and `check-routes.mjs` (find every `apps/*` with a
  `play.html`), `.prettierignore`, the root `pnpm build`, and the affected/e2e scripts (they read the
  workspace from every `package.json`).
- `check:routes` expects the existing games' conventions: `data-entry` markers, the icon set and
  manifest, and Google Fonts in the `<head>`. Match them or adjust the script.

## Git

- **On a feature branch, check that it's up to date with `main` before you start.** Run `git fetch origin`
  and `git log --oneline HEAD..origin/main`. If that lists commits, merge `origin/main` into the branch
  before beginning the task. If the merge conflicts, stop and ask the user.
- Commit only when asked, and never push unless asked.
- Commit subjects are short and imperative. Milestone work uses the build plan's prefix, such as
  `FF7:`, `SC5-fix-2:` or `M3:` (see `git log`).
- Don't edit files in `.claude/worktrees/`. They are other agents' checkouts.
