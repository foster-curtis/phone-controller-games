# phone-controller-games

Same-room party games: the TV runs the game in a browser, phones are the controllers.

- [`PLATFORM.md`](PLATFORM.md): repo-wide spec (architecture, phone requirements, hosting, layout).
- [`apps/relay/SPEC.md`](apps/relay/SPEC.md): the shared relay and its protocol.
- Each game keeps its own `SPEC.md` (design) and `BUILD_PLAN.md` (build plan) in its app folder, e.g.
  [`apps/sunny-side/SPEC.md`](apps/sunny-side/SPEC.md).

| Path                  | Package           | What                                                       |
| --------------------- | ----------------- | ---------------------------------------------------------- |
| `apps/relay`          | `@pcg/relay`      | Game-agnostic WebSocket relay (Fly.io)                     |
| `apps/sunny-side`     | `@pcg/sunny-side` | Sunny Side Slam: host (`/`) + phone controller (`/play`)   |
| `apps/fort-frenzy`    | (none yet)        | Fort Frenzy: in planning (spec only)                       |
| `packages/net-client` | `@pcg/net-client` | Relay protocol types + host/controller clients (TS source) |

## Setup

Node ≥ 22 and pnpm 10:

```sh
pnpm install
```

## Develop

Scripts are per game (`<game>` is the app folder name, e.g. `sunny-side`):

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
pnpm check:sunny-side     # its typecheck, lint, format:check, test, build, check:bundle, check:routes
pnpm build:sunny-side     # Vite build
pnpm e2e:sunny-side       # Playwright (Chromium)
```

Before anything lands on `main` (and after any change to the relay or `packages/`), run the full set:

```sh
pnpm check                # every package: typecheck, lint, format:check, test, build, check:bundle, check:routes
pnpm e2e                  # every app's Playwright suite, one app at a time
pnpm format               # Prettier --write
```

`check:bundle [<game>]` fails if anything reachable from a game's `play.html` contains Phaser;
`check:routes [<game>]` serves the build with `vite preview` on :4173 and checks `/`, `/play`, the
icons and the brand `<head>`. Without a name they check every game app (any `apps/*` with a
`play.html`).
