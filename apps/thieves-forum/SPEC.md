# Thieves' Forum — SPEC

> Living spec. Only **decided** items go in the body. Open questions live in §10 until we settle them.
> Repo-wide rules (architecture, phone requirements, hosting, layout): [`PLATFORM.md`](../../PLATFORM.md). Relay protocol: [`apps/relay/SPEC.md`](../relay/SPEC.md).
> Working title was "Marketplace thief". Design history: project doc `claude/marketplace-thief.md` (retired once this spec lands; this file is now the source of truth).
> Last updated: 2026-11-24 (rev 2: ambient market audio, fixed-volume bed; rev 1: 20 d purse, weighted money ranges, mid-round walk-on joins, NPC churn; pending Foster's review)

**Status:** v1 game design is complete. Technical design (engine details, protocol shapes, file layout) is left to the implementer, who records decisions in a §12 Technical design section, as Fort Frenzy did in its §15. Every number in this spec is a **starting value** for playtesting; all of them live in the balance sheet (§7).

---

## 1. Overview

Same-room social-stealth party game for **2–8 players**, set in an ancient Roman forum market. Everyone is an ordinary shopper in a busy crowd of NPCs. Players buy, sell, pickpocket and steal from stalls to end the match with the most denarii, while watching the TV for the tell-tale moves of the other thieves and catching them in the act.

The core tension: **every action that earns money also risks revealing which character is you.** Players and NPCs wear the same outfits and move the same way, so the disguise holds until you do something only a player would do: bolt from a guard, grab someone, stand frozen at a counter while the merchant's back is turned.

Fourth game in the series (`PLATFORM.md` §1). Reuses Fort Frenzy's fixed single-screen camera, three-quarter projection and rig approach.

## 2. Architecture (settled)

`PLATFORM.md` §2, plus these game-specific notes:

- **Host-authoritative, input-state phones.** Phones send joystick + button bits at the usual rate. Discrete UI choices (merchant dialog picks, Buy, Sell, tip-off target) are discrete events, like Fort Frenzy's shop.
- **Private views use the platform's viewer rule** (project backlog, decided 2026-11-21: "the host is the only simulation; clients may render host-granted views"). Thieves' Forum needs two, both cheap:
  - **Stall view:** the host sends the stall's current counter and back-shelf contents (items, prices, which are grabbable) to the browsing player when they open it and whenever that stall's contents change. This is state, not a rendered view.
  - **Tip-off snapshot:** a **one-time still frame** of the market (host canvas → JPEG) plus a tappable overlay of character hit areas, sent to the tipping player only. No live view.
- **Nothing on the TV reveals a player during a round** (§6.11). Any feedback that would (grab success, tip payout, pickpocket loot) is phone-only.

## 3. Phone controller requirements (settled)

`PLATFORM.md` §3, plus:

- **Orientation:** landscape (joystick left, actions right), like Sunny Side and Fort Frenzy.
- **Hold actions must survive latency.** GRAB and PICKPOCKET are holds measured on the host from the button bit, not on the phone. The phone's progress bar is a local estimate, corrected by host events (complete / cancelled / caught).
- **The phone is private.** Players are expected to hide their screen. Nothing on the phone should be loud or bright enough to give someone away across the room (no full-screen flashes on success; toasts only).

## 4. Hosting & repo (settled)

Repo-wide hosting and layout: `PLATFORM.md` §4. Thieves' Forum specifics:

- **Game domain:** `thieves-forum.fostercurtis.dev` (Vercel). **Game ID** (relay namespace): `thieves-forum`.
- **App:** `apps/thieves-forum/`, package `@pcg/thieves-forum`. Same layout as the other games: `index.html` host (TV), `play.html` controller (phone), `src/host/`, `src/controller/`, `src/shared/`.
- **Catalog entry:** `apps/thieves-forum/game.meta.ts` (PLATFORM decision #9): title "Thieves' Forum", 2–8 players, status `hidden` until it ships. Game code reads the player range from there.
- **Shared kits:** `@pcg/net-client`, `@pcg/controller-kit`, `@pcg/game-kit` (including the How to play sequencer, §6.19).
- **Viewer code** (stall view, tip-off snapshot) lives in `src/shared/viewer/` with no game imports, ready to move into `net-client` once Invisible Pranksters or Disguise Hide-and-Seek needs it.

## 5. Engine

- Same stack as Fort Frenzy (its SPEC §15.2): **Phaser renders only**, the sim is plain TS with no physics engine (kinematic movement, circle bodies, spatial hash, soft separation). Canvas 1920 × 1080 logical, `Scale.FIT`, brand TV-safe margin.
- **Boundary rule:** match and sim state live in plain TS modules with no DOM or Phaser imports, unit-testable headlessly. NPC behavior (§6.10) is its own module, because players being indistinguishable from NPCs depends on it.
- **Seeded RNG** (`game-kit/rng`) for NPC personalities, wish lists, outfits and stock, so a match can be replayed in tests.

---

## 6. Game design (v1)

### 6.0 Theme and brand

- **Theme:** an ancient Roman forum market. Currency is the **denarius** (shown as `d`, e.g. "20 d"). The guard is a Roman legionary.
- **Brand kit: "Gilded denarius"** (decided 2026-11-23), stored as the kit files (`src/styles/brand.css`, `brand/`, `public/`) like the other games:
  - **Display:** Cinzel 900, uppercase, slight tracking. Body Geist; room codes JetBrains Mono (family standard).
  - **Palette:** family ink `#14161a`, amber `#e8a33d` (gold denarii, primary action, money), bronze `#a8703a`, travertine `#e9dfc9` (light text and panels), danger red `#e05252` (danger only). Family surface, border and muted values unchanged.
  - **Signature treatment:** a stamped coin edge (dashed/beaded border) on badges, pills and primary buttons.
  - **Mark:** amber coin with black stamped lines: ink rim, beaded inner ring, laureate draped bust facing right, olive-leaf laurel as a straight band, white glint between ring and rim. Three detail levels: detailed (≥128 px, adds "THIEVES · FORVM" legend), simple (64–32 px), tiny (16 px). Favicon and app icons use the ink rounded tile behind the coin; title screen and wordmark use the bare coin.
  - **Tagline (placeholder):** "Blend in. Swipe gold. Don't get caught."
- **Player colors** exist only on phones (banner, outfit card) and in the end-of-round reveal (§6.14). They never appear on characters during a round.
- **Outfit fabrics** (shared by players and NPCs): linen `#d9cfb8`, umber `#7a5a43`, terracotta `#a85f45`, madder `#9c5a63`, olive `#7d7f4f`, sage `#8a9a7e`, woad `#5b7186`, mulberry `#6e5a72`. Gold coins and loot are the brightest things on screen.

### 6.1 Scope

- **Players:** 2–8. No bots.
- **Mode:** free-for-all only. Pairs team mode is v2 (§9).
- **Match:** 3 rounds; highest match total wins (§6.4). Ties share the win.
- **Round:** about **4:30** (tunable 3–5 min).
- **Content:** 10 stalls (9 shops + pawnbroker), the 34-item starter set (§6.5), 1 map, 1 guard type, coin toss as the only player distraction.

### 6.2 Match and round flow

1. **Lobby** (§6.18): join, name, player color, Ready; the leader can open How to play and Start.
2. **Round start:** everyone (players and NPCs) gets a fresh random outfit. Phones show **"THIS IS YOU"** with the new outfit and a countdown. The TV shows **only the players** standing in the market for **4 s**, then the gates open and NPCs stream in from the edges and the end passages over a few seconds.
3. **Play** (round timer running). Guards start per §6.12.
4. **Time up → "Hands up!"** (§6.14): controls freeze, the reveal runs, then the round transition.
5. After round 3: **podium** (§6.15), then back to the lobby with the same players.

### 6.3 Market layout

Single fixed camera showing the whole market (no scrolling), Fort Frenzy's oblique three-quarter projection (top faces above front faces, ground at 0.6). Characters are about **1/10 of screen height**; heads about a third of body height.

**Top to bottom:**

1. **Top row of 5 stalls** flush to the top edge: pawnbroker, bakery, pottery, clothing, wine. A **gated aisle beside the center stall** leads off the top of the screen. During play the gate is **closed** to players, NPCs and the patrolling guard; it opens only for reinforcement guards (§6.12) and the end-of-round guard rush (§6.14).
2. **Upper walking lane.**
3. **Middle row of 5 stalls:** smithy, perfume, spices, rugs, jewelry. **Two one-person-wide alleys** (between stalls 2–3 and 3–4) and **open passages at both ends**.
4. **Lower walking lane.** The **stocks** sit in the lower-left corner.

- **Stalls block line of sight** for guards' view cones (§6.12). Ducking into an alley breaks it.
- **Alleys slow guards** (they squeeze through at reduced speed), giving a fleeing thief a head start. Players and NPCs pass at normal speed.
- **Open stalls = players + 2, min 5, max 10. The pawnbroker is always open.** Which shop stalls open is chosen per match so the open set spans the value range (always at least one cheap shop and the jewelry stall from 5 open stalls up); the implementer picks the selection rule. **Closed stalls** keep the full canopy, valance, shelf and counter but have **no items and no merchant**, with the area under the canopy darkened (~40% black). Not boarded up.
- **One canopy color per shop:** pawnbroker charcoal `#3a404b`, bakery linen `#d9cfb8`, pottery terracotta `#a85f45`, clothing woad `#5b7186`, wine madder `#9c5a63`, smithy umber `#7a5a43`, perfume sage `#8a9a7e`, spices bronze `#a8703a`, rugs olive `#7d7f4f`, jewelry mulberry `#6e5a72`.

### 6.4 Economy and scoring

- Each player has a **money bag** (denarii) and an **item pack** with a **weight capacity of 15**.
- **Fresh purse each round:** every round starts with the same **starting purse (20 d)** and an empty pack.
- **Round haul = end bag + full value of items in the pack − starting purse.** A haul can be negative (a costly catch or bad buys).
- **Match total = sum of the three round hauls.** This is the score.
- Money sources and sinks:

| Action | Effect |
|---|---|
| Buy at a stall | Pay the item's value; item goes in the pack |
| Sell at the pawnbroker | Receive **45–70%** of value (low-weighted roll, rounded down) |
| Sell to an NPC shopper | Receive **110–150%** of value (low-weighted roll, rounded down); only items on that shopper's wish list |
| Steal from a stall | Item goes in the pack for free |
| Pickpocket an NPC or player | Take **8–20 d** (low-weighted roll), or whatever the victim has, if less |
| Toss a coin | Lose the coin (§6.9) |
| Tip off the guard | Pay the tip fee; earn ¼ of the pot if it lands (§6.13) |
| Wrong in-person catch | Pay the wrong-grab penalty |
| Get caught (player or guard) | Lose the pot: 25% of your bag (§6.13) |

- **Items count at full value** in the haul, so honest selling is about turning cheap buys into profit (NPCs) or freeing pack weight, not about cashing out.
- **The pot is taken from the bag only.** Items are never confiscated; only the item being stolen at the moment of a catch goes back to the counter.
- Money and pack contents are visible **only on that player's phone** during a round.

**Luck: low-weighted money rolls.** Pickpocket takes, pawnbroker rates and NPC sale rates are rolled from a range **weighted toward the low end**, so the top of each range is rare and exciting:

- **Roll rule:** `value = min + (max − min) × r²`, where `r` is uniform in [0, 1) from the seeded RNG. Squaring `r` bunches results near `min`: the median lands at ¼ of the way up the range and the top quarter of the range comes up only ~13% of the time. One exponent (2) in the balance sheet controls the skew.
- **When each roll happens** (so players can't re-roll by walking away and back):
  - **Pickpocket:** rolled once per successful pickpocket.
  - **NPC shoppers:** each NPC rolls its own **sale rate when it spawns** and keeps it. A rare generous shopper (shown on the sell sheet as its offer price) is a find worth chasing.
  - **Pawnbroker:** the pawnbroker has a **"rate of the moment"** that re-rolls every **45 s** for everyone. The sell sheet shows today's offer per item; a good rate is a reason to hurry over.
- **Big rolls get a little flourish on the phone:** a pickpocket in the top quarter of its range, or a sale at a top-quarter rate, shows a gold-edged toast ("Lucky! +18 d"). Phone only, as always.

### 6.5 Shops and items

Values roughly track real-world worth. **Rarity:** common = always restocks; uncommon = limited stock (restocks slowly); rare = about one per stall per round, no restock once taken.

**Placement rule:** common items on the front counter; uncommon and rare items always on the back shelf. Stall-by-stall fallback: no counter or back shelf is ever empty. If a stall has no common items, its cheapest items go on the counter; if it has only common items, its most expensive go on the back shelf.

**Grab time** comes from one rule: **grab ms = 500 + 100 × weight + 2 × value**, rounded to the nearest 50 ms. Back-shelf items add a reach penalty (§6.7).

| Shop | Item | Value | Weight | Grab (ms) | Rarity |
|---|---|---|---|---|---|
| Pawnbroker | (buys only, sells nothing) | | | | |
| Bakery | Loaf of bread | 2 | 1 | 600 | common |
| Bakery | Honey jar | 8 | 2 | 700 | common |
| Bakery | Cheese wheel | 6 | 3 | 800 | common |
| Bakery | Honey cake | 20 | 1 | 650 | uncommon |
| Pottery | Clay cup | 3 | 1 | 600 | common |
| Pottery | Oil lamp | 6 | 1 | 600 | common |
| Pottery | Amphora | 15 | 6 | 1150 | common |
| Pottery | Painted vase | 35 | 3 | 850 | uncommon |
| Clothing | Sandals | 8 | 1 | 600 | common |
| Clothing | Tunic | 12 | 2 | 700 | common |
| Clothing | Wool cloak | 30 | 3 | 850 | uncommon |
| Clothing | Fine toga | 50 | 4 | 1000 | uncommon |
| Wine merchant | Jug of cheap wine | 10 | 3 | 800 | common |
| Wine merchant | Wine amphora | 25 | 6 | 1150 | uncommon |
| Wine merchant | Fine vintage | 55 | 4 | 1000 | uncommon |
| Smithy and tools | Knife | 10 | 1 | 600 | common |
| Smithy and tools | Hammer | 15 | 3 | 850 | common |
| Smithy and tools | Gladius | 50 | 4 | 1000 | uncommon |
| Smithy and tools | Bronze helmet | 65 | 5 | 1150 | uncommon |
| Perfume and oils | Olive oil flask | 10 | 2 | 700 | common |
| Perfume and oils | Scented oil | 25 | 1 | 650 | uncommon |
| Perfume and oils | Perfume vial | 70 | 1 | 750 | uncommon |
| Spices | Sack of salt | 5 | 3 | 800 | common |
| Spices | Pepper pouch | 25 | 1 | 650 | uncommon |
| Spices | Cinnamon bundle | 40 | 1 | 700 | uncommon |
| Spices | Saffron pouch | 90 | 1 | 800 | uncommon |
| Rugs | Reed mat | 15 | 4 | 950 | common |
| Rugs | Wool rug | 75 | 8 | 1450 | uncommon |
| Rugs | Grand carpet | 150 | 12 | 2000 | rare |
| Jewelry | Glass-bead necklace | 6 | 1 | 600 | common |
| Jewelry | Bronze ring | 20 | 1 | 650 | uncommon |
| Jewelry | Silver bracelet | 100 | 1 | 800 | rare |
| Jewelry | Gold necklace | 280 | 1 | 1150 | rare |
| Jewelry | Gem ring | 600 | 1 | 1800 | rare |

- Items are **data** (`src/content/items.ts` or equivalent): adding the full ~100-item set later is content, not code.
- **Pack full:** an item that would exceed the weight cap shows "Too heavy" on its tile and can't be grabbed or bought.

### 6.6 Stalls and merchants

- Each stall has a **long front counter** (cheaper items spread along it) and a **back shelf** (a cabinet behind the merchant) with the expensive items. One merchant per open stall (the pawnbroker included).
- **Merchant attention is shown by position:** the merchant walks along the counter to stand in front of whoever he's helping (NPC or player).
- **Glance with a wind-up:** every so often the merchant's head starts to turn (half-turn with white swoosh lines = the warning beat), then he looks over his shoulder. The beat is the thief's fair warning to let go. Glance interval varies per merchant and rises with **suspicion** (below).
- **Browsing:** a player who walks up to a stall and presses **BROWSE** opens the private stall view (§6.17). On the TV, browsing and stealing look identical.
- **Merchant dialog:** when the merchant comes over to a browsing player, the phone shows the dialog:
  - **Just browsing:** he steps away to help someone else, but his **suspicion** of that player rises: he glances back at them more often for a while (decays over time).
  - **Buy…:** list of all items with prices; buying is instant.
  - **Ask about…:** pick a back-shelf item; he **turns around to fetch it**, putting his back to the counter. A built-in distraction for swiping from the counter.
  - **Leave** (far right): closes the dialog.
- **Bringing items forward:** sometimes a merchant takes a back-shelf item to the counter to show a customer (NPC or player, including via Ask about…). If a distraction happens or another customer arrives, he **may leave it on the counter** while he deals with it; it can then be grabbed from the counter row at its normal grab time. He returns it to the shelf when he comes back, if it's still there.
- **Merchant catches:** if the merchant's glance lands while a player is mid-grab at his stall, he **shouts and points, and calls the guard** (an alert, §6.12). The item goes straight back on the counter. **The thief loses no money unless a guard catches them.**
- **Merchants only catch stall theft at their own stall.** They don't react to pickpocketing in the lane.

### 6.7 Stealing from a stall

- **Hold GRAB on an item tile** in the stall view. The item comes free after its grab time; release early and nothing happens.
- **Caught:** if the merchant completes a glance toward the thief before release, it's a merchant catch (§6.6).
- **Back shelf:** reachable **only while the merchant is out from behind his counter** (e.g. walking to a tossed coin, called away by an NPC, or answering a guard call). While he's away, the back-shelf row on the phone becomes grabbable, with **+500 ms reach penalty** on top of the item's grab time. When he steps back behind the counter, any back-shelf hold in progress is **cancelled** (not caught), and the row dims again. If he's back and looking while you're mid-reach, it's a merchant catch as usual.
- **No TV effect for a successful grab.** The item simply disappears from the counter; feedback is phone-only (bar fills, item pops into the bag, "+value" toast).
- **Only one player can hold a given item at a time;** a second player's tile shows it as taken.

### 6.8 Pickpocketing

- **Get behind someone** (NPC or player) within reach and **hold PICKPOCKET for 2000 ms** to take **8–20 d** (low-weighted roll, §6.4), or all they have, if less. The main button shows PICKPOCKET automatically when you're behind someone (§6.17).
- **Cancels** (nothing taken, no penalty) if the target moves out of reach or you move or turn away before the hold completes.
- **Player victims get no warning** on their phone. Spotting it is purely about watching the TV. Afterwards, the victim's phone shows a small "Your purse feels lighter… −N" toast (so they know to look for a thief), but nothing on the TV.
- **NPC victims can catch you:** partway through the hold an NPC victim may give a short **head-turn wind-up**, then **look over its shoulder**. If it catches you mid-hold:
  - you get **nothing**, no penalty yet;
  - the NPC switches to the **point-and-shout pose** aimed at you with a shaking **"THIEF!"** bubble (an alert, §6.12);
  - you have a chance to escape (§6.12, Chase and escape).
- **NPC money:** NPCs carry enough for their shopping (they spend it at stalls). An NPC who has been pickpocketed recently is more alert (higher glance chance) for a while.
- **Guards can spot pickpockets** inside their view cone (§6.12).

### 6.9 Distractions

- **NPC shoppers** naturally pull merchants away by buying and browsing.
- **Ask about… a back-shelf item** (§6.6).
- **Toss coin** (v1's only player distraction): the player's character does a short throw animation (wind-back, forward swing) and a coin arcs a short distance ahead, flipping end over end, bounces once, lies flat and glints (under 1 s). The **nearest merchant within range** shows a "?" and walks out from behind his counter to pick it up, then returns. Costs **1 coin from the bag** (the coin is lost). **Cooldown 8 s.** Aimed with the joystick direction at the moment of the tap (or facing direction if the stick is idle).
- Tossing a coin is **visible on the TV** (the throw animation). It's a tell, by design.

### 6.10 NPCs

- **Planned count = 8 + 2 × players** (2 players → 12, 8 players → 24).
- **Constant churn:** NPCs walk on and off the screen **throughout the whole round** (finished shoppers leave, new ones arrive), keeping the live count **within ±8% of the planned count** (rounded, at least ±1). Arrivals and departures use the **four entries: the left and right ends of the upper and lower lanes** (the top gate stays closed). Someone walking on or off is always normal, which is what lets mid-round joiners (§6.18) and leaving players blend in.
- At round start, NPCs stream in through the same entries after the players-only opening (§6.2).
- **They must move like people.** If players can't tell NPCs from players by movement, the disguise holds. All five techniques are required:
  1. **Shopping list + state machine.** Each NPC gets a short wish list (e.g., "spices, then bread") and moves through states: wandering → browsing → approaching → buying → leaving. Always a reason to go somewhere, never in a rush.
  2. **Steering behaviors** instead of straight lines: velocity nudged each frame by blended *seek* (goal), *wander* (gentle random drift) and *separation* (keep away from neighbours). Curvy, natural paths.
  3. **Detours and distractions:** passing a stall it doesn't need, an NPC may slow, glance or stop to browse; occasionally it forgets its goal and wanders off.
  4. **Personality sliders** rolled per NPC: walking speed, distractibility, browse duration (same trick as Fort Frenzy's scrap mites).
  5. **Little human moments:** brief pauses before choosing a direction, occasional doubling back, waiting in line, picking up a dropped coin (they also chase tossed coins sometimes, like merchants).
- **NPCs buy and sell for real:** they spend at stalls (which can empty uncommon stock) and are the buyers for player sales (§6.4). Each NPC's wish list says what it will buy from a player.
- **Gaits:** NPCs mostly walk; a hurried NPC personality occasionally walks briskly. Nobody but a fleeing player (or a guard) runs.
- **Player movement:** the joystick maps to speed from a slow shuffle up to a **jog** at full tilt. Full tilt is noticeably faster than any NPC, so running is a visible tell (players learn to keep the stick at walking pace when blending in).

### 6.11 Disguise

- Players and NPCs draw from the **same pool of outfit pieces** (tunic, short shoulder mantle, hair, skin tone, all from §6.0's fabric palette) on one shared rig.
- **New outfits every round** for everyone, because the reveal exposes everyone.
- Each phone shows the player's own outfit (§6.17) so they can find themselves on the TV.
- **Nothing on the TV distinguishes a player during a round:** no colors, names, rings or effects on grab, pickpocket success or tip payout. The things that *do* expose you are actions only players take: running from a guard, an in-person catch (yours or a wrong one), a coin toss, standing in the stocks.
- **Stocks exposure is permanent for the round:** a released thief keeps their outfit.

### 6.12 Guards

- **The guard** is a Roman legionary (bronze galea with red crest, segmented cuirass, red scutum, sheathed gladius). Patrols the walking lanes with a **visible translucent view cone** on the TV; stalls block the cone. Natural loop: upper lane → down an alley → lower lane → up an end passage.
- **Starting guards per round:** 1 / 2 / 3 at **5+ players**; 1 / 1 / 2 at **2–4 players**.
- **Escalation:** the round counts **guard activations** (NPC alerts, merchant calls, tip-offs, and guard spots, across all guards). **Every 5 activations, another guard walks in through the top gate** and starts patrolling. **Cap: 4 guards.**
- **Spotting:** a player who is **mid-steal** (stall grab or pickpocket hold) inside a guard's cone with clear line of sight is **spotted**: the cone turns red, a red "!" pops over the guard, he **jogs** at them. Counts as an activation and starts a chase.
- **Alerts:** when an NPC or merchant shouts "THIEF!", **every guard in that lane** (or the nearest guard, if none is in the lane) jogs toward the thief. Counts as an activation and starts a chase.
- **Chase and escape:** a chasing guard heads for the thief's live position while he can see them, and for their **last seen position** when he can't. If the thief stays **out of every chasing guard's line of sight for 3 s**, the guards give up and resume patrolling: **escape, nothing lost**. If a guard reaches the thief, it's a **guard catch** (§6.13). Players who escape usually reveal themselves to the room by running; that's the price.
- **Tip-offs** (§6.13) send the guard to collect, not to chase.
- **Guards never grab NPCs** and never react to a player who is merely browsing.

### 6.13 Catching thieves and penalties

**Hot hands:** a character is **hot for 5 s** after starting any steal (stall grab or pickpocket hold), whether it succeeded, was cancelled or was caught. Hot status is invisible; it's how tip-offs are judged.

**Catch in person (Catch! button):**

- Grabs the character you're touching (nearest in front of you within reach).
- **Counts only if the target is mid-steal** (with a **300 ms grace** after their hold ends, for latency).
- **Right:** the catcher gets the **whole pot** (25% of the thief's bag). The thief is **not** sent to the stocks.
- **Wrong** (target not mid-steal, or an NPC): the grabber pays the **wrong-grab penalty**.
- Either way the grabber has revealed themselves as a player: the TV shows the grab.

**Tip off the guard (Tip guard button):**

- Opens the tip-off snapshot (§6.17): a still frame of the market at the moment you tapped. Tap a character, pay the **tip fee**, SEND GUARD.
- **Judged immediately:** the tip **lands** if the tapped character was **hot at the snapshot moment or at send time**. Otherwise it **misses**: the fee is lost, and the guard does nothing visible.
- **A landed tip is a locked-in catch:** the nearest free guard **jogs** to the thief's current position and makes the catch on arrival (no escape). Counts as an activation.
- **Tipper's cut** (¼ of the pot) is paid **on the tipper's phone only** ("+N" toast). The guard doesn't walk over, so tipping keeps your cover.
- Tipping an NPC always misses.

**Payout table:**

| Caught by | Pot (25% of thief's bag) | Stocks |
|---|---|---|
| Player grab | Catcher gets the whole pot | None |
| Guard (tip-off) | Tipper gets ¼; the guard keeps the rest | 20 s |
| Guard (spot or alert chase) | The guard keeps all of it | 20 s |
| Merchant glance | No pot; guard called (alert) | Only if the guard then catches you |
| NPC glance (pickpocket) | No pot; guard called (alert) | Only if the guard then catches you |

- **The item being stolen always goes back on the counter,** whoever makes the catch. Catchers earn coins, never loot.
- **Caught (any catch):** red starburst "!" over the thief; the pot flies to the catcher as coins (to the guard for a guard catch). Phone: red **CAUGHT!** banner with the pot lost.
- **Stocks:** the guard marches the thief to the stocks in the lower-left; they stand there for **20 s** with a countdown above them, controls disabled. Phone: "IN THE STOCKS" with a countdown ring. On release they keep their outfit (§6.11).
- **A thief can't be caught again** while in the stocks or for **3 s** after release.

### 6.14 End of round

- **"Hands up!":** when the timer ends, every controller freezes and shows **HANDS UP!** with that player's own Bag and Items tiles plus a Total (this round's haul).
- **TV reveal:** NPCs dim (~55% black) while every player raises their hands; each player gets a **ring under the feet and a name tag in their player color** (the first time player colors appear on the TV).
- **Lowest haul to highest,** a card pops above each player: bag, item icons with values, and an amber coin-edge strip with **this round's haul only**. It then shrinks to a small "+haul" tag before the next card opens. **No match totals anywhere until the podium.** No fun stats.
- **Top earner:** confetti and a **gold laurel crown** hovering above their head, bobbing and spinning (name and haul tags sit above it). Ties: all tied top earners get crowns.
- **Round transition:** the main guard spots the top earner (red "!") and charges, while **three more guards burst in from the top gate** and chase the other players. Each player runs away from the nearest guard in their lane (never toward a guard), off the map. Fade to black. Next round starts (§6.2).

### 6.15 End of match (after round 3)

- **Podium screen:** dark forum backdrop (title-screen columns); travertine podium blocks in the three-quarter view marked II, I, III in Cinzel.
- **4th place and below** stand in a row along the bottom with name tags and match totals, shown all at once.
- **3rd, then 2nd** are revealed one at a time (empty blocks show a dim "?"), then **1st** rises onto the top block with a gold laurel crown, a gold coin-edge total, amber and white fireworks, and a Cinzel banner **"[NAME] WINS!"**. Ties share the block and the banner.
- Match totals appear here for the first time.
- **Feedback:** QR to the feedback form beside the podium (PLATFORM decision #11); every phone gets **Give feedback** on its match-end screen.
- Phones show their final place and total; the leader gets **Play again** (back to lobby).

### 6.16 TV presentation and HUD

- **During a round:** small round timer (bronze ring) + round pill ("ROUND 2 / 3") at top center; room code bottom right. **No scores, names or player colors on the TV.**
- **Visible events:** merchant glance wind-up; NPC/merchant point-and-shout with "THIEF!"; guard cone turning red with "!"; guards jogging; coin toss arc and glint; catches (starburst, coin shower); thieves in the stocks with countdown; reinforcement guard entering through the gate.
- **Title screen:** forum columns and pediment in dark surface tones, coin mark above "THIEVES' FORUM", the tagline, room code card and QR.
- **Lobby, How to play, reveal and podium** screens as described in §6.14, §6.15, §6.18, §6.19.
- Host UI is couch-friendly (drivable from the leader's phone, keyboard or gamepad; no hover dependence), per the launch-readiness habits.

### 6.17 Phone screens

Top banner on every in-round screen: the player's color, name (Cinzel), connection dot, and a **coin pill** (bag total, mono digits, dashed amber border).

- **Round start:** "THIS IS YOU" card with the new outfit on a travertine circle and a short countdown.
- **Controller:** floating joystick on the left; outfit card ("You") small in a corner. On the right:
  - **Context-sensitive main button** (amber, stamped coin edge): **BROWSE** at a stall (opens the stall view), **PICKPOCKET** behind someone (hold; a progress bar above the button shows time left), **SELL** beside an NPC shopper (opens the sell sheet). Blank and disabled when none applies. Priority when several apply: BROWSE > SELL > PICKPOCKET.
  - **Secondary buttons** (bronze outline): **Toss coin** (shows cooldown), **Tip guard**, **Catch!** (red outline).
- **Stall view (private):** header in the stall's canopy color; **joystick stays on the left**, items on the right. "Counter · hold to grab" row of large item tiles (hold bar on the tile; tiles use rarity borders: common gray, uncommon bronze, rare gold border + warm tile). "Back shelf · out of reach" row dimmed, which becomes grabbable while the merchant is away (§6.7). Items the merchant brings forward move to the counter row. **Walking away closes the view** (no Leave button). **No merchant status on the phone**: players must watch the merchant on the TV.
- **Merchant dialog:** bottom sheet over the stall view with the merchant's face, "WHAT'LL IT BE?" and **Just browsing** / **Buy…** (all items with prices) / **Ask about…** (back-shelf items) / **Leave** on the far right.
- **Tip-off:** the still snapshot of the market; tap a suspect (selected character outlined), fee shown (e.g., "10 d"), **SEND GUARD**, Cancel. The joystick is disabled while it's open (your character stands still, like a shopper idling).
- **Pawnbroker:** list of pack items with half-value prices and Sell buttons, plus a pack weight bar (e.g., "5 / 15"). Opens from BROWSE at the pawnbroker.
- **Sell to an NPC:** only beside a shopper; shows what that shopper wants, highlights matching pack items with the over-value price, greys out the rest.
- **Pack:** tapping the coin pill opens a read-only sheet of the pack (items, values, weight bar).
- **Stocks:** red **CAUGHT!** banner with the pot lost, a countdown ring, "IN THE STOCKS"; controls return when the timer ends.
- **Hands up!:** Cinzel "HANDS UP!" in amber; Bag, Items and an amber Total tile with the coin edge; controls frozen until the reveal ends.
- **Toasts** (phone only, small): "+value" on a grab, "+N" on a pickpocket, "+N" tip payout, "Tip missed −N", "Your purse feels lighter… −N", "Wrong grab −N".

### 6.18 Lobby, join and disconnects

Follows the Sunny Side / Fort Frenzy patterns unless noted:

- **Lobby:** QR + room code + joined players on the TV. Phones: name step, then player color + Ready; the leader sees **How to play** and **Start**. Start needs 2+ players.
- **Mid-round joins walk on like an NPC.** A player who joins during a round gets a random outfit and the starting purse. Their phone shows the outfit card and where they'll appear, e.g. **"You're walking in at the top left"** (one of the four lane entries, §6.10, chosen at random among the ones with no guard nearby). Their character enters from that edge **driven by NPC behavior**, and the player **takes control once it's a few paces on screen** (~1.5 s), with a short "Your turn!" on the phone. With constant NPC churn, the walk-on looks like any other shopper arriving; the join counts against the NPC budget so the crowd size stays the same.
- **Joins during the reveal, transition or podium** wait for the next round start. A mid-match joiner's match total counts only the rounds (or part-round) they played.
- **Disconnect:** the player keeps their spot, bag and pack. **Their character is taken over by the NPC behavior** (§6.10) until they reconnect, so a dropped phone doesn't freeze a character and expose it. If they're mid-hold, the hold cancels.
- **Leave game:** full removal (Sunny Side's rule); their character walks off the map like a leaving NPC.
- **No self-pause in v1:** a frozen character would stand out. A host-tab-hidden pause works as in the other games.

### 6.19 How to play

Rules cards on the TV using the shared kit (`game-kit` sequencer + `controller-kit` phone screen), the same flow as Sunny Side §6.9 and Say Cheese §6.2.1. This game owns the copy, illustrations and styling. Card outline (copy to be drafted in the build, for Foster's review):

1. **Blend in.** You're one of the shoppers. Your phone shows your outfit. Nobody else knows which one is you.
2. **Most denarii wins.** Buy cheap, sell to shoppers, or… help yourself. Everything in your pack counts at full value.
3. **Swipe from the counter.** Browse a stall, hold GRAB on an item. Let go when the merchant starts to turn!
4. **Pickpocket.** Get behind someone and hold. Shoppers may look back.
5. **Distract.** Toss a coin and the merchant walks over to get it. Ask about a back-shelf item and he turns around.
6. **Guards.** Don't get seen in the act. If someone shouts THIEF, break line of sight and blend back in.
7. **Catch other thieves.** Grab them mid-steal for their purse, or tip the guard from anywhere to stay hidden.

### 6.20 Audio

v1 ships **ambient market sound plus a small sound-effects set**, no music. TV only: phones stay silent, because they're private.

**Ambience (two layers):**

- **Bed:** a long, seamless crowd loop (crossfaded at the loop point) playing quietly under everything at a **fixed volume** (it does not change with the NPC count).
- **One-shots:** short market sounds played at random intervals, with random stereo pan, small pitch and volume variation, and no immediate repeats: vendor calls, pottery clinks, coins counted on a counter, a cart wheel, a donkey, a distant dog, a fountain trickle. This stops the bed from sounding like a loop.
- **Period rule:** no intelligible modern speech and no music in either layer. Use crowd "walla" (unintelligible murmur), or put a gentle low-pass filter on recordings until words blur. Vendor calls must be wordless or unintelligible.
- **Ducking:** the ambience dips briefly under gameplay sounds that matter (THIEF!, guard whistle, catches) so they always cut through, and drops out under the reveal and podium.

**Sound effects:** coin clink (toss, catch payout), merchant swoosh (glance wind-up), "THIEF!" shout, guard whistle (spot or alert), gate creak (reinforcement), stocks clank, round bell, reveal pops, fanfare and fireworks. **No sound for successful grabs or pickpockets** (it would reveal the thief).

**Sources** (commercially licensed only, with a license entry per file, as in Fort Frenzy):

1. **Sonniss GDC Game Audio bundles** (royalty-free, commercial use, no attribution; raw files may not be redistributed, and the files may not be used for AI training). First choice for the crowd bed and one-shots. A single paid Sonniss library is the fallback if the free bundles have no usable crowd walla.
2. **Kenney.nl CC0 packs** for UI-style effects (coins, pops, clanks).
3. **Freesound.org, CC0 filter only.** CC BY files need a credits entry, so use them only if a credits screen exists by then.

The audio player is a small Web Audio module (bed loop, one-shot scheduler, ducking) with no game imports, so later games can reuse it.

### 6.21 Art

Art is produced in this project as concept passes, then delivered to the repo as `art/` sources (format per Fort Frenzy's pipeline; the implementer decides). Status at spec time:

- **Approved:** projection and proportions (§6.3); stall concept v3 (merchant waist-up at the counter, rising on screen as he moves back to the cabinet, counter hiding his lower legs; back-shelf cabinet with depth); closed-stall look; full market layout v1; 34 item icons (rugs v3 as rolled cylinders; grand carpet 36 × 32); effects v2 (coin toss v3, glance wind-up, guard spot, point-and-shout, catch starburst); brand kit and mark v4.
- **Characters:** front, side and back views, drawn as tinted cut-out parts (tunic, mantle, hair, skin) so one rig serves the whole outfit pool; every part appears in the same color in all three views. Rigs: **citizen** (short shoulder mantle, belt), **merchant** (bleached-linen apron `#efe6d2`, full beard, wrapped cap with knot over citizen hair), **legionary guard** (§6.12 details; shield back-most in back view).
- **Poses/animations needed:** walk, idle, browse, reach/grab (shared with browse, so it's not a tell), pickpocket reach, **throw** (coin toss), **point-and-shout**, hands-up, run, stocks; merchant glance (three stages), fetch, carry item forward; guard patrol, jog, catch, march.
- Anything missing at build time falls back to dev-only shapes, as in Fort Frenzy.

---

## 7. Balance sheet (starting values)

All in one config file (`src/content/balance.ts` or equivalent). Tune in playtesting.

| Value | Start | Notes |
|---|---|---|
| Rounds per match | 3 | |
| Round length | 270 s | Range 180–300 |
| Players-only opening | 4 s | |
| Starting purse | 20 d | Per round |
| Pack capacity | 15 weight | |
| Pawnbroker rate | 45–70% of value | Low-weighted; re-rolls every 45 s |
| NPC sale rate | 110–150% of value | Low-weighted; rolled per NPC at spawn |
| Luck skew exponent | 2 | `min + (max − min) × r^k` |
| NPC count tolerance | ±8% of planned | Churn all round |
| Join hand-off delay | ~1.5 s on screen | §6.18 |
| Ambience one-shot interval | 2–6 s (random) | §6.20 |
| Ambience duck | −8 dB for ~1 s | Under THIEF!, whistle, catches |
| Grab time | 500 + 100 × weight + 2 × value ms | Nearest 50 ms |
| Back-shelf reach penalty | +500 ms | §6.7 |
| Pickpocket hold | 2000 ms | |
| Pickpocket amount | 8–20 d | Low-weighted roll |
| Tip-off fee | 10 d | ≈ 15–20 s of thief earnings |
| Wrong-grab penalty | 12 d | A bit above the tip fee |
| Pot | 25% of bag | Rounded down |
| Tipper's share | ¼ of pot | |
| Hot-hands window | 5 s | §6.13 |
| Catch grace | 300 ms | §6.13 |
| Stocks time | 20 s | |
| Post-stocks immunity | 3 s | |
| Escape (out of sight) | 3 s | §6.12 |
| Coin toss cost / cooldown | 1 d / 8 s | |
| NPCs | 8 + 2 × players | |
| Open stalls | players + 2, 5–10 | Pawnbroker always |
| Starting guards | 1/2/3 (5+ players), 1/1/2 (2–4) | |
| Activations per extra guard | 5 | |
| Guard cap | 4 | |
| Guard alley speed | 60% | |
| "Just browsing" suspicion | glance rate × 2, decays over ~20 s | |
| Merchant base glance interval | 4–8 s (random) | Per merchant |
| NPC pickpocket glance chance | ~25% per attempt | Higher if recently robbed |
| Rare stock | ~1 per stall per round | No restock |
| Uncommon restock | slow (e.g. 60 s) | |

The fee-setting rule (decided): once playtests show how many coins a thief earns per minute, set the **tip fee ≈ 15–20 s of earnings**, the **wrong-grab penalty a bit higher**, and the **pickpocket amount in the same range**.

## 8. v1 scope

- Free-for-all, 2–8 players, 3 rounds.
- 10 stalls (players + 2 open), 34 starter items, 1 map.
- Merchants (glance, dialog, bring-forward, catches), NPCs (§6.10), guards with escalation (§6.12).
- Stall theft, pickpocketing, coin toss, buying, pawnbroker and NPC selling, in-person catches, tip-offs, stocks.
- Round reveal, round transition, podium.
- How to play, lobby, reconnect, catalog entry, feedback QR.
- Ambient market audio (bed + one-shots) and a small SFX set, no music.
- Everything in §9 is out of scope.

## 9. Later (v2+)

Build v1 so these can be added without rewrites.

| Item | Notes | v1 prep |
|---|---|---|
| **Pairs team mode** | Secret random pairs; Mafia-style night phase once at match start (phones say close your eyes; one pair at a time opens eyes for 2–3 s, presses "I saw my partner"; TV beep when done). Each round the phone also shows the partner's outfit. Partners coordinate silently (one distracts, one steals). Phone screens: partner card on round start, night phase. | Score and payouts go through one module keyed by "side" (player now, team later); round-start screen built to show one or two outfit cards |
| Noisy distraction | Knock over crates: pulls all nearby merchants, long cooldown | Distractions are a list of handlers, coin toss is the first |
| Outfit-change stall | Pay to swap outfit and shake off pursuers | Outfit assignment is one function callable mid-round |
| Full item set | Grow to ~100 items | Items are data (§6.5) |
| Music | | Audio map in config |
| More maps / themes | | Layout (stall slots, lanes, alleys, gate, stocks) is config |

## 10. Open questions

1. **Tagline:** "Blend in. Swipe gold. Don't get caught." is a placeholder.
2. **Final name check** before any public release (Steam, itch.io, USPTO), as for Fort Frenzy.
3. **Balance numbers** (§7): all starting values, to be set from playtesting, especially the escape window, tip fee, pickpocket amount, merchant glance timing and how often merchants bring items forward or leave them out.
4. **Open-stall selection rule** (§6.3): which shops open at low player counts. The implementer proposes one; review in playtesting.
5. **Art still to draw:** final character rigs in all poses (§6.21), title screen, podium, reveal cards.

## 11. Decision log

Design decisions made in the project before this spec (full history: `claude/marketplace-thief.md`). Numbered for reference in later changes.

1. 2026-11-23: Ancient Rome theme; name **Thieves' Forum**; "Gilded denarius" brand; coin mark v4.
2. 2026-11-23: Fixed single-screen camera; 10 stalls in two rows of five; alleys and end passages in the middle row.
3. 2026-11-23: Players disguised among NPCs from a shared outfit pool; human-like NPC movement (five techniques).
4. 2026-11-23: Stall theft = hold to grab, grab time from weight and value; merchant glance with wind-up.
5. 2026-11-23: Pickpocketing Jailbreak-style, 2000 ms hold, no warning to player victims; NPC victims can glance and call the guard.
6. 2026-11-23: Catches: in-person grab (mid-steal only, full pot, reveals you) or tip-off (fee, ¼ of pot, stocks 20 s). Pot = 25% of bag. Stolen item always returns to the counter.
7. 2026-11-24: Merchant catches call the guard instead of taking the pot; no loss unless the guard catches you.
8. 2026-11-24: Uncommon and rare items always on the back shelf; merchants sometimes bring items forward and may leave them on the counter.
9. 2026-11-24: Guard escalation (+1 guard per 5 activations); new outfits every round; reveal shows round haul only; podium "[NAME] WINS!".
10. 2026-11-24: Tip payout is phone-only (the guard no longer walks to the tipper).
11. 2026-11-24: Pairs mode deferred to v2.
12. 2026-11-24 (spec questions): **fresh purse each round**, match total = sum of round hauls.
13. 2026-11-24 (spec questions): tip-offs judged by a **hot-hands window** at snapshot/send time; a landed tip is a locked-in catch.
14. 2026-11-24 (spec questions): **back shelf reachable only while the merchant is out from behind the counter**, with a reach penalty.
15. 2026-11-24 (spec questions): **2–8 players; open stalls = players + 2** (5–10), pawnbroker always open.
16. 2026-11-24 (spec questions): **guard cap 4**; starting guards 1/2/3 at 5+ players, 1/1/2 at 2–4.
17. 2026-11-24 (spec questions): v1 phone screens adopted as proposed.
18. 2026-11-24 (spec questions): released thieves **keep their outfit**.
19. 2026-11-24 (spec questions): domain `thieves-forum.fostercurtis.dev`, game ID `thieves-forum`.
20. 2026-11-24 (review): starting purse **20 d**.
21. 2026-11-24 (review): **low-weighted luck rolls** for pickpocket (8–20 d), pawnbroker (45–70%) and NPC shoppers (110–150%).
22. 2026-11-24 (review): **mid-round joins walk on as an NPC** from a named entry and take control a few paces in; NPCs churn on and off all round within **±8%** of the planned count.
23. 2026-11-24 (review): **ambient market audio in v1** (crowd bed + randomized one-shots, no modern speech or music), sourced from Sonniss GDC bundles first.
