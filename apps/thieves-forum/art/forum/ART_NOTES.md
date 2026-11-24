# Thieves' Forum art

Approved concept art for **Thieves' Forum**, exported as clean, layered SVGs. Every piece here was signed off in design; the art agent's job is to turn them into the repo's production formats (cut-out rigs, `sprites.json`, atlas), not to redesign them. Open `index.html` in a browser to see everything at once.

```
characters/   citizen, merchant and guard in front, side and back views, plus pose variants
items/        34 item icons by shop + items.json (values, weights, grab times, rarity, placement)
stalls/       stall layers (back, counter, frame, closed shade) + composed references
map/          floor tile, top-row gate (closed/open), stocks, full market layout reference
effects/      coin, coin landed flat, glint, alerts, bubbles, crown, cone, rings, confetti, fireworks
ui/           podium, merchant face (phone dialog), forum backdrop (title/podium screens)
```

## Global style rules

- **Projection:** Fort Frenzy's oblique three-quarter top-down view: top faces drawn above front faces, ground at 0.6. Further back = higher on screen.
- **Line and fill:** ink outline (`#14161a`) on every part, flat fills, at most one highlight. No gradients.
- **Color:** gold `#e8a33d` = money and high value only. Red `#e05252` = danger only (guard crest and shield, alerts, caught). Everything else uses the muted palette in the brand kit (`tokens.json`).
- **Proportions:** heads about a third of body height; characters about 1/10 of screen height on the TV.
- **Full-size parts:** every part is complete in every view so animation never reveals a cut edge.
- **Consistency rule:** every part appears, in the same color, in all three views (front, side, back).

## Characters (`viewBox 0 0 40 60`, feet anchor at `20,55`)

Tintable parts use CSS variables with a default fallback, so one drawing serves the whole outfit pool:

| Variable | Part | Default |
|---|---|---|
| `--tunic` | tunic | `#5b7186` |
| `--mantle` | shoulder mantle (citizens) | `#d9cfb8` |
| `--hair` | hair and beard | `#3b2a20` |
| `--skin` | skin | `#c8946c` |
| `--wrap` | merchant head wrap | `#a85f45` |

Players and NPCs draw tunic and mantle from the eight outfit fabrics (`--fabric-*`); **never player colors**. Everyone gets a fresh random outfit every round. Note: some renderers (librsvg, some design tools) ignore CSS variables and show the defaults; browsers and the game apply them.

Groups carry ids (`legs`, `arm-left`, `arm-right`, `arm`, `arm-point`, `tunic`, `mantle`, `head`, `face`, `hair`, `beard`, `apron`, `wrap`, `cuirass`, `shoulder-plates`, `belt`, `gladius`, `scutum`, `helmet`, `crest` …) as a starting point for rig parts.

**Citizen** (players and NPCs share it): tunic with belt, **short shoulder mantle with the same hem height in every view**, hair.
- `front`, `side`, `back`: idle/walk. The side view's near arm (`#arm`) pivots at the shoulder, `20,30.5`; rotate it for the coin **throw** (short wind-back, then a forward swing; the coin leaves the hand at the top of the swing).
- `point-front/side/back`: point and shout (arm straight out, finger, mouth open, brows down). Mirror for the other direction. Used when an NPC catches a pickpocket.
- `hands-up-front`: the end-of-round "Hands up!" pose.
- `run-side`: fleeing during the end-of-round guard rush (speed lines included as their own group).

**Merchant:** same base body plus a **waist apron in one bleached-linen color `#efe6d2`** (front panel, side edge, back ties and bow), a **full textured beard with mustache**, and a **wrapped cap with a round knot and two short tails at the back**, worn over the citizens' hair shape. `point-front`/`point-side` are for calling the guard.

**Guard (legionary):** bronze galea with a red crest, brow ridge, hinged cheek guards and a flared neck guard; segmented cuirass with shoulder plates and a studded belt; deep-red tunic skirt; **red scutum on his left arm** (front: viewer's right; side: held forward; back: viewer's left, strap side, and the **back-most layer**); **sheathed gladius on his right hip** in every view. Guards walk and jog using the side view.

## Stalls (`viewBox 0 0 104 96`)

Draw in this order: `stall-back.svg` (stall floor strip + back-shelf cabinet) → back-shelf items → merchant → `stall-counter.svg` → counter items → (`stall-closed-shade.svg` if closed) → `stall-frame.svg` (ground shadow, posts, canopy via `--canopy`).

