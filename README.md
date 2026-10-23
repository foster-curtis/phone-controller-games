# phone-controller-games

Same-room party games: the TV runs the game in a browser, phones are the controllers. See
[`SPEC.md`](SPEC.md) for the design and [`BUILD_PLAN.md`](BUILD_PLAN.md) for the build plan.

| Path                  | Package           | What                                                       |
| --------------------- | ----------------- | ---------------------------------------------------------- |
| `apps/relay`          | `@pcg/relay`      | Game-agnostic WebSocket relay (Fly.io)                     |
| `apps/sunny-side`     | `@pcg/sunny-side` | Sunny Side Shove: host (`/`) + phone controller (`/play`)  |
| `packages/net-client` | `@pcg/net-client` | Relay protocol types + host/controller clients (TS source) |

## Setup

Node ≥ 22 and pnpm 10:

```sh
pnpm install
```

## Develop

```sh
pnpm dev       # relay on :8787 + Vite on :5173 (http://localhost:5173, phones at /play)
pnpm dev:lan   # same, Vite bound to the LAN so phones on the same Wi-Fi can join
```

With `dev:lan`, open `http://<laptop-LAN-IP>:5173` on the TV and `http://<laptop-LAN-IP>:5173/play`
on phones. The client connects to `VITE_RELAY_URL` if set, else `ws://<page host>:8787`.
Over plain http, Wake Lock / fullscreen / orientation lock are skipped.

## Test

```sh
pnpm check         # typecheck, lint, format:check, test, build, check:bundle, check:routes
pnpm test          # Vitest in every package
pnpm e2e           # Playwright (Chromium)
pnpm format        # Prettier --write
```

`check:bundle` fails if anything reachable from `play.html` contains Phaser; `check:routes` serves
the build with `vite preview` on :4173 and checks `/`, `/play`, the icons and the brand `<head>`.
