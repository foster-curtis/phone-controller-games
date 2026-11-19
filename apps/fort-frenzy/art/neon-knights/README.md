# Neon knights art

Vector source art for Fort Frenzy's neon knights theme. The atlas script (SPEC §15.10) rasterizes every SVG outside `review/` and `icons/` into the TV atlases; `icons/` builds the phones' icon sprite. Art rules: SPEC §2.1, §2.4–§2.6, §3.6, §7.1–§7.2, §9.6. Rig contract: §15.2. All art is original work for this project (license: owned).

## Layout

| Path | What's in it |
|---|---|
| `rigs/<id>.json` | One rig per animated thing: `warden`, `ranger`, `commander`, `artificer`, `footman`, `drone`, `skitter`, `brute`, `bombard`, `wasp`, `mite`, `stalker`, `colossus`, `mortar`. |
| `characters/<id>/<view>/<part>.svg` | Knight and footman rig parts. The Ranger adds a pose folder: `characters/ranger/<view>/<pose>/<part>.svg`. |
| `enemies/<id>/side/<part>.svg` | Enemy and Colossus rig parts (one view, `side`). |
| `structures/...` | Structure and build frames (listed in `sprites.json`) and the mortar rig parts (`structures/mortar/side/<part>.svg`). |
| `effects/` | Projectiles, flashes, sparks, the heal glint, shock crawl, wall strike, deploy beacon, scrap piles and the redesign's build, slam, portal and Charge effects (listed in `sprites.json`). |
| `map/` | Ground tiles, playfield edges and corners, portals, the old lane entries (open and sealed) and flat decor (listed in `sprites.json`). |
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
  - **commander:**
    - `banner` is on while the flag is carried, off while it's planted or in flight.
    - `sword` (the drawn sword: `sword`, `sword-glow`, and `swordtip`, `swordtip-glow` in the back view) is off. Since the redesign the sword doesn't attack: the default look is the shield on the hand and the sword sheathed at the hip (`scabbard`, always on). The group stays so a later mode can bring the drawn sword back.
  - **artificer:** the backpack gauge is the **build meter** (REDESIGN §F5). One group per core state, `core1-full` … `core3-half`. Show at most one state per cell. Split the meter (0–1) into sixths, `k = floor(meter × 6)`: cell N shows full when k ≥ 2N and half when k = 2N − 1. All three cells full means the beacon is ready. The cells and slots are always on (§2.4).
  - **warden:** `slam` (front and back views: `hammer-down`, `hammer-down-glow`) is the same hammer standing on its short end, the striking face on the ground: the upright head turned 90°, plus its upper end face. At the slam's impact, switch `slam` on and hide `hammer` and `hammer-glow` until the hammer lifts again. The side view needs no swap: its hammer turns in the picture plane. Turn it so the head is vertical: with the slam clip's torso (rot 8) and gauntlet keys, `hammer` rot 64 (not 100) puts the striking face on the foot line.
  - **colossus:** `mk2`, `mk3`, `final`. Each add-on is listed under the tier where it first appears, so switch the groups on cumulatively.
  - **mortar:** `ii`, `iii`, `band1`, `band2`, `band3` (see Towers).

### Attach points

| Rig | Attach names |
|---|---|
| `artificer` | `badge`, `carry`, `lens`, `nametag`, `pack` |
| `bombard` | `muzzle`, `top` |
| `brute` | `fist`, `top` |
| `colossus` | `core`, `eye`, `fist-far`, `fist-near`, `spire-1`, `spire-2`, `spire-3`, `spire-4`, `spire-5`, `top` |
| `commander` | `badge`, `banner`, `carry`, `nametag`, `shield`, `sword-tip` |
| `drone` | `blade`, `top` |
| `footman` | `blade` |
| `mite` | `top` |
| `mortar` | `muzzle`, `muzzle-iii`, `top` |
| `ranger` | `badge`, `bolt`, `carry`, `nametag` |
| `skitter` | `core`, `top` |
| `stalker` | `eyes`, `top` |
| `warden` | `badge`, `carry`, `hammer`, `hammer-ground`, `nametag` |
| `wasp` | `muzzle`, `top` |

