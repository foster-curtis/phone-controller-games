# @pcg/catalog

The game catalog: one typed, validated source for the facts that describe and launch each game. The
gallery (`games.fostercurtis.dev`, coming next), each game's own lobby, and later surfaces
(single-domain launch, link-preview tags) all read from it. Decision: `PLATFORM.md` §4, decision #9.

## Where things live

| What                      | Where                                                            |
| ------------------------- | ---------------------------------------------------------------- |
| A game's entry            | `apps/<game>/game.meta.ts` (owned by the game)                   |
| A game's card art         | `apps/<game>/catalog/card.jpg` (1200×630)                        |
| A game's link-share image | `apps/<game>/catalog/share.webp` (1200×630, smaller file)        |
| Schema and limits         | `src/types.ts`                                                   |
| Ordered list (gallery)    | `src/games.ts` (`GAMES`)                                         |
| Validation (browser-safe) | `src/validate.ts` (`validateGames`)                              |
| File checks (Node only)   | `src/node.ts` (`@pcg/catalog/node`: `checkCatalog`, `imageFile`) |
| Build check               | `src/vite.ts` (`@pcg/catalog/vite`: `catalogCheck()`)            |
| Launch URLs               | `src/url.ts` (`gameUrl`, `ROUTING`)                              |

## Fields

| Field              | Rule                                                                                        |
| ------------------ | ------------------------------------------------------------------------------------------- |
| `id`               | Lowercase kebab-case, stable. Equals the app folder name and the subdomain.                 |
| `title`            | Player-facing name. Must match `<title>` in `index.html` and `play.html`, and the manifest. |
| `shortDescription` | 1–2 sentences for the card, at most 160 characters.                                         |
| `longDescription`  | One or two paragraphs behind "read more", at most 1200 characters. Plain text (see below).  |
| `image`            | Card art path relative to the game's folder (svg/png/jpg/webp). Must exist.                 |
| `shareImage`       | Link-preview image path relative to the game's folder (png/jpg/webp, no SVG). Must exist.   |
| `minPlayers`       | Whole number, at least 1.                                                                   |
| `maxPlayers`       | Whole number, at least `minPlayers`. Counts people, not phones (no spectators or headroom). |
| `status`           | `live` (listed), `beta` (listed, marked unfinished) or `hidden` (not listed).               |

`longDescription` is plain text with paragraphs separated by a blank line. To render it, split on
`/\n\s*\n/` and put each part in its own `<p>`. There is no markdown.

Don't put player counts in the descriptions: the card shows `minPlayers`–`maxPlayers`, and copy
that repeats them would drift.

## How a game uses its entry

`game.meta.ts` exports `title`, `minPlayers` and `maxPlayers` as named constants and the full entry
as the default export (`satisfies GameMeta`, with a type-only import, so nothing from this package
ships at runtime). Game code imports the named constants. The bundler then drops the default object,
so the descriptions never reach the phone's bundle. Values derived from them (Fort Frenzy's and Say
Cheese's relay room size, which adds headroom for rejoins or spectators) are computed from the meta
values in the game.

## Validation

`checkCatalog()` (Node) fails on:

- a missing or empty required field, or a wrong type
- `minPlayers < 1` or `minPlayers > maxPlayers`
- a duplicate `id`
- a `shortDescription` over 160 characters (or a `longDescription` over 1200)
- an `image` or `shareImage` that doesn't exist, is outside the game's folder, or has the wrong
  type (`image`: svg/png/jpg/webp; `shareImage`: png/jpg/webp)
- an `id` with no `apps/<id>/game.meta.ts`
- a page `<title>` or `public/site.webmanifest` name that differs from `title`

Every game's `vite.config.ts` adds `catalogCheck()`, which runs it at build start: an error in
`vite build` (so `build:<game>`, `check:<game>`, CI and Vercel all fail), a warning in dev. The
package's own tests (`pnpm --filter @pcg/catalog test`) run it too, plus unit tests of each rule.
Each game's typecheck checks its entry's shape through `satisfies GameMeta`.

## Launch URLs

```ts
import { gameUrl } from '@pcg/catalog';
gameUrl('sunny-side'); // https://sunny-side.fostercurtis.dev/
```

Never hardcode a game's URL. `ROUTING` in `src/url.ts` decides the shape:

- `{ kind: 'subdomain', domain: 'fostercurtis.dev' }` (today): `https://<id>.<domain>/`
- `{ kind: 'path', origin: 'https://new.domain', prefix: '/play' }`: `https://new.domain/play/<id>/`

Moving to single-domain paths means changing `ROUTING`. The games would also need a Vite `base` of
`<prefix>/<id>/`, and their phone page (today `/play`) would then sit at `<prefix>/<id>/play`.

## Card and share art

Art lives beside each game in `apps/<game>/catalog/`, not in the brand kit's read-only `public/` or
`brand/`. Each game has two 1200×630 images (the 1.91:1 link-preview size, which also suits a card):

- `card.jpg` (`image`): the gallery card and key art.
- `share.webp` (`shareImage`): the same picture as a smaller file, for link previews
  (`og:image`). It can't be SVG, because preview crawlers don't render it.

A Vite build anywhere can import them. The gallery can use
`import.meta.glob('../*/catalog/card.*', { query: '?url', import: 'default' })` keyed by folder (=
`id`), a game can import its own, and Node builds can use `imageFile(game)` or
`imageFile(game, root, 'shareImage')`. Link-preview tags need an absolute URL, so whatever emits
them must publish `share.webp` at a stable path. That's for the link-preview work later.

## Adding a game

1. Create `apps/<game>/game.meta.ts` (copy an existing one), plus `card.jpg` and `share.webp` in
   `apps/<game>/catalog/`.
2. Add it to `GAMES` in `src/games.ts`, in gallery order.
3. In the game: `"@pcg/catalog": "workspace:*"` in devDependencies, `catalogCheck()` in
   `vite.config.ts`, `"game.meta.ts"` in `tsconfig.json` `include`, and title and player limits
   imported from `game.meta.ts`.

## The `apps/` import exception

`packages/**` must not import from `apps/**`, except `src/games.ts`, which imports each
`apps/<game>/game.meta.ts` and nothing else (`eslint.config.js` enforces both). This package does
not list the games as dependencies (they depend on it, for the type and the Vite check), so the
affected gate doesn't rerun this package's tests when only a meta file changes. That game's build
still runs `catalogCheck()` over the whole catalog. When the gallery app exists, its Vercel ignore
step needs to count `apps/*/game.meta.ts` and `apps/*/catalog/**` as gallery changes.
