# Forum art

Vector source art for Thieves' Forum's one theme, `forum` (SPEC §6.21), installed from the art delivery of 2026-11-24 as-is: no file was redrawn, re-exported, renamed or optimized. The delivery's own notes (style rules, character viewBox and tint variables, stall draw order, effect behavior) are in [`ART_NOTES.md`](ART_NOTES.md), kept verbatim; read them before turning this into rigs. All art is original work for this project (license: owned).

Nothing here is wired into the game yet. The build plan decides the production formats (Fort Frenzy's `art/neon-knights/` is the model: `rigs/<id>.json`, `sprites.json`, an atlas script) and how art gets loaded. The files are plain SVG (about 0.5 MB in all), stored in plain git like Fort Frenzy's; the repo doesn't use LFS.

## Layout

The delivery was already organized by kind; its folders are kept so `items/items.json` paths and the notes stay valid.

| Path | What's in it |
|---|---|
| `characters/<rig>/<view or pose>.svg` | `citizen` (players and NPCs), `merchant`, `guard`. `viewBox 0 0 40 60`, feet at `20,55`; tintable parts use `--tunic`, `--mantle`, `--hair`, `--skin`, `--wrap`; groups carry part ids (`legs`, `arm`, `tunic`, `mantle`, `head`, …) as a starting point for rig parts. |
| `stalls/` | Stall layers (`viewBox 0 0 104 96`) in draw order back → counter → shade → frame, plus composed `reference-*.svg`. |
| `map/` | Floor tile, top-row gate (closed/open), stocks, and `*-reference.svg` compositions. |
| `items/<shop>/<item-id>.svg` + `items/items.json` | The 34 starter items (`viewBox 0 0 32 32`; grand carpet `0 0 36 32`) and their data. |
| `effects/` | Coin toss, glance, guard, catch, reveal and podium effects. |
| `ui/` | Podium, merchant face (phone dialog), forum backdrop (title and podium screens). |
| `index.html` | The delivery's static preview sheet. Not part of any build. |

Names are kebab-case and match `items.json` ids. Files whose name contains `reference` are composed references (like Fort Frenzy's `review/`), not frames.

## Inventory

Status: **approved** = approved concept source, signed off in design (SPEC §6.21 "Approved"); **approved (reference)** = an approved composition to build from, not a frame; **production** = in the game's runtime format (none yet).

| File | What it is | SPEC | Status |
|---|---|---|---|
| `ART_NOTES.md` | The art delivery's own README (style rules, rig notes, draw order, effect behavior), kept verbatim | §6.21 | approved |
| `index.html` | Preview sheet of every piece (static HTML from the delivery; not used by the game) | §6.21 | approved |
| `characters/citizen/back.svg` | Citizen back view | §6.11, §6.21 | approved |
| `characters/citizen/front.svg` | Citizen (players + NPCs), front view: idle/walk base | §6.11, §6.21 | approved |
| `characters/citizen/hands-up-front.svg` | Citizen "Hands up!" pose, front | §6.14, §6.21 | approved |
| `characters/citizen/point-back.svg` | Citizen point-and-shout, back | §6.8, §6.21 | approved |
| `characters/citizen/point-front.svg` | Citizen point-and-shout, front (NPC catches a pickpocket) | §6.8, §6.21 | approved |
| `characters/citizen/point-side.svg` | Citizen point-and-shout, side | §6.8, §6.21 | approved |
| `characters/citizen/run-side.svg` | Citizen run (end-of-round guard rush), side, with speed lines | §6.14, §6.21 | approved |
| `characters/citizen/side.svg` | Citizen side view; the near arm pivots at 20,30.5 for the coin throw | §6.9, §6.11, §6.21 | approved |
| `characters/guard/back.svg` | Legionary guard, back (scutum back-most) | §6.12, §6.21 | approved |
| `characters/guard/front.svg` | Legionary guard, front | §6.12, §6.21 | approved |
| `characters/guard/side.svg` | Legionary guard, side (walk and jog use this view) | §6.12, §6.21 | approved |
| `characters/merchant/back.svg` | Merchant back (cap knot and tails) | §6.6, §6.21 | approved |
| `characters/merchant/front.svg` | Merchant (apron, beard, wrapped cap), front | §6.6, §6.21 | approved |
| `characters/merchant/point-front.svg` | Merchant point-and-shout (calls the guard), front | §6.6, §6.21 | approved |
| `characters/merchant/point-side.svg` | Merchant point-and-shout, side | §6.6, §6.21 | approved |
| `characters/merchant/side.svg` | Merchant side | §6.6, §6.21 | approved |
| `stalls/reference-closed.svg` | Reference: closed stall composed | §6.3 | approved (reference) |
| `stalls/reference-open-merchant-at-counter.svg` | Reference: open stall, merchant at the counter ("stall concept v3") | §6.6 | approved (reference) |
| `stalls/reference-open-merchant-at-shelf.svg` | Reference: open stall, merchant at the back shelf | §6.6, §6.7 | approved (reference) |
| `stalls/stall-back.svg` | Stall layer 1: floor strip + back-shelf cabinet | §6.6 | approved |
| `stalls/stall-closed-shade.svg` | Closed-stall shade (42%) | §6.3 | approved |
| `stalls/stall-counter.svg` | Stall layer: front counter (hides the merchant below the waist) | §6.6 | approved |
| `stalls/stall-frame.svg` | Stall top layer: ground shadow, posts, canopy (`--canopy`) | §6.3, §6.6 | approved |
| `map/floor-tile.svg` | Travertine paving tile | §6.3 | approved |
| `map/gate-closed.svg` | Top-row aisle gate, closed (during play) | §6.3, §6.12 | approved |
| `map/gate-open.svg` | Top-row aisle gate, open (reinforcements, guard rush) | §6.3, §6.12, §6.14 | approved |
| `map/market-layout-reference.svg` | Reference: the full TV market layout (16:9), "full market layout v1" | §6.3 | approved (reference) |
| `map/stocks-occupied-reference.svg` | Reference: a thief standing in the stocks | §6.13 | approved (reference) |
| `map/stocks.svg` | The stocks, lower-left corner | §6.13 | approved |
| `items/items.json` | Item data: name, shop, value, weight, grab ms, rarity, placement, file. Matches the §6.5 table exactly (all 34 checked) | §6.5 | approved |
| `items/bakery/cheese-wheel.svg` | Item icon: Cheese wheel (bakery, 6 d, weight 3, common, counter) | §6.5 | approved |
| `items/bakery/honey-cake.svg` | Item icon: Honey cake (bakery, 20 d, weight 1, uncommon, back-shelf) | §6.5 | approved |
| `items/bakery/honey-jar.svg` | Item icon: Honey jar (bakery, 8 d, weight 2, common, counter) | §6.5 | approved |
| `items/bakery/loaf-of-bread.svg` | Item icon: Loaf of bread (bakery, 2 d, weight 1, common, counter) | §6.5 | approved |
| `items/clothing/fine-toga.svg` | Item icon: Fine toga (clothing, 50 d, weight 4, uncommon, back-shelf) | §6.5 | approved |
| `items/clothing/sandals.svg` | Item icon: Sandals (clothing, 8 d, weight 1, common, counter) | §6.5 | approved |
| `items/clothing/tunic.svg` | Item icon: Tunic (clothing, 12 d, weight 2, common, counter) | §6.5 | approved |
| `items/clothing/wool-cloak.svg` | Item icon: Wool cloak (clothing, 30 d, weight 3, uncommon, back-shelf) | §6.5 | approved |
| `items/jewelry/bronze-ring.svg` | Item icon: Bronze ring (jewelry, 20 d, weight 1, uncommon, back-shelf) | §6.5 | approved |
| `items/jewelry/gem-ring.svg` | Item icon: Gem ring (jewelry, 600 d, weight 1, rare, back-shelf) | §6.5 | approved |
| `items/jewelry/glass-bead-necklace.svg` | Item icon: Glass-bead necklace (jewelry, 6 d, weight 1, common, counter) | §6.5 | approved |
| `items/jewelry/gold-necklace.svg` | Item icon: Gold necklace (jewelry, 280 d, weight 1, rare, back-shelf) | §6.5 | approved |
| `items/jewelry/silver-bracelet.svg` | Item icon: Silver bracelet (jewelry, 100 d, weight 1, rare, back-shelf) | §6.5 | approved |
| `items/perfume/olive-oil-flask.svg` | Item icon: Olive oil flask (perfume, 10 d, weight 2, common, counter) | §6.5 | approved |
| `items/perfume/perfume-vial.svg` | Item icon: Perfume vial (perfume, 70 d, weight 1, uncommon, back-shelf) | §6.5 | approved |
| `items/perfume/scented-oil.svg` | Item icon: Scented oil (perfume, 25 d, weight 1, uncommon, back-shelf) | §6.5 | approved |
| `items/pottery/amphora.svg` | Item icon: Amphora (pottery, 15 d, weight 6, common, counter) | §6.5 | approved |
| `items/pottery/clay-cup.svg` | Item icon: Clay cup (pottery, 3 d, weight 1, common, counter) | §6.5 | approved |
| `items/pottery/oil-lamp.svg` | Item icon: Oil lamp (pottery, 6 d, weight 1, common, counter) | §6.5 | approved |
| `items/pottery/painted-vase.svg` | Item icon: Painted vase (pottery, 35 d, weight 3, uncommon, back-shelf) | §6.5 | approved |
| `items/rugs/grand-carpet.svg` | Item icon: Grand carpet (rugs, 150 d, weight 12, rare, back-shelf) | §6.5 | approved |
| `items/rugs/reed-mat.svg` | Item icon: Reed mat (rugs, 15 d, weight 4, common, counter) | §6.5 | approved |
| `items/rugs/wool-rug.svg` | Item icon: Wool rug (rugs, 75 d, weight 8, uncommon, back-shelf) | §6.5 | approved |
| `items/smithy/bronze-helmet.svg` | Item icon: Bronze helmet (smithy, 65 d, weight 5, uncommon, back-shelf) | §6.5 | approved |
| `items/smithy/gladius.svg` | Item icon: Gladius (smithy, 50 d, weight 4, uncommon, back-shelf) | §6.5 | approved |
| `items/smithy/hammer.svg` | Item icon: Hammer (smithy, 15 d, weight 3, common, counter) | §6.5 | approved |
| `items/smithy/knife.svg` | Item icon: Knife (smithy, 10 d, weight 1, common, counter) | §6.5 | approved |
| `items/spices/cinnamon-bundle.svg` | Item icon: Cinnamon bundle (spices, 40 d, weight 1, uncommon, back-shelf) | §6.5 | approved |
| `items/spices/pepper-pouch.svg` | Item icon: Pepper pouch (spices, 25 d, weight 1, uncommon, back-shelf) | §6.5 | approved |
| `items/spices/sack-of-salt.svg` | Item icon: Sack of salt (spices, 5 d, weight 3, common, counter) | §6.5 | approved |
| `items/spices/saffron-pouch.svg` | Item icon: Saffron pouch (spices, 90 d, weight 1, uncommon, back-shelf) | §6.5 | approved |
| `items/wine/fine-vintage.svg` | Item icon: Fine vintage (wine, 55 d, weight 4, uncommon, back-shelf) | §6.5 | approved |
| `items/wine/jug-of-cheap-wine.svg` | Item icon: Jug of cheap wine (wine, 10 d, weight 3, common, counter) | §6.5 | approved |
| `items/wine/wine-amphora.svg` | Item icon: Wine amphora (wine, 25 d, weight 6, uncommon, back-shelf) | §6.5 | approved |
| `effects/alert-bang.svg` | Red "!" over a guard who spots someone | §6.12 | approved |
| `effects/caught-burst.svg` | Red "!" starburst over a caught thief | §6.13 | approved |
| `effects/coin-flat.svg` | Coin lying flat after landing | §6.9 | approved |
| `effects/coin.svg` | Coin (toss arc, pot coin shower) | §6.9, §6.13 | approved |
| `effects/confetti-pieces.svg` | Round-end confetti | §6.14 | approved |
| `effects/crown-laurel.svg` | Gold laurel crown over the top earner | §6.14, §6.15 | approved |
| `effects/firework-gold.svg` | Podium firework, amber | §6.15 | approved |
| `effects/firework-white.svg` | Podium firework, white | §6.15 | approved |
| `effects/glance-swoosh.svg` | White swoosh lines: glance wind-up | §6.6 | approved |
| `effects/glint.svg` | Four-point glint on the landed coin | §6.9 | approved |
| `effects/player-ring.svg` | Reveal ring under each player (tinted `--player`) | §6.14 | approved |
| `effects/question-bubble.svg` | Merchant "?" when a coin lands nearby | §6.9 | approved |
| `effects/speed-lines.svg` | Speed lines (fleeing players, charging guards) | §6.12, §6.14 | approved |
| `effects/thief-bubble.svg` | Shaking "THIEF!" shout bubble | §6.8, §6.12 | approved |
| `effects/view-cone-alert.svg` | Guard view cone, red (spotted) | §6.12 | approved |
| `effects/view-cone.svg` | Guard view cone (idle, 35% opacity) | §6.12 | approved |
| `ui/forum-backdrop.svg` | Dark forum columns and pediment (title and podium screens) | §6.15, §6.16 | approved |
| `ui/merchant-face.svg` | Merchant face for the phone dialog ("What'll it be?") | §6.17 | approved |
| `ui/podium.svg` | Podium blocks II, I, III | §6.15 | approved |

## Gaps against SPEC §6.21

**Present**

- Projection and proportions (in the notes and every drawing), stall concept v3 (layers + references, merchant at counter and at shelf), closed-stall look, full market layout v1 (reference), all 34 item icons (rugs as rolled cylinders, grand carpet 36 × 32), effects v2 (coin toss, glance wind-up, guard spot, point-and-shout, catch starburst), brand mark (in `brand/`).
- Characters in front, side and back views for all three rigs (citizen, merchant, legionary guard), as tintable cut-out parts with every part in all three views.
- Poses: idle (the three base views), point-and-shout (citizen front/side/back, merchant front/side), hands-up (citizen front), run (citizen side).
- UI art: podium, forum backdrop, merchant face.

**Missing (needed before or during the build)**

- **Rigs and runtime formats:** no `rigs/*.json`, `sprites.json`, attach points or atlas. Expected: the delivery leaves them to the art step (ART_NOTES "Not included").
- **Citizen poses:** walk cycle (to be animated on the rig from the base views), browse, reach/grab (shared with browse, so it isn't a tell), pickpocket reach, throw (only the side-view arm pivot is specified; no frames), stocks pose (only `map/stocks-occupied-reference.svg`).
- **Merchant animations:** glance in three stages (only the `glance-swoosh` effect exists; no head-turn frames), fetch, carry item forward; no merchant point-and-shout back view.
- **Guard animations:** patrol walk, jog, catch and march (only the three idle views; ART_NOTES says walk and jog use the side view).
- **Hands-up** has a front view only; **run** a side view only (fine if the reveal and rush only use those views; confirm when rigging).
- **Screens:** no composed title screen (only `ui/forum-backdrop.svg`; the TV title is built in code from the brand kit), no reveal card art (ART_NOTES: built in code), podium blocks present but no composed podium screen.
- Spec §10 item 5 lists the same open art: final rigs in all poses, title screen, podium, reveal cards.

**Contradictions or things to check**

- `stalls/stall-closed-shade.svg` darkens by **42%**; SPEC §6.3 says "~40%". Within the "~", and the brand kit's `--closed-stall-shade` is also 0.42, so no change made.
- The market layout reference was not reviewed visually during setup (no rendering of delivered files); check it against SPEC §6.3 (alleys between middle-row stalls 2–3 and 3–4, end passages, gated aisle beside the top-center stall, stocks lower-left) when the map is built.
- No other contradictions found: `items.json` matches the §6.5 table (value, weight, grab ms, rarity) for all 34 items, and its placements follow the §6.5 placement rule.
