# Neon knights art

Vector source art for Fort Frenzy's neon knights theme. The atlas script (SPEC §15.10) rasterizes every SVG outside `review/` and `icons/` into the TV atlases; `icons/` builds the phones' icon sprite. Art rules: SPEC §2.1, §2.4–§2.6, §3.6, §7.1–§7.2, §9.6. Rig contract: §15.2. All art is original work for this project (license: owned).

## Layout

| Path | What's in it |
|---|---|
| `rigs/<id>.json` | One rig per animated thing: `warden`, `ranger`, `commander`, `artificer`, `footman`, `drone`, `skitter`, `brute`, `bombard`, `wasp`, `mite`, `stalker`, `colossus`, `mortar`. |
| `characters/<id>/<view>/<part>.svg` | Knight and footman rig parts. The Ranger adds a pose folder: `characters/ranger/<view>/<pose>/<part>.svg`. |
| `enemies/<id>/side/<part>.svg` | Enemy and Colossus rig parts (one view, `side`). |
| `structures/...` | Structure frames (listed in `sprites.json`) and the mortar rig parts (`structures/mortar/side/<part>.svg`). |
| `effects/` | Projectiles, flashes, sparks, the heal glint, shock crawl, wall strike, deploy beacon and scrap piles (listed in `sprites.json`). |
| `map/` | Ground tiles, playfield edges and corners, lane entries (open and sealed) and flat decor (listed in `sprites.json`). |
| `icons/` | UI icon glyphs and badge tiles (see `icons/README.md`). |
| `review/` | Assembled references, tier and aim sheets, UI reference screens and drawn UI pieces. Not read by the atlas script. |
| `sprites.json` | Every frame that isn't a rig part: viewBox, anchor, layer, tint and attach points. |

**Frame names** are file paths under the category folder (`characters`, `enemies`, `structures`, `effects`, `map`) without `.svg`. For example, `characters/warden/side/helm.svg` is the frame `warden/side/helm`, and `structures/pulse-turret/ii/se.svg` is `pulse-turret/ii/se`.

## Rigs

Each `rigs/<id>.json` follows SPEC §15.2 `RigDef`, with three additions:
- **`viewBox`** is the box every part of the rig shares, across all views.
- **`attach`** entries are `{ "part": <part>, "at": [x, y] }`. Each point rides on its part.
- **The Ranger's views** are `{ "defaultPose": "stand", "poses": { "stand": ..., "ready": ... } }`.

- **Coordinates:** rest-pose sprite units. A tile is 80 wide and 48 deep. Draw at 0.6 for 48 px tiles.
- **Shared box:** all parts share the rig's viewBox, so they stack with no offsets at rest.
- **`foot`:** the anchor (ground contact, y-sort key).
- **`pivot` and `at`:** `pivot` is the joint the part turns around. `at` is the same joint on its parent; they're equal at rest.
- **`parent`:** a part follows its parent (hands follow arms, weapons follow hands, glow pieces follow their host). Parts with no parent hang off the root.
- **`order`:** back to front, per view and pose. Every view and pose lists every part, including parts hidden at rest (§2.4 full-size rule).
- **`tint: "player"`:** the frame holds only the color part, in grayscale (`currentColor`). Multiply the player color over the whole frame.
- **`emissive: true`:**
  - **Knights:** glow comes as per-part pieces named `<host>-glow`, parented to the host and drawn right after it, so glow follows a swinging limb and never shows through what covers it. Code can brighten or pulse them.
  - **Others:** enemies, footmen, the Colossus and the mortar keep their glow inside each part (`class="glow"` groups).
- **`optional`:** maps a group to the parts it shows. Parts in any group stay hidden until code switches the group on.
  - **commander:** `banner` is on while the flag is carried, off while it's planted.
  - **artificer:** one group per gauge core state, `core1-full` … `core3-half`. Show at most one state per cell. Cell N shows full when crates ≥ 2N, half when crates = 2N − 1. The cells and slots are always on (§2.4).
  - **colossus:** `mk2`, `mk3`, `final`. Each add-on is listed under the tier where it first appears, so switch the groups on cumulatively.
  - **mortar:** `ii`, `iii`, `band1`, `band2`, `band3` (see Towers).

### Attach points

