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
| `packages/net-client`     | `@pcg/net-client`     | Relay protocol types plus host and controller clients (TS).              |
| `packages/controller-kit` | `@pcg/controller-kit` | Phone platform, app shell, widgets, gestures, input sender, dev harness. |
| `packages/game-kit`       | `@pcg/game-kit`       | Fixed-step loop, lerp, seeded RNG, host helpers; `/vite` plugins.        |

`apps/` holds deployables (games and the relay). `packages/` holds code shared by more than one app.
Each game's release status is in `PLATFORM.md` §1.

## Where to look

Shared code and repo-wide rules:

| You need…                                                | Look in                                                                                             |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Repo-wide rules (architecture, phones, hosting, layout)  | `PLATFORM.md`                                                                                       |
| Relay wire protocol (envelope, rooms, reconnect, errors) | `apps/relay/SPEC.md` §3, then `packages/net-client/src/protocol.ts`                                 |
| Host/controller client API (`createHostClient`, etc.)    | `packages/net-client/src/api.ts` (public API is `src/index.ts`)                                     |
| Relay server internals                                   | `apps/relay/src/` (`rooms.ts`, `heartbeat.ts`, `http.ts`; env in `main.ts`)                         |
| Relay hosting, config defaults, deploy                   | `apps/relay/SPEC.md` §2, `apps/relay/fly.toml`, `apps/relay/Dockerfile` (deploy from the repo root) |
| Fixed-step loop, lerp, seeded RNG, host helpers          | `packages/game-kit/src/` (public API `src/index.ts`; Vite plugins `src/vite.ts`)                    |
| Phone platform, shell, widgets, gestures, input sender   | `packages/controller-kit/src/` (public API `src/index.ts`)                                          |
| Versions, changelogs, major/minor/patch rules            | `PLATFORM.md` §5, `.changeset/` (config and pending notes), each package's `CHANGELOG.md`           |
| Lint boundary rules                                      | `eslint.config.js`                                                                                  |
| Build checks                                             | `scripts/check-bundle.mjs`, `scripts/check-routes.mjs`                                              |
| CI                                                       | `.github/workflows/ci.yml` (runs `pnpm check` on every push)                                        |

Inside a game (`apps/<game>/`), the layout is the same for every game:

| You need…                                        | Look in                                                                  |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| Game design, technical design, decision log      | `SPEC.md` (the decision log is its last numbered section or table)       |
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

Root scripts are per game. `<game>` is the app folder name (`sunny-side`, `fort-frenzy`, `say-cheese`).

```sh
pnpm install                       # install the workspace
pnpm dev:<game>                    # relay on :8787 + the game's Vite on :5173 (phones at /play)
pnpm dev:lan:<game>                # same, with Vite bound to the LAN for real phones
pnpm dev:relay                     # the relay alone
pnpm check:<game>                  # that game's gate: typecheck, lint, format:check, test, build, check:bundle, check:routes, check:changeset
pnpm build:<game>                  # that game's Vite build
pnpm e2e:<game>                    # that game's Playwright suite (own relay on 8788, Vite on 5174)
pnpm --filter @pcg/<package> test  # one package's tests
pnpm check                         # the full gate, every package (CI runs this)
pnpm e2e                           # every app's Playwright suite, one app at a time
pnpm format                        # Prettier --write
pnpm changeset                     # add a version note for your change (see Versioning)
pnpm check:changeset               # fails if this branch changed a package without a note
pnpm changeset version             # on deploy only: bump versions, write the CHANGELOG.md files
```

- **Stay in your app.** While working on one game, run only that game's `check:<game>`, `build:<game>`
  and `e2e:<game>`. Don't run the full `pnpm check` / `pnpm e2e`, or another game's build or e2e.
- **Full gate before `main`.** Before merging or pushing to `main` (a deploy), run `pnpm check` and
  `pnpm e2e`. Both must pass. CI runs `pnpm check` on every push. Then run `pnpm changeset version`
  and commit the bumps with the deploy (see Versioning).
- **Shared code means the full gate.** A change to `apps/relay`, `packages/**`, or root config
  (`eslint.config.js`, `tsconfig.base.json`, `scripts/`, `package.json`) affects every game, so run the
  full `pnpm check` and `pnpm e2e`.
- `check:<game>` must pass before you call work on a game done. Run `e2e:<game>` when you change host
  wiring, the controller, or anything on the relay round trip. A game's first e2e run needs
  `pnpm --filter @pcg/<game> exec playwright install chromium`.
- Offline controller dev: open `/play?dev=1` (no relay; a fake client and a screen switcher).
- Host debug hooks: `window.__pcg`, on in dev or with `?debug=1`.
- Ports used: dev 5173/8787, preview 4173 (`check:routes`), e2e 5174/8788. Keep them free. Every game
  shares the same ports, so run one game's dev server or e2e suite at a time.

## Architecture rules

These rules are enforced by ESLint or by `pnpm check`. Don't work around them.

- **Host-authoritative.** The host runs the whole simulation and all rendering. Phones send input state
  only (stick vector plus button bits), never discrete commands. The relay holds no game rules.
- **`packages/**` must not import from `apps/**`.** Shared code depends on nothing game-specific.
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
  (`src/index.ts`) and `@pcg/game-kit` (`src/index.ts`, `src/vite.ts`). Each game also freezes its own
  contracts (always `src/shared/messages.ts`; the rest are listed in its `BUILD_PLAN.md` §3). Every game
  depends on the relay protocol, so a breaking change there breaks all of them. If you add to a
  contract, also update the matching spec section (`apps/relay/SPEC.md` for the relay and net-client).
- **Tuning values are not frozen.** Change balance and timing values freely, in the file the game's
  spec names for them, even when that file's header says "Frozen" (that freezes the names, not the
  values). Don't scatter new tuning numbers or fallbacks through game logic.
- **Brand kits are read-only.** Every game's `src/styles/brand.css`, `public/**` and `brand/**` came from
  a delivered brand kit. Don't edit them. Take colors, fonts and sizes from `brand.css` variables (DOM)
  or `theme.ts` (Phaser), never from literals. `theme.test.ts` fails if `theme.ts` drifts from
  `brand.css`.
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
- **Don't bump versions yourself.** Never edit a `version` field or a `CHANGELOG.md` by hand, and don't
  run `pnpm changeset version` on a branch. It runs once, on deploy to `main`.
- `check:<game>` ends with `check:changeset`, which fails if your branch changed a package without a
  note. The note must be committed or staged.

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
- Only extract code into `packages/` once two games really need it (`PLATFORM.md` §4, decisions #1 and
  #4). Propose any further extraction before making it.
- Root wiring to add:
  - In `package.json`, copy an existing game's five scripts (`dev:`, `dev:lan:`, `build:`, `e2e:`,
    `check:<game>`) and swap in the new folder and package names.
  - Add the game's gzipped `play.html` JS limit to `PLAY_JS_LIMIT_KB` in `scripts/check-bundle.mjs`.
  - Add the game to the tables in `PLATFORM.md` §1, `README.md` and this file.
- Already generic, so no edits needed: `eslint.config.js` (boundary rules by folder, app names from
  `apps/*/package.json`), `check-bundle.mjs` and `check-routes.mjs` (find every `apps/*` with a
  `play.html`), `.prettierignore`, and the root `pnpm build` / `pnpm e2e`.
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
