# Thieves' Forum brand kit

Brand kit for **Thieves' Forum** (`apps/thieves-forum`), a Roman-market party game in the phone-controller collection. The layout matches Sunny Side's and Fort Frenzy's kits so it drops into the monorepo the same way:

```
src/styles/brand.css     every visual token as a CSS custom property (source of truth)
src/shared/theme.ts      typed mirror for the renderer (add a parity test like Sunny Side's)
tokens.json              the same tokens as data
brand/                   SVG marks, lockups and the <head> snippet
public/                  favicon.ico/.svg, PWA icons, apple-touch-icon, manifest
brand-sheet.html         visual reference for every token and component (open in a browser)
previews/                PNG renders of the mark and lockup
```

## Direction: "Gilded denarius"

Stamped Roman coins and carved inscriptions. Gold means money: the amber family color (`#e8a33d`) becomes the gold of the denarii.

## Family core (unchanged)

Ink `#14161a`, paper `#ffffff`, amber `#e8a33d`, gray `#6b7280`, plus the shared dark surface (`#1a1d23`, `#22262e`), border (`#2e333c`) and muted (`#9aa1ad`) values, identical to fostercurtis.dev, Sunny Side, Fort Frenzy and Say Cheese!. Body text is Geist; room codes and numbers are JetBrains Mono.

## Mark

An amber Roman coin struck with black lines: an ink rim, a beaded inner ring, and a laureate draped bust facing right (rounded skull, olive-leaf wreath drawn as a straight band from brow to the back of the head, no ribbon tails, cloak pinned with a brooch, curved truncation). A white glint sits on the lower left between the beaded ring and the rim. It deliberately breaks the family's "white object, one amber point" grammar; the ink tile keeps the family link.

| File | Use |
|---|---|
| `brand/mark.svg` | Detailed: adds the "THIEVES · FORVM" legend between the beads and the rim. 128 px and up (title screen, catalog card). |
| `brand/mark-simple.svg` | 32–64 px. No legend, bolder beads. |
| `brand/mark-small.svg` | 16 px. Heavy rim, bust silhouette, one wreath line. |
| `brand/mark-tile.svg`, `mark-tile-small.svg` | Coin on the ink rounded tile: favicon and app/PWA icons. |
| `brand/mark-maskable.svg` | Maskable PWA icon (coin inside the safe zone). |
| `brand/wordmark.svg` / `wordmark-ink.svg` | Coin + "THIEVES' FORUM" lockup for dark / light backgrounds. |
| `brand/wordmark-text.svg` | Wordmark text alone. |

**Usage:** ink tile for the favicon and app icons; the bare coin for the title screen and the lockup. All text in the marks is converted to outlines, so no font is needed to render them.

## Type

- **Display: Cinzel 900**, uppercase, slight tracking (titles, banners, phone names, button labels).
- **Body: Geist** 400/600. Names on the TV use Geist 600 for readability.
- **Numbers and codes: JetBrains Mono** 600.

All three are OFL. `brand/head.html` loads them from Google Fonts.

## Signature treatment: the stamped coin edge

A dashed inner ring (`outline: 1.5px dashed #14161a; outline-offset: -5px`, class `.coin-edge`) on amber elements. **Used only on the primary action (Start, Grab) and on money** (coin pills, round-haul strips, totals), so it always means "the gold thing". No tilt (Sunny Side's move) and no chamfer or glow (Fort Frenzy's).

## Color rules

- **Gold/amber = money and the primary action.** On items, bright gold appears only on gold items and on rare-item accents, so thieves can read value from across the room.
- **Red (`#e05252`) = danger only:** caught, the guard's crest/shield, the alert "!", the view cone when the guard spots someone.
- **Bronze `#a8703a`** for secondary buttons, timers and uncommon rarity. **Travertine `#e9dfc9`** for light text and stone.
- **Outfit fabrics** (`--fabric-*`): linen, umber, terracotta, madder, olive, sage, woad, mulberry. Muted, shared by players and NPCs.
- **Stall canopies** (`--canopy-*`): pawnbroker charcoal, bakery linen, pottery terracotta, clothing woad, wine madder, smithy umber, perfume sage, spices bronze, rugs olive, jewelry mulberry.
- **Player colors** (`--player-*`, the shared family palette): **never on characters during a round**, because players are disguised. They appear only on the phone's top banner and, on the TV, in the end-of-round reveal (ring under the feet + name tag).

## Components (see `brand-sheet.html`)

- **Primary button:** amber fill, ink Cinzel label, coin edge. **Secondary:** bronze outline, travertine label. **Catch!** uses a danger-red outline.
- **Coin pill:** ink or surface-strong background, dashed amber border, mini coin + mono amount.
- **Round timer:** bronze ring with mono digits. **CAUGHT!** badge in danger red; **Stocks 15s** in gray.
- **Rarity tags / item tiles:** common = gray outline, uncommon = bronze outline, rare = amber fill (tiles: amber border on a warm dark tile).
- **Phone banner:** the player's color, connection dot, Cinzel name, coin pill. Below it, an outfit card ("This is you") at round start.
- **Grab button:** about 60 px, amber with the coin edge, label "GRAB"; while held, a progress bar above it shows the item name and time left.
- **Hands up! screen:** Cinzel "HANDS UP!" in amber, Bag and Items tiles, and an amber coin-edge tile with this round's haul (no match total).
- **TV title screen:** dark forum columns and pediment, detailed coin, "THIEVES' FORUM" in Cinzel, tagline (placeholder), room code card, QR.

## Licensing

The marks and all SVGs are original work for this project. Fonts are OFL (Cinzel, Geist, JetBrains Mono).

## Open items

- Subdomain (likely `thieves-forum.fostercurtis.dev`) and the final tagline.

## Installed in the repo (setup, 2026-11-24)

Mapped onto the layout the other games use (`check:routes` and `@pcg/catalog` expect these names):

- `brand/mark-tile.svg` → `brand/mark-square.svg`; `public/apple-touch-icon.png` → `public/apple-icon.png`; `public/manifest.webmanifest` → `public/site.webmanifest` (absolute icon paths, `start_url` `/`).
- `public/favicon.svg` is not installed: the family head links no SVG favicon (the `.ico`'s pixel-snapped frames win).
- `brand/head.html` rewritten to the family convention: absolute paths, no SVG icon, `brand.css` imported from TS instead of linked.
- `brand-sheet.html` → `brand/preview.html` (relative paths fixed); `tokens.json`, `previews/` and this README live in `brand/`.
- `src/shared/theme.ts` is the repo's own mirror (hex + number per color, plus type, spacing and radii), checked by `src/shared/__tests__/theme.test.ts`.