- **Merchant position:** at the counter, place him at `y = 40.8` (24×36 box) so the counter hides him below the waist. As he walks back to the shelf he rises on screen, to `y = 34.4` at the shelf; a little more of his tunic shows, but the counter always hides his feet.
- **Item slots:** counter items sit on the counter top (centers around `y ≈ 66`); shelf items sit on the two shelf tops (`y ≈ 36` and `y ≈ 48`).
- **Placement:** common items on the counter, uncommon and rare on the back shelf, with a stall-by-stall fallback so neither is ever empty (see `items/items.json`). Merchants sometimes carry a back-shelf item to the counter to show a customer and may leave it there.
- **Closed stalls** (fewer players) keep the full canopy, shelf and counter, show no items and no merchant, and add the 42% shade. Never boarded up.
- **Canopy colors:** pawnbroker `#3a404b`, bakery `#d9cfb8`, pottery `#a85f45`, clothing `#5b7186`, wine `#9c5a63`, smithy `#7a5a43`, perfume `#8a9a7e`, spices `#a8703a`, rugs `#7d7f4f`, jewelry `#6e5a72`.

## Map

`map/market-layout-reference.svg` shows the approved TV layout (16:9): a top row of five stalls flush to the top edge with **one aisle beside the center stall** (a **closed gate** during play; it opens only for reinforcement guards and the end-of-round guard rush), the upper lane, a middle row of five stalls with one-person alleys between stalls 2–3 and 3–4 and open passages at both ends, the lower lane, and the stocks in the lower-left corner. `floor-tile.svg` tiles the travertine paving.

## Items (`viewBox 0 0 32 32`; grand carpet `0 0 36 32`)

34 icons, one silhouette each so they read at about 16 px on the TV counter and larger on the phone. Gold appears only on gold items and on rare-item accents. The bronze helmet item has no red crest. `items.json` lists name, shop, value, weight, grab time (`500 + 100 × weight + 2 × value`, rounded to 50 ms), rarity and default placement. Values are starting points for playtesting.

## Effects

| File | Behavior |
|---|---|
| `coin.svg`, `coin-flat.svg` | Coin toss: smooth arc (ease-out rising, ease-in falling, one small bounce), **flipping end over end vertically**; after the final landing it **lies flat** (`coin-flat`). |
| `glint.svg` | After the coin lands: a four-point concave sparkle spins while growing, then shrinks and fades; **under 1 second total**. Then the merchant's `question-bubble` appears. |
| `glance-swoosh.svg` | Merchant/NPC glance wind-up: shown during the half-turn, the fair warning to let go. |
| `view-cone.svg` → `view-cone-alert.svg` | Guard view cone (35% opacity); turns red when he spots someone. Stretch to length in code; stalls block it. |
| `alert-bang.svg` | Red "!" over a guard who spots someone. |
| `thief-bubble.svg` | NPC shout; the NPC itself switches to the point pose aimed at the thief (no arrow). |
| `caught-burst.svg` | Red "!" burst over a caught thief; the 25% pot flies to the catcher as `coin`s. |
| `crown-laurel.svg` | End of round: hovers just above the top earner's head, bobbing and spinning (`scaleX` flip). |
| `player-ring.svg` | End-of-round ring under each player, tinted with `--player`. |
| `confetti-pieces.svg`, `firework-*.svg` | Round-end confetti; podium fireworks. |
| `speed-lines.svg` | Fleeing players and charging guards. |

**No grab effect on the TV.** A successful steal only removes the item from the counter, so stealing never exposes a thief. Grab feedback is phone-only (hold bar, item into the bag, "+value" toast). Tip-off payouts are phone-only too.

## UI art

`podium.svg` (Roman numerals II, I, III on travertine blocks), `merchant-face.svg` (the phone's "What'll it be?" dialog), `forum-backdrop.svg` (title and podium screens). Everything else in the UI (buttons, pills, cards, name tags) is built in code from the brand kit.

## Not included

- Rigs (`rigs/*.json`), `sprites.json`, attach points and the atlas: the art agent builds these from these SVGs, following Fort Frenzy's formats.
- Pairs/team mode art (partner card, night phase): deferred to v2.
- More items toward the ~100-item list, and any v2 ideas (crate-knocking distraction, outfit-change stall).