| Rig | Attach names |
|---|---|
| `artificer` | `badge`, `carry`, `lens`, `nametag`, `pack` |
| `bombard` | `muzzle`, `top` |
| `brute` | `fist`, `top` |
| `colossus` | `core`, `eye`, `fist-far`, `fist-near`, `spire-1`, `spire-2`, `spire-3`, `spire-4`, `spire-5`, `top` |
| `commander` | `badge`, `banner`, `carry`, `nametag`, `sword-tip` |
| `drone` | `blade`, `top` |
| `footman` | `blade` |
| `mite` | `top` |
| `mortar` | `muzzle`, `muzzle-iii`, `top` |
| `ranger` | `badge`, `bolt`, `carry`, `nametag` |
| `skitter` | `core`, `top` |
| `stalker` | `eyes`, `top` |
| `warden` | `badge`, `carry`, `hammer`, `nametag` |
| `wasp` | `muzzle`, `top` |

**Knights:**
- `nametag` and `badge` ride on the helm (`badge` is the super-ready badge spot).
- `carry` is where a cell is held or received. It's on the torso, except on the Artificer, where it's the pack.
- **Per class:**
  - **Warden:** `hammer` is the gravity coil, the slam origin.
  - **Ranger:** `bolt` is the shot origin, in both poses.
  - **Commander:** `sword-tip` and `banner`.
  - **Artificer:** `lens` is the projector and `pack` is the throw origin.
- **Enemies:** `top` is the highest point of the always-on parts. The Stalker's `eyes` is where the target thread starts.
- **Colossus:** spires are numbered left to right. `spire-1`, `-2` and `-4` arrive at Mk II; `spire-3` and `-5` at Mk III.
- **Colossus view:** a true side view facing right, like every other enemy (mirror it to face left). Feet sit on y = 245; `foot` is (140, 245). The spires, their plumes and the back spikes are children of `yoke`, and the horns are children of `head`, so they stay seated on the armor when the yoke or head moves. The horns draw just before `head`, which hides their roots. `review/colossus/side-tiers.svg` shows all four tiers.

## Layers

- **Ground layer:** anything flat on the ground has its own frame here, drawn under everything that stands. That covers the base plate (`plate/tile`), wall rails, shock nets, build-ghost footprints, the Citadel plate and repair zone, the Armory pad and the rally-flag ring.
- **World layer:** upright things, y-sorted by anchor.
- **Effects layer:** flashes, sparks, glints, the shock crawl and the wall strike (SPEC §15.2 layer 4).
- A frame is never on more than one layer. `sprites.json` gives each frame's `layer`.

## Towers

- **Pulse turret:**
  - **Stack** (bottom to top):
    1. `plate/tile` (ground)
    2. `pulse-turret/pedestal`, or `pedestal-iii` at tier III (it adds the buttress struts)
    3. bands `band1` … `band<n>`
    4. the head `pulse-turret/<base|ii|iii>/<aim>`
  - **Looks:**
    - unupgraded = base head, no band (the fourth look, shown in `review/tower-looks.svg`);
    - I = base head + band1;
    - II = ii head + bands 1–2;
    - III = iii head + `pedestal-iii` + bands 1–3.
  - **Bands:** they sit on the fixed pedestal, so they don't change with the aim.
  - **Aims:** `e se s sw w nw n ne`, where `s` faces the camera. Snap to the nearest aim (§15.2: switch 8° past a sector boundary).
  - **Muzzles:** each head frame has `muzzle-1` (and `muzzle-2` from II up) in `sprites.json`. The anchor (0, 0) is the tile center.
- **Mortar (rig `mortar`):**
  - **Parts:** the ring, dome and tube are always on.
  - **Tiers:** `ii` adds hoops (on the tube) and rim blocks; `iii` adds the muzzle brake (on the tube), rim spikes and the ammo rack; `band1` to `band3` are the tier bands. Same look rules as the turret.
  - **Plate:** draw `plate/tile` under it, centered on the rig's `foot` (48, 96).
  - **Tube:** drawn at rest pointing straight up-screen, pivoting at the dome center (48, 80). Code rotates it there. Hoops and brake are its children. The muzzle is `muzzle` (48, 30), or `muzzle-iii` (48, 17) with the brake.
  - **Draw order:** the tube is always drawn after `ring-front` and before `dome`, so the dome hides its inner end. Clamp the tube to ±75° from straight up. Past 90° it would point down-screen and need to be drawn in front of the dome, which would show its inner end. Shells arc high, so they never need that angle.

## Citadel

- **Frames:** in `structures/citadel/` (anchor (170, 234), the front-center of the 4 × 2 footprint).
- **Ground:** `plate`, `repair-zone`.
- **World, in this order:**
  1. `body`, `glow`, `core`
  2. the two corner sentries
  3. `ramparts`
  4. `window`, then the window sentry
  5. the damage overlays `dmg-cracks` (66%), `dmg-fire` (33%) and `dmg-smoke` (10%), which stack cumulatively
