# AGENTS.md

Guidance for coding agents working in this repo. Human-facing setup lives in [README.md](README.md).

## What this repo is

A pnpm monorepo of same-room party games. A TV or laptop browser runs the game (the **host**), and
players' phones load a web page that acts as the **controller**. Host and phones never talk directly:
every message goes through a shared, game-agnostic WebSocket **relay**.

| Path                  | Package           | Status                                                                 |
| --------------------- | ----------------- | ---------------------------------------------------------------------- |
| `apps/relay`          | `@pcg/relay`      | Done. Node WebSocket server, deployed to Fly.io. No game rules.        |
| `apps/sunny-side`     | `@pcg/sunny-side` | Done. Sunny Side Shove, the first game. Vite multi-page app on Vercel. |
| `apps/fort-frenzy`    | (none yet)        | Planning. Only a design spec exists, with no code or `package.json`.   |
| `packages/net-client` | `@pcg/net-client` | Done. Relay protocol types plus host and controller clients (TS).      |

`apps/` holds deployables (games and the relay). `packages/` holds code shared by more than one app.

## Where to look

| You need…                                                 | Look in                                                                                                      |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Relay wire protocol (envelope, rooms, reconnect, errors)  | `apps/sunny-side/SPEC.md` §7.1 (additions in `BUILD_PLAN.md` §8), then `packages/net-client/src/protocol.ts` |
| Host/controller client API (`createHostClient`, etc.)     | `packages/net-client/src/api.ts` (public API is `src/index.ts`)                                              |
| Relay server internals                                    | `apps/relay/src/` (`rooms.ts`, `heartbeat.ts`, `http.ts`; env in `main.ts`)                                  |
| Relay deploy config                                       | `apps/relay/fly.toml`, `apps/relay/Dockerfile` (deploy from the repo root)                                   |
| Sunny Side game design and the decision log               | `apps/sunny-side/SPEC.md` (§10 is the decision log)                                                          |
| Sunny Side build history, contracts, past build decisions | `apps/sunny-side/BUILD_PLAN.md` (§3 freeze points, §8 build decisions)                                       |
| Sunny Side phone↔host game messages                       | `apps/sunny-side/src/shared/messages.ts`                                                                     |
| Physics simulation (Matter.js, no Phaser)                 | `apps/sunny-side/src/host/sim/`                                                                              |
| Match rules: roster, rounds, scoring, leader, persistence | `apps/sunny-side/src/host/match/`                                                                            |
| Gameplay tuning constants                                 | `apps/sunny-side/src/host/sim/config.ts`, `apps/sunny-side/src/host/match/config.ts`                         |
| Fixed-step loop and render interpolation                  | `apps/sunny-side/src/host/loop/`                                                                             |
| Host wiring (client ↔ match ↔ sim)                        | `apps/sunny-side/src/host/game.ts`, entry `src/host/main.ts`                                                 |
| TV rendering (Phaser scenes and drawing)                  | `apps/sunny-side/src/host/scenes/`, `apps/sunny-side/src/host/render/`                                       |
| Phone controller UI, screens, input                       | `apps/sunny-side/src/controller/` (entry `main.ts`, screens in `screens/`)                                   |
| Brand tokens (colors, fonts, spacing)                     | `apps/sunny-side/src/styles/brand.css`, mirrored for Phaser in `src/shared/theme.ts`                         |
| Debug hooks                                               | `apps/sunny-side/src/host/debug.ts` (`window.__pcg`), `src/controller/dev.ts`                                |
| Fort Frenzy design                                        | `apps/fort-frenzy/spec.md`                                                                                   |
| Lint boundary rules                                       | `eslint.config.js`                                                                                           |
| Build checks                                              | `scripts/check-bundle.mjs`, `scripts/check-routes.mjs`                                                       |
| CI                                                        | `.github/workflows/ci.yml` (runs `pnpm check` on every push)                                                 |

Read the spec section that covers your change before you edit code. Source files open with a comment
that cites the spec section they implement (for example `// ... (SPEC §8)`). Follow those references.

## Commands

Run everything from the repo root with pnpm 10 and Node ≥ 22. Shell commands in the docs are POSIX sh
(Git Bash on Windows).

```sh
pnpm install                       # install the workspace
pnpm dev                           # relay on :8787 + Sunny Side Vite on :5173 (phones at /play)
pnpm dev:lan                       # same, with Vite bound to the LAN for real phones
pnpm check                         # the full gate: typecheck, lint, format:check, test, build, check:bundle, check:routes
pnpm test                          # Vitest in every package
pnpm --filter @pcg/relay test      # one package (also @pcg/net-client, @pcg/sunny-side)
pnpm e2e                           # Playwright (Chromium); starts its own relay on 8788 and Vite on 5174
pnpm format                        # Prettier --write
```

- `pnpm check` must pass before you call work done. CI runs the same command.
- Run `pnpm e2e` when you change host wiring, the controller, or anything on the relay round trip. The
  first run needs `pnpm --filter @pcg/sunny-side exec playwright install chromium`.