**Knights:**
- `nametag` and `badge` ride on the helm (`badge` is the super-ready badge spot).
- `carry` is where a cell is held or received. It's on the torso, except on the Artificer, where it's the pack.
- **Per class:**
  - **Warden:** `hammer` is the gravity coil, the slam origin. `hammer-ground` is the center of the striking face where it meets the ground: on `hammer` in the side view, on `hammer-down` in front and back. Place `slam-cracks` there at impact (see Effects).
  - **Ranger:** `bolt` is the shot origin, in both poses.
  - **Commander:**
    - `shield` is the shield boss, where the bash lands (impact sparks).
    - `banner` is the carried flag's top.
    - `sword-tip` rides on the `sword` group's blade, so it's only meaningful while that group is on.
  - **Artificer:** `lens` is the projector and `pack` is the throw origin.
- **Enemies:** `top` is the highest point of the always-on parts. The Stalker's `eyes` is where the target thread starts.
- **Colossus:** spires are numbered left to right. `spire-1`, `-2` and `-4` arrive at Mk II; `spire-3` and `-5` at Mk III.
- **Colossus view:** a true side view facing right, like every other enemy (mirror it to face left). Feet sit on y = 245; `foot` is (140, 245). The spires, their plumes and the back spikes are children of `yoke`, and the horns are children of `head`, so they stay seated on the armor when the yoke or head moves. The horns draw just before `head`, which hides their roots. `review/colossus/side-tiers.svg` shows all four tiers.

## Layers

- **Ground layer:** anything flat on the ground has its own frame here, drawn under everything that stands. That covers:
  - the base plate (`plate/tile`), wall rails, shock nets, build-ghost footprints, the Citadel plate and repair zone, the Armory pad and the rally-flag ring;
  - portals;
  - every effect ring and ground mark: `shield-base`, `beacon-pulse`, `mine-blast-ring`, `brute-target`, `shockwave`, `landing-dust`, `charge-dust`, `slam-cracks` and `slam-cracks-wide`.

  Rings sit under the build or knight they belong to, so they read as lying on the ground.
- **World layer:** upright things, y-sorted by anchor.
- **Effects layer:** flashes, sparks, glints, the shock crawl, the wall strike, the shield shimmer dome, the mine-blast burst, the Brute target arrow and the portal flare sparks (SPEC §15.2 layer 4).
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

**Redesign effects** (REDESIGN §F5). Anchor (0, 0) is the ground point unless noted. Rings are 0.6 ellipses; scale them uniformly to the radius in sprite units. `review/redesign/*.svg` shows each one in place.

| Frame | Layer | Use |
|---|---|---|
| `shield-base` | ground | Under an active shield generator: the dashed footprint the dome stands on (r 26). |
| `shield-shimmer-1` … `-3` | effects | The field dome over an active generator. Cycle at about 6 fps. Its foot follows the front of `shield-base`. |
| `beacon-pulse` | ground | The healing beacon's pulse ring (r 40), centered on the beacon. Scale it out to the heal radius and fade it. Add `heal-glint`s over the healed knights. |
| `mine-blast-ring` + `mine-blast` | ground + effects | A mine going off. The ring has r 34 (scale it to the blast radius); the burst sits on the mine. Both amber. |
| `brute-target` + `brute-target-arrow` | ground + effects | The Brute's lock-on flash. The ring and brackets go under the build (r 24, scale to the footprint). The arrow's anchor is its tip: place it a few units above the build's top. |
| `shockwave` | ground | The Ranger's super (it replaces the code-drawn pulse ring). r 60: scale it out from the Ranger to the hit radius and fade it. |
| `landing-dust` | ground | The Warden's jump-slam landing, at his feet (r 30). Also a small puff for the Colossus paw at about 0.55. |
| `slam-cracks` | ground | Fissures splitting out from a hammer hit (r 36). Anchor (0, 0) is the impact point: place it at the Warden's `hammer-ground` attach point at `SLAM_IMPACT_MS` and fade it out over about 1 s. |
| `slam-cracks-wide` | ground | The same for the jump slam's landing (r 60). |
| `charge-dust` | ground | The Colossus Charge trail. Anchor (0, 0) is its feet; the puffs trail toward −x (behind a right-facing Colossus; mirror it with the rig). |
| `portal-flare` | effects | Rising violet sparks over a flaring portal. Place it at the portal frame's `center` attach point. |


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
  - **Portals** (the redesign replaces lanes with 6 portals, REDESIGN §A2): `portal/<bottom|left|right>-<idle|flare>`.
    - **Anchor:** the same as the lane entries, the edge midpoint between the portal's two edge tiles. Every portal on the bottom edge uses `bottom-*`; every portal on a side edge uses that side's frames.
    - **States:** `idle` is a slow violet swirl in a violet-iron collar. `flare` (vortex lit, light column) shows for about 1 s before the portal spawns a group, with `portal-flare` at the frame's `center` attach point.
    - **Edges:** skip edge frames on portal tiles, as on lane tiles.
  - **`decor/grate`, `plate`, `lines`, `crack`:** flat, non-blocking, never red or violet. Use them sparsely.