- **Sentry frames:** `structures/sentry/<loadout>/<aim>.svg`. Loadouts are `base dmg rng max`; aims are `l dl c dr r`. Each frame's origin (0, 0) is its mount point, and each has `muzzle` (or `muzzle-1` and `muzzle-2` for twin barrels) in `sprites.json`.
- **Mounts:** in Citadel units, and relative to the anchor.
  - **Left tower:** (40, 106), relative (−130, −128).
  - **Right tower:** (300, 106), relative (130, −128).
  - **Window:** (170, 150), relative (0, −84), drawn at scale 0.62 from the `c` frames, so it gets the Damage and Range loadouts too.
- **Reference:** `review/citadel/` shows the assembled keep.

## Walls and shock nets (autotiles)

- **Mask:** each wall or net tile picks its frame from a 4-bit mask of same-type neighbors: N = 1, E = 2, S = 4, W = 8. N is up-screen and E is right. For example, a wall with neighbors to the north and east uses `m3`.
- **Frames:** all are tile-centered (anchor (0, 0) = the tile center on the ground) and share one viewBox per type.

| Frame | Layer | Use |
|---|---|---|
| `wall/rail/m<0-15>` | ground | The wall's ground rail. |
| `wall/m<0-15>` | world | Posts and the hard-light panel. |
| `wall/charged/m<0-15>` | world | Charged-walls overlay (coils, sparks, crackling bolts). Draw it over `wall/m<n>` once Charged walls is bought. |
| `wall/dmg/m<0-15>` | world | Cracks for a wall below half HP. Draw it over the wall. |
| `shock-net/m<0-15>` | ground | The net. Adjacent nets join into one field. |