- Offline controller dev: open `/play?dev=1` (no relay; a fake client and a screen switcher).
- Host debug hooks: `window.__pcg`, on in dev or with `?debug=1`.
- Ports used: dev 5173/8787, preview 4173 (`check:routes`), e2e 5174/8788. Keep them free.

## Architecture rules

These rules are enforced by ESLint or by `pnpm check`. Don't work around them.

- **Host-authoritative.** The host runs the whole simulation and all rendering. Phones send input state
  only (stick vector plus button bits), never discrete commands. The relay holds no game rules.
- **`packages/**` must not import from `apps/**`.** Shared code depends on nothing game-specific.
- **The controller never loads Phaser or host code.** Files in `src/controller/**` must not import
  `phaser` or anything under `host/`. `check:bundle` fails the build if Phaser reaches `play.html`.
  The host (`index.html`) and controller (`play.html`) are separate Vite entries so that phones load
  quickly.
- **`sim/` and `match/` are plain TS.** They must not import `phaser` or `@pcg/net-client`. Phaser only
  renders sim snapshots, and `host/game.ts` does the wiring. This keeps the game logic testable headless.
- **Wire encoding lives in `net-client/src/codec.ts`**, so a later move to binary stays a contained change.

## Contracts and docs

- **Frozen contracts take additive changes only.** These are `net-client/src/protocol.ts`,
  `net-client/src/api.ts`, `createRelay`/`RelayOptions` in `apps/relay/src/index.ts`, the relay env
  var names, and in Sunny Side `src/shared/messages.ts`, `src/shared/theme.ts`,
  `src/shared/fonts.ts`, `src/host/sim/types.ts` and `src/host/match/types.ts`. Their file headers say
  "Frozen". Every game depends on the relay protocol, so a breaking change there breaks all of them.
  If you add to a contract, also update the matching spec section.
- **Tuning constants are not frozen.** Change values in the `config.ts` files freely.
- **The Sunny Side brand kit is read-only.** Don't edit `src/styles/brand.css`, `public/**` or `brand/**`.
  Take colors, fonts and sizes from `brand.css` variables (DOM) or `theme.ts` (Phaser), never from
  literals. `theme.test.ts` fails if `theme.ts` drifts from `brand.css`.
- **Specs record decisions.** When a change settles or reverses a design decision, update the game's
  spec, and add a row to its decision log if it has one. Settled sections are marked "(settled)".
  Don't reopen them without the user.
- Each game keeps its own spec (and build plan, once it has one) in its app folder. The relay protocol
  is currently specified only in Sunny Side's `SPEC.md` §7.1, but it applies to every game.

## Code conventions

- TypeScript strict, ESM, `verbatimModuleSyntax`. Use `import type` for type-only imports (lint enforces
  it). Prefix unused parameters with `_`.
- `net-client` and `relay` ship as TS source with no build step (`exports` points at `src/index.ts`).
- Dependencies are pinned to exact versions (`.npmrc` has `save-exact=true`). Commit the
  `pnpm-lock.yaml` changes with them.
- Tests:
  - Sunny Side keeps tests in `__tests__/` next to the code. Files under `src/controller/**` run in
    jsdom, and everything else runs in node.
  - The relay and net-client keep tests in `test/` (with fakes and helpers there), plus a few
    co-located `*.test.ts` files.
  - Playwright specs are in `apps/sunny-side/e2e/`. Screenshots in `e2e/__screens__/` are gitignored
    output.
- Line endings are LF (`.gitattributes`), even on Windows. Prettier formats everything except the files
  listed in `.prettierignore`, which include the specs, build plans and the brand `<head>` HTML.
- Comments are short and explain _why_, often with a spec or decision citation. Match the density of the
  surrounding code.

## Adding or starting a game (Fort Frenzy)

Fort Frenzy is still in planning. Its spec covers game design only. The technical sections (repo
layout, engine, protocol, game loop, module boundaries) are still to be written, using this monorepo as
the starting point. Don't scaffold code until the user asks. When a new game gets code:

- Model it on `apps/sunny-side`: separate `index.html` (host) and `play.html` (controller) entries,
  `src/host`, `src/controller`, `src/shared`, a unique game ID (`GAME_ID`) for the relay namespace, and a
  `@pcg/<name>` package.
- Reuse `@pcg/net-client` and the relay as they are. Don't fork the protocol.
- Only extract code into `packages/` once two games really need it. Sunny Side decided to defer shared
  kits until a second game shows what is common (SPEC §4, decision #7). Fort Frenzy is that second game,
  so expect extractions, and propose them before making them.
- Root wiring is currently specific to Sunny Side and needs extending. This covers the `build`, `dev` and
  `e2e` scripts in `package.json`, the paths in `scripts/check-bundle.mjs` and `scripts/check-routes.mjs`,
  the per-app globs in `eslint.config.js` (including the `packages/**` rule's `@pcg/(relay|sunny-side)`
  pattern), `.prettierignore`, and the README table.

## Git

- Commit only when asked, and never push unless asked.
- Commit subjects are short and imperative. Sunny Side milestone work used an `M<n>:` or `M<n>-fix-<k>:`
  prefix (see `git log`).
- Don't edit files in `.claude/worktrees/`. They are other agents' checkouts.