- **Review:** `review/map-sample.svg` shows a corner of the playfield.

## Builds (redesign)

One build per knight (REDESIGN §C5, §F5). All frames are world layer, anchor (0, 0) = ground center; shadows, HP bars and the effect-radius ellipse are code-drawn. `review/redesign/builds.svg` shows every state.

- **Shield generator** (Warden, thrown): `shield-gen/<flight|landed|active|damaged|destroyed>`.
- **Healing beacon** (Artificer, thrown): `beacon/<flight|landed|active|damaged|destroyed>`.
- **States:**
  - `flight` is drawn upright: code spins and arcs it, with the shadow on the ground.
  - `landed` shows on touchdown, until it switches on.
  - `active` is the working state; `damaged` replaces it below half HP (§7.2). Code can flicker its glow.
  - `destroyed` is the wreck with its glow out. Show it briefly, then the usual `scrap-ours` pile.
- **Active extras:**
  - generator: `shield-base` under it and `shield-shimmer-*` over it;
  - beacon: `beacon-pulse` under it and `heal-glint`s.
- **Mine** (Ranger, placed at feet, up to 3): `mine/armed`, `mine/trigger`.
  - **Arming:** `armed` shows at full opacity for about 1 s after it's placed, then drops to 40% opacity once it's live ("translucent to players"). It's drawn to read at 40%.
  - **Trigger:** `trigger` is the short delay before it goes off, at full opacity. Then `mine-blast-ring` and `mine-blast` (Effects).
- **Rally flag in flight** (Commander's build): `rally-flag/flight-pole`, `flight-cloth` (tinted) and `flight-trim`, in that order. Anchor (0, 0) is the spin center: rotate all three together while it arcs, then switch to the planted frames below.

## Redesign poses (no new parts)

These come from code clips on the existing rigs. `review/redesign/motion.svg` shows sample keys.

- **Warden jump slam:** crouch, airborne and land in all three views.
  - Crouch scales `frontleg`/`backleg` (side) or `legs` (front, back) to about 0.74 in y and drops the torso.
  - Airborne lifts the torso about 34 units, with the hammer raised. The shadow stays on the ground.
  - Land reuses the main slam's impact pose, with `landing-dust` at the feet and `slam-cracks-wide` at the `hammer-ground` point.
  - **Every view hits on the head's short end:** front and back swap to the `slam` group (not a negative y-scale of `hammer`, which flattens it). Side: `hammer` rot 64 under the torso's 8°.
- **Colossus Charge tell:**
  - `yoke` rotates down about 12° and drops about 10 units, so the spires point forward.
  - `head` drops in front of it.
  - `leg-near` paws back (rotate about 16° and lift).
  - The run adds `charge-dust` at the feet. The red lane marker is code.

## Other structures

- **Fortify:** `fortify/back` draws before the tower and `fortify/front` after it.
- **Armory:** `armory/pad` (ground) and `armory/kiosk` (world).
- **Rally flag:**
  - `rally-flag/ring` (ground);
  - `rally-flag/pole`;
  - `rally-flag/cloth` (tinted, nothing else in it);
  - `rally-flag/cloth-trim`.
  - In flight: `rally-flag/flight-*` (see Builds).
- **Power cell:** `power-cell` (shadow is code-drawn).
- **Build ghosts:** footprints `build-ghost/valid` and `build-ghost/blocked` (ground). The see-through structure over the footprint is drawn by code.
- **Tile sizes:** the shared plate, walls, nets and map pieces are drawn on the full 80 × 48 tile. The mortar ring, Fortify dome, Armory and power cell come from the earlier art at the same scale, centered on their anchors.

## Glow

SVG glow filters are not used; amber `#e8a33d` and violet `#8f6bff` are picked up by the bloom pass (§15.2). Glow shapes sit in `class="glow"` groups or in `-glow` parts.
