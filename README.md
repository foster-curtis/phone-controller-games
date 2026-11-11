# phone-controller-games

Same-room party games: the TV runs the game in a browser, phones are the controllers.

- [`PLATFORM.md`](PLATFORM.md): repo-wide spec (architecture, phone requirements, hosting, layout).
- [`apps/relay/SPEC.md`](apps/relay/SPEC.md): the shared relay and its protocol.
- Each game keeps its own `SPEC.md` (design) and `BUILD_PLAN.md` (build plan) in its app folder, e.g.
  [`apps/sunny-side/SPEC.md`](apps/sunny-side/SPEC.md).

| Path                      | Package               | What                                                                    |
| ------------------------- | --------------------- | ----------------------------------------------------------------------- |
| `apps/relay`              | `@pcg/relay`          | Game-agnostic WebSocket relay (Fly.io)                                  |
| `apps/sunny-side`         | `@pcg/sunny-side`     | Sunny Side Slam: host (`/`) + phone controller (`/play`)                |
| `apps/fort-frenzy`        | `@pcg/fort-frenzy`    | Fort Frenzy: host (`/`) + phone controller (`/play`)                    |
| `apps/say-cheese`         | `@pcg/say-cheese`     | Say Cheese!: host (`/`) + phone controller (`/play`)                    |
| `packages/net-client`     | `@pcg/net-client`     | Relay protocol types + host/controller clients (TS source)              |
| `packages/controller-kit` | `@pcg/controller-kit` | Phone platform, app shell, input widgets, gestures, sender, dev harness |
| `packages/game-kit`       | `@pcg/game-kit`       | Fixed-step loop, lerp, seeded RNG, host helpers, Vite plugins (`/vite`) |
| `packages/catalog`        | `@pcg/catalog`        | Game catalog: schema, ordered game list, validation, launch URLs        |

Each game describes itself in `apps/<game>/game.meta.ts`: title, short and long description, card art
(`apps/<game>/catalog/`), player range and status. That file is the one source for the game's title
and player limits. The game's own code and `@pcg/catalog` both read it, and a game's build fails if
the catalog is invalid. See [`packages/catalog/README.md`](packages/catalog/README.md).

## Setup

Node ≥ 22 and pnpm 10:

```sh
pnpm install
```

## Develop

Scripts are per game (`<game>` is the app folder name: `sunny-side`, `fort-frenzy` or `say-cheese`):

```sh
pnpm dev:sunny-side       # relay on :8787 + Vite on :5173 (http://localhost:5173, phones at /play)
pnpm dev:lan:sunny-side   # same, Vite bound to the LAN so phones on the same Wi-Fi can join
pnpm dev:relay            # the relay alone
```

With `dev:lan:<game>`, open `http://<laptop-LAN-IP>:5173` on the TV and
`http://<laptop-LAN-IP>:5173/play` on phones. The client connects to `VITE_RELAY_URL` if set, else
`ws://<page host>:8787`. Over plain http, Wake Lock / fullscreen / orientation lock are skipped.

## Test

While working on one game, run only that game's checks:

```sh
pnpm check:sunny-side     # its typecheck, lint, format:check, test, build, check:bundle, check:routes, check:changeset
pnpm build:sunny-side     # Vite build
pnpm e2e:sunny-side       # Playwright (Chromium)
```

Before anything lands on `main`, run the gate over what your changes reach. It works out from git
which packages changed and which depend on them, which unit tests import a changed file, and which e2e
specs loaded one (`PLATFORM.md` §4, decision #6). Shared root config runs everything.

```sh
pnpm affected             # what would run and why, without running it
pnpm check:affected       # typecheck, lint, format, unit tests, build, bundle/routes, changeset: affected only
pnpm e2e:affected         # affected e2e specs; suites side by side, Fort Frenzy's alone afterwards
pnpm retest               # after a fix: the failed e2e tests plus specs the fix reaches; unit tests again
```

The full set, for when you want everything:

```sh
pnpm check                # every package: typecheck, lint, format:check, test, build, check:bundle, check:routes
pnpm e2e                  # every app's Playwright suite (side by side; exclusive suites alone)
pnpm format               # Prettier --write
```

`check:bundle [<game>...]` fails if anything reachable from a game's `play.html` contains Phaser or its
gzipped JS exceeds the game's limit (in the script);
`check:routes [<game>...]` serves the build with `vite preview` on :4173 and checks `/`, `/play`, the
icons and the brand `<head>`. Without a name they check every game app (any `apps/*` with a
`play.html`).

Fort Frenzy generates its asset manifest, icon sprite and class portraits into the gitignored
`apps/fort-frenzy/generated/` with `pnpm --filter @pcg/fort-frenzy assets`; its `dev`, `build`,
`typecheck`, `test` and `e2e` scripts run that first.

## Versions

Each game, the relay and each package has a semver version and a `CHANGELOG.md`, managed by
[Changesets](https://github.com/changesets/changesets). Rules are in `PLATFORM.md` §5.

```sh
pnpm changeset            # with each change: note which packages changed and major, minor or patch
pnpm check:changeset      # fails if this branch changed a package without a note
```

Everything lands on `main` through a PR; CI (`.github/workflows/ci.yml`) runs the affected checks and
e2e suites, and can be run by hand for everything. Merging a feature PR doesn't deploy. The release
workflow keeps a "Version Packages" PR open with the pending bumps and changelogs; merging it is the
deploy, and Vercel builds production only for games whose version changed. The relay deploys by hand
(`fly deploy` from the repo root) after a release bumps it.

The games show their version in a corner of the TV and on the phone's join and lobby screens.