**How the 16 wall masks are built** (so the README's rule matches the art exactly):
- **Arms:** a tile draws a half panel toward each neighbor bit.
  - Straight cases use a full across or into wall: no neighbors (`m0`), E and/or W only (`m2`, `m8`, `m10`) are across; N and/or S only (`m1`, `m4`, `m5`) are into.
  - Corners, T-junctions and the cross (every other mask) draw a half panel per neighbor plus a post at the tile center.
- **Shared posts:** a post sits at the middle of each tile edge the wall reaches. A tile draws its N and W edge posts itself, and draws its E and S edge posts only when there's no neighbor on that side. So every shared post is drawn exactly once, by one of the two tiles.
- **Charged and damaged overlays** follow the same arms and posts, so they always line up with `wall/m<n>`.

**Nets:**
- **Joined field:** open sides get a border and an inset edge. Sides with a neighbor run the mesh and both charge lines to the tile edge, so the field reads as one.
- **Pegs:** only at convex outer corners.
- **Aligned pattern:** the mesh and charges are on a global grid, so they line up across tiles.
- **Discharges:** each tile still dims and flashes on its own (§7.1).

**Review:** `review/wall-autotiles.svg` and `review/net-autotiles.svg` show all 16 masks and a sample layout.

## Damage and destruction

- **Pulse turret:** `pulse-turret/dmg` (world) puts cracks on the plate and pedestal. One overlay works at every aim, and it shares the turret viewBox.
- **Mortar:** the rig's `cracks` part (optional group `damaged`).
- **Walls:** `wall/dmg/m<n>` (above).
- **Show damage below half HP** (§7.2).
- **Destroyed:**
  - `scrap-ours-1` to `-5` (gunmetal with dead amber, for structures and footmen; 1–2 are footman-sized, 3–5 structure-sized);
  - `scrap-theirs-1` to `-5` (violet-iron, for enemies);
  - `structures/citadel/rubble` (the collapsed keep in its footprint, same viewBox and anchor as the Citadel).
- Scrap anchors are their ground center.

## Effects

Anchors and orientation:
- **Projectiles:** `bolt`, `nanite-bolt`, `mortar-shell`, `bombard-shell`, `boulder` and `wasp-shot` are centered at (0, 0) and point along +x. Rotate them to the projected screen direction (§15.2). Shells and boulders sort by their shadow while arcing.
- **Muzzle flashes:** `muzzle-ours` and `muzzle-theirs` fan out along +x from (0, 0). Place them at a muzzle attach point, rotated to the aim.
- **Bursts:** `spark-ours`, `spark-theirs` and `heal-glint` (the white "+") are centered. `nanite-mote` is a single drifting mote.
- **`shock-crawl`:** anchor at the bottom center, about 40 × 40. Scale it to the slowed enemy's leg height.
- **`wall-strike`:** runs from (0, 0) to (100, 0). Scale x so it reaches the attacker, rotate to the attacker, and keep y scale at 1 so the bolt stays thin.
- **`deploy-beacon`:** the Ranger's build animation. Anchor (0, 0) is its ground point.
- **Thrown cells** use `structures/power-cell`.


## Status effects and indicators

All of these are on the effects layer unless noted. `review/status-effects.svg`, `review/stun-and-defense.svg` and `review/carry-pips.svg` show them in place.

- **Burn:** `burn-1` and `burn-2` (flames, alternate at about 8 fps). Anchor (0, 0) is the bottom center; place it on the enemy's body and scale it to the body height, like `shock-crawl`.
- **Poison:** `corrosion-1` and `corrosion-2` (amber nanite specks over dark pits), same placement and timing as burn.
- **Damage flash (code, no frames):** each burn or poison damage tick flashes the enemy's whole body to white for about 60 ms, the same flash as a normal hit.
- **Stun:** hide the enemy's emissive glow for the stun's duration, and loop `stun-1` … `stun-4` (three amber chevrons orbiting on a 0.6 ellipse) centered on the `top` attach point.
- **Overflow shield:** no world sprite. Show the `overflow-shield` icon next to that player's HP bar while the shield holds.
- **Tower defense bonus:** `defense-bonus` (world layer, drawn right after the tower) puts three amber shield pips on the front edge of the base plate. Its anchor is the tile center, so it shares the tower's anchor.
- **Carried cells:** `carry-pip` (filled) and `carry-pip-empty` (slot), ground layer, centered.
  - Shown only while the player carries at least one cell. Draw one slot per point of that player's carry cap (4 for most classes, 8 for the Artificer, §6), filled left to right.
  - Slots sit outside the player ring, on its front arc: slot `k` (0-based, of `cap`) is at angle `a = 90° + (cap − 1) × 7.5° − k × 15°` (screen space, y down), at `(cx + (rx + 8) cos a, cy + (ry + 4.8) sin a)` in sprite units, where (cx, cy) is the ring center and rx, ry its radii.
  - They stay put while the aim notch moves around the ring.

## Map

- **Layout:** follows SPEC §15.2 Map v1.
  - 36 × 24 tiles.
  - Citadel at cols 16–19, rows 0–1; repair zone at cols 17–18, row 2; Armory pad at col 22, row 1.
  - Lanes: bottom at cols 17–18, row 23; left at col 0, rows 11–12; right at col 35, rows 11–12.
- **Frames:** all on the ground layer, tile-centered unless noted.
  - **`ground/1` to `ground/4`:** stone with seams that make the build grid read. Use 1 for most tiles and 2–4 sparsely, chosen by a seeded hash of the tile.
  - **Edges:** `edge/n`, `edge/s`, `edge/e` and `edge/w` go on border tiles. `edge/ne`, `nw`, `se` and `sw` go on the corners. Skip edges on lane tiles.
  - **Lanes:** `lane/<bottom|left|right>-<open|sealed>`.
    - **Bottom:** anchored at the midpoint of the bottom edge between cols 17 and 18.
    - **Left and right:** anchored at the midpoint between rows 11 and 12, on their tile column's center.
    - **States:** open shows the breach with violet chevrons pointing in; sealed shows an amber hard-light gate (sealed lanes still need a spec rule).
  - **`decor/grate`, `plate`, `lines`, `crack`:** flat, non-blocking, never red or violet. Use them sparsely.
- **Review:** `review/map-sample.svg` shows a corner of the playfield.

## Other structures

- **Fortify:** `fortify/back` draws before the tower and `fortify/front` after it.
- **Armory:** `armory/pad` (ground) and `armory/kiosk` (world).
- **Rally flag:**
  - `rally-flag/ring` (ground);
  - `rally-flag/pole`;
  - `rally-flag/cloth` (tinted, nothing else in it);
  - `rally-flag/cloth-trim`.
- **Power cell:** `power-cell` (shadow is code-drawn).
- **Build ghosts:** footprints `build-ghost/valid` and `build-ghost/blocked` (ground). The see-through structure over the footprint is drawn by code.
- **Tile sizes:** the shared plate, walls, nets and map pieces are drawn on the full 80 × 48 tile. The mortar ring, Fortify dome, Armory and power cell come from the earlier art at the same scale, centered on their anchors.

## Glow

SVG glow filters are not used; amber `#e8a33d` and violet `#8f6bff` are picked up by the bloom pass (§15.2). Glow shapes sit in `class="glow"` groups or in `-glow` parts.
