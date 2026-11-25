# Fort Frenzy — Spec

Co-op **players-only wave defense** for 1–6 players. Phones are controllers; the shared screen (TV or
laptop) runs the game. The knights are the only defense of the Citadel: there are no towers or walls,
and each knight carries a temporary **build** that controls the arena. This file records the decisions
made so far. Items deferred past v1 are in §13; items still open are in §14.

**Status:** redesigned 2026-11 from co-op tower defense (the tower-defense build is the git tag
`fort-frenzy-td-final`). `REDESIGN.md` is the decision record for the redesign (groups A–G); this spec
states the result on its own, and where the two ever disagree, `REDESIGN.md` wins until the redesign
ships. §1–§14 are the game design; §15 is the technical design and its decision log (rows #58 onward
are the redesign). The migration is planned in `REDESIGN_BUILD_PLAN.md`; `BUILD_PLAN.md` is the
finished tower-defense plan, kept as history. Names in this spec (`ranger`, `grunt`, and so on) are
code ids; the player-facing names are in §2.1.

---

## 1. Platform (settled, shared across all games)

- Same-room play only.
- Host-authoritative: the host browser runs the full simulation and rendering.
- Phones send input state only (stick vectors + button bits), at a fixed rate with an idle heartbeat
  (§11.4).
- Shared, game-agnostic relay (Fly.io), WebSockets first. Rooms in memory, namespaced by game ID.
- Fort Frenzy's wave and upgrade systems are the foundation Dungeon Crew will evolve from, so keep them
  reusable.

## 2. Core identity

- **Players are the defense.** Nothing defends the base except the knights and the Citadel's sentry
  guns (§3.5).
- **Builds are tactics, not infrastructure.** Everything a knight places is temporary and exists to
  control the arena: slow, stun, pull, block, heal, buff or draw fire (§7).
- **Any knight can hold a side,** including alone in solo play.
- **Action-first.** Every player controls one knight (twin-stick action). There is no separate
  on-screen cursor: at-feet builds go down where the knight stands, and thrown builds aim with the
  build button's stick (§10.1).
- **Balance rule:** every knight's solo clear rate (one knight, alone, against a standard group from
  one portal) is within **±20–25%** of every other knight's. It is checked by timing each knight alone
  against the same wave (the balance harness, §15.9) and in playtesting. No knight is the team's damage.
- **Class = playstyle, knight = method.**
  - A **class** is a general focus: tank, marksman, support or control (§8.1). It sets an **HP tier**,
    a **damage band** inside the ±20–25% rule (the support sits toward the low end and makes up for it
    with healing) and its **per-wave growth** (§6.1).
  - A **knight** is one character in a class. It sets everything else: how it attacks, its super, its
    build and its passive card. Two knights in the same class do the same job in different ways.
  - v1 ships **one knight per class:** Warden (tank), Ranger (marksman), Artificer (support) and
    Commander (control). Classes and knights are modeled separately in data, so more knights per class
    is content, not code (§13).
- **Design principle: roles amplify, never gate.** Any team, including one knight alone, must be able
  to play a full run. Every enemy type must be answerable by at least two classes or by a baseline that
  every team has (§9).
- Classes are picks, not required slots. Duplicate knights are allowed.

### 2.1 Look: neon knights

The game has **one look, neon knights** (tech-medieval): classic fantasy shapes, but every ability comes
from technology, not magic: powered armor, rail-bows and nanites. The look is clean sci-fi armor with
glowing lines: dark backgrounds, bold silhouettes and emissive accents, which give strong contrast on a
TV. There is no theme layer: code ids are the knights' names, and every other display name comes from
one table (§15.4). v1 is built directly with this art; there is no placeholder greybox phase.

- **Players and their builds glow amber,** matching the fostercurtis.dev brand amber (`--amber`,
  `#e8a33d`, in the brand kit, §2.3). Every knight's armor glows amber, as do the builds, the squad and
  the Citadel core.
- **The Iron Tide glows violet** (`--hostile`, `#8f6bff`). Amber against violet sits on the yellow–blue
  axis, which the common red–green forms of color blindness preserve, and the two also differ strongly
  in lightness. (Changed from cyan on 2026-10-26: violet keeps the enemy glow clear of the blue and
  green player colors.)
- **Red is reserved for danger:** ground markers for incoming attacks, the Colossus Charge lane and
  low-HP warnings. Neither side uses red as its main glow.
- **Player identity** (every knight glows amber, so identity never rides on the glow). Three layers,
  from most to least important:
  1. **Ring (primary):** a thin outline ellipse under the feet in the player's color (at the 0.6 ground
     ratio, §2.5), never a filled disc, so it never reads as a red ground danger marker. A small notch
     on the ring points in the aim or facing direction. At-feet builds land at the ring's center (§7).
  2. **Color part on the helmet (secondary):** each knight carries the player's color on its helmet,
     each in its own shape: the Warden's crest, the Ranger's feather and the Commander's horsehair
     plume, and the Artificer's painted crown cap and lens bezel. The color part is drawn as a separate
     grayscale layer tinted at runtime, so one sprite sheet serves every color.
  3. **Name and HP bar, above the sprite:** white Geist 600 with a thin ink outline, HP bar directly
     under the name. Above, because the feet already carry the ring, the aim previews and danger
     markers. Near the top edge of the map (by the Citadel) the label flips below the sprite.
- Player colors (assigned on join, §11.1) must stay distinct from amber, enemy violet and danger red
  (palette in §2.3).

Display names (the one table, `src/presentation/shared.ts`, §15.4):

| Code id | Display name | Visual |
|---|---|---|
| `base` | Citadel | A citadel with a glowing power core |
| `warden` | Warden | Heavy knight with a gravity hammer (class: tank) |
| `ranger` | Ranger | Ranger with a rail-bow (class: marksman) |
| `artificer` | Artificer | Artificer with a nanite projector (class: support) |
| `commander` | Commander | Knight-captain with a shield, leading a squad of automaton footmen (class: control) |
| `shield_gen` | Shield generator | Thrown emitter that projects a damage-reducing field (Warden's build) |
| `mine` | Mine | Translucent proximity mine (Ranger's build) |
| `beacon` | Healing beacon | Thrown beacon that heals knights around it (Artificer's build) |
| `rally_flag` | Rally flag | Thrown flag the squad gathers at (Commander's build) |
| archers (`archer_*` shop items) | Sentry guns | Wall-mounted sentry turrets |
| `grunt` | Drone | Drone soldier |
| `runner` | Skitter | Scuttler bot |
| `brute` | Brute | Heavy siege mech |
| `siege` | Bombard | Long-range artillery walker |
| `flyer` | Wasp drone | Hover drone |
| `swarm` | Scrap mites | Swarm of small bots |
| `hunter` | Stalker | Stalker bot |
| `colossus` | Colossus | A giant walker mech with a glowing core in its chest |
| `faction` | The Iron Tide | The machine army |

Enemy code ids stay as they were; only the knights' code ids took their display names (§15.11 #92).

### 2.2 Difficulty

- Difficulty is chosen on the TV home screen: **Easy, Normal or Hard.** All three are in v1, and
  **Normal is the default.**
- Difficulty multiplies existing config values:
  - wave budget
  - enemy HP and damage
  - base HP
  - coin income
  - **respawn time** (starting values: Easy 0.8, Normal 1, Hard 1.2; §5)
- **Order of application:** difficulty × player-count table (§9.4) × the wave's own enemy multiplier
  (§9.3). Enemy HP and damage are baked in at spawn, never applied per hit. Starting values are set in
  playtesting (§14).
- The resume snapshot (§11.5) stores the run's difficulty.

### 2.3 Branding (settled)

Domain: `fort-frenzy.fostercurtis.dev`. Branding is in v1, from the brand kit:
`src/styles/brand.css` (every visual token as a CSS custom property), `brand/` (SVG marks and the
`<head>` snippet) and `public/` (favicon, PWA icons, manifest). Same layout as Sunny Side's kit;
`src/shared/theme.ts` mirrors `brand.css` for the renderer, with a parity test. (`theme.ts` is the
brand-token mirror, not a theme pack; it keeps its name.)

- **Family core, unchanged:** ink `#14161a`, paper, amber `#e8a33d`, gray, and the shared dark surface,
  border and muted values, identical to fostercurtis.dev, Sunny Side and World Conquest. Body text is
  Geist; room codes are JetBrains Mono.
- **Mark ("the keep"):** a white crenellated tower on the ink rounded tile with a lit amber gate whose
  light spills onto the ground. Same grammar as the family marks: ink tile, white object, one amber
  point. A pixel-snapped 16 px version (`mark-small.svg`) feeds the `.ico`.
- **Signature treatment:** chamfered (cut) corners and amber glow. No tilt and no hard offset shadow
  (Sunny Side's move). Glow is applied with `filter: drop-shadow`, since chamfers use `clip-path`.
- **Color rule:** amber glow means ours (player armor, builds, the squad; in the UI, ready, selected
  and active states). Violet glow means the Iron Tide. Red means danger only.
- **Display face:** Chakra Petch 700, uppercase, slight tracking. Its chamfered terminals match the UI
  shape.
- **World tokens:** `stone` `#262b33` for panels and map ground, `stone-edge` `#3a404b` for edges,
  `ember` `#ffd08a` for glow cores, `hostile-core` `#c7b4ff` for enemy glow cores.
- **Player colors (6):** cobalt, jade, sky, bone, rose and forest, from the shared family palette.
  Crimson (too close to danger red) and berry (too close to violet) are left out. Because every knight
  glows amber, player identity shows on nametags, rings and armor accents (for example plumes), never on
  the glow itself.
- All assets must be commercially licensed. Chakra Petch, Geist and JetBrains Mono are OFL.

### 2.4 Character art (settled)

The art is in `art/neon-knights/` (§15.10); its `README.md` holds the per-frame details. The rules:

- **View:** oblique three-quarter top-down, defined exactly in §2.5. Every part shows its top face
  above its front face.
- **Facing (4 directions):** each knight and each footman has three body views: side (mirrored for left
  and right), front (facing the camera) and back. A unit faces where it's aiming while attacking and
  keeps that facing until the attack's clip ends (main, super, mine kneel and build throw, whatever it is
  moving toward), and otherwise faces where it's moving; it picks the view from the stronger axis, with a small dead zone so it
  doesn't flicker on diagonals. Attack arcs, the aim line and the ring notch still rotate a full 360°.
  Enemies use the side view only (mirrored) in v1; back views for common walkers are a v2 candidate.
  The Artificer's backpack gauge only needs to read in the side and back views.
- **Method:** vector cut-out rigs. Each character is a set of separate SVG parts (legs, torso, helm,
  color part, weapon, glow pieces) that code moves, rotates and scales to animate. The color part is
  tinted per player. Each part's amber glow is its own piece (`<part>-glow`), drawn right after that
  part and moving with it, so glow follows a swinging limb and never shows through what covers it; the
  bloom picks it up, and code can brighten or pulse it during attacks (§15.11 #21).
- **Readability:** every part has a dark ink outline; armor is cool gunmetal steel lit by amber seams.
  Each knight has a distinct silhouette, helmet and color-part shape, so knights are recognizable at
  TV size before color is read.
- **Alignment and layering:** every attached part (spikes, horns, studs, plumes, ears, fins, emissive
  seams) sits on the edge or surface it belongs to; glows never cross onto a different part. Limbs
  attach under the body: far-side parts are drawn behind it, and near legs tuck under the body rather
  than overlapping it from above. Groups (Scrap mites, squads) draw back-to-front by depth.
- **Full-size parts:** every part is drawn complete and at full size in every view, then layered, even
  where another part hides most of it (a bow behind the body, a draw arm behind a cloak, the hand that
  isn't holding anything). Animation can then move any part into view without it looking cut off or
  disconnected. Straps and belts run edge to edge across the body so they read as wrapping around it.
  In the back view the backpack (the Artificer's) is the top layer, since it's nearest the camera.
- **State on the body:** class mechanics show on the sprite, not only in a HUD: the Ranger's bolt
  brightens with Steady Aim, the Commander's banner leaves his back when the flag is out, and the
  Artificer's backpack gauge is his **build meter** (three cells fill as the meter charges; all three
  lit means the beacon is ready).
- **Shared animations:** hit (white flash, small lean), down (the emissive dims to gray, then every
  piece of armor falls to the ground into a pile with some scrap and stays there for the down timer;
  respawn countdown where the name was) and respawn (assemble, unhurried, in a column of amber light at
  the base) are the same for every knight (§15.11 #35). Walks swing each leg on its own in every view:
  side legs bend on the forward swing, front and back legs step toward and away from the camera and
  trade which one is drawn in front each step.
- **Healing visuals:** all healing is amber (it's ours), marked with small white "+" glints. Never
  green, since jade and forest are player colors.
- **Throws:** a thrown build or soldier leaves from the knight's hand (the Artificer's `pack`), arcs
  with its own ground shadow and lands at the aimed spot; code draws the arc, spin and shadow.

**Warden (neon knights):** widest and squattest silhouette; closed great helm with a glowing amber
T-visor; front-to-back crest plume (crest shape is Warden-only); gravity hammer with the head centered
on the haft and an amber gravity coil at the center of the head, which brightens during the slam
wind-up. Amber seams: chest chevron, power core, belt, pauldron trim, knee.
Animations: idle, walk, main (hammer smash toward the aim; at impact the `slam` group swaps in the
hammer standing on its striking face, with no ground cracks (RC1: those are the super's); while aiming
the TV shows its cone, §10.1), super (**jump slam**, about 1.35 s: crouch, an airborne wind-up with the
hammer raised and the shadow left on the ground, then at 1.1 s the landing hits with the same impact
pose, `landing-dust` at his feet and `slam-cracks-wide`; RC2, #125), throw (the shield generator).

**Ranger (neon knights):** tall, narrow silhouette with a dark cloak behind and the bow in front;
sallet helm with a narrow amber goggle slit; one long swept-back feather plume (feather shape is
Ranger-only); recurve rail-bow with amber rails on both limbs, an amber string and a glowing bolt.
The bolt and rails brighten in steps while Steady Aim builds (when he owns the Steady Aim card). A dark
leather quiver strap runs shoulder to hip with amber studs (the bowstring is the only amber line on
him); amber knee; quiver bolts glow at the tips.
**Two poses in every facing:** standing (idle and walk: bow lowered in the bow hand, string relaxed and
straight, draw arm at his side) and ready (Steady Aim and firing: string drawn to the hand, bolt nocked;
from the front the bow is aimed at the camera, from the back the draw elbow rises past the cloak).
Animations: idle, walk (quicker, lighter cadence than the Warden), Steady Aim (blends from standing to
ready), main (longbow shot: he draws the string back, holds, and lets go with a string snap; the bolt
leaves from the bow at the release, with an amber tracer; §15.11 #39), super (**shockwave**: the
`shockwave` ring rolls out from him, sized exactly to the hit circle), place a mine (kneel and set it
at his feet).

**Commander (neon knights):** medium build; armet helm with an amber circlet across the brow (the only
helm with a "crown"); horsehair plume that arcs up and back, then falls behind the helm (Commander-only
shape); amber diamond rank badge on the chest. He fights with a **shield** on his arm (`shield`,
`shield-glow`) and wears his sword sheathed at the hip (`scabbard`, `scabbard-glow`); the drawn sword
stays in the rig as the optional group `sword`, off in v1. The rally flag rides on his back as a banner
while it isn't out; throwing it moves it into the world, so "following" vs "holding" is visible at a
glance.
Animations: idle, walk, main (**shield bash** toward the aim: a short lunge with the shield, impact
sparks at the `shield` point; while aiming the TV shows the bash rectangle filled, §10.1), super
(**Reinforcements**: he throws a footman a short distance, which lands and joins the squad; "×2" pops
over the soldiers on a Rally Cry double spawn), throw flag / recall. Morale (the card) has no visual of
its own.

**Automaton footmen:** about half the Commander's height; amber eye; mini plume swept back in their
Commander's player color; straight blade, fully amber, with a dark crossguard. No ring and no name.
Animations: march, short stab, thrown (tucked, arcing with a shadow), collapse into scrap and fade.

**Rally flag:** the flag cloth is in the Commander's player color (a second tinted part), so two
Commanders' flags and squads are never confused; a planted flag has an amber ring at its base. In
flight it spins as `rally-flag/flight-*`.

**Artificer (neon knights):** medium build with a boxy power-cell backpack, the only knight wider at
the back than the front; rounded helm with a single round amber lens; no plume: his color is a painted
crown cap and a bezel ring around the lens (the bezel deliberately breaks the helm's outline);
arm-mounted nanite projector with an amber lens and a drifting cloud of amber nanites; amber hexagon
(nanite cell) emblem on the chest, never a cross; tool pouches on the belt; amber knee.
**Backpack gauge = build meter:** three cells that fill bottom-up. Split the meter (0–1) into sixths,
`k = floor(meter × 6)`: cell N shows full when k ≥ 2N and half when k = 2N − 1. All three full means
the beacon is ready.
Animations: idle, walk, main (**nanite blast**: about 5 nanites fly to random spots in a narrow cone
over about 0.8 s), super (wide amber nanite heal cone; healed knights get white "+" glints), Field
Medic (when he owns the card: a faint dotted amber ground circle, never filled), throw (the beacon
leaves from the `pack` point).

### 2.5 Perspective and projection (settled)

Every sprite, build, effect and UI element drawn in the world follows one projection: oblique
three-quarter top-down (as in Zelda or Stardew Valley). Nothing is drawn straight from above, and
nothing is drawn as a flat front view with no top.

**The rule**
- **Ground is squashed vertically by 0.6.** Everything lying on the ground is drawn at width × 0.6
  depth: tiles, build footprints and effect radii, player rings, red danger markers, area-of-effect
  rings, shockwaves, auras, blast rings and shadows.
- **Uprights keep full height and show a top face.** On chamfered shapes, the angled band above the
  front face is the top face: shade it lighter and draw a thin crease where it meets the front. Boxes
  get a top rectangle; cylinders and rings get an elliptical top at 0.6; domes and spheres sit in a 0.6
  base ellipse or socket.
- **Shading:** tops lightest, fronts mid, left side darkest, light from above and slightly right.
  Knights and builds: tops #7d8798 or #5c6676, fronts #4a5362, shade #3c4452. Iron Tide: tops
  #6a5f8f or #4a4068, fronts #3a3150, shade #2a2340.
- **Shadows:** a 0.6 ellipse sized to the footprint and centered on it (not on the bottom edge of the
  feet). Knight about 22 × 13 in sprite units; Colossus about 60 × 36.
- **Height:** anything off the ground keeps its shadow on the ground directly beneath it; the gap
  between object and shadow shows its height (Wasp drones, Bombard shells, boulders, thrown builds and
  soldiers, launched Skitters, the Warden mid-jump).
- **Draw order:** sort by foot point (lower on screen is drawn in front). Flyers and arcing
  projectiles sort by their shadow. Groups draw back-to-front.

**Grid and scale:** a tile is W wide and 0.6 W deep on screen. On the 1920 × 1080 logical canvas,
W = 48 px (48 × 28.8). Characters are about 1.6 W tall (about 77 px). Art is authored with a tile of
80 × 48 sprite units.

**Implementation:** the sim stays in square tile coordinates with circular hitboxes. Only the renderer
projects: screen y = world y × 0.6 − height. Hitboxes, ranges and AoE are drawn as 0.6 ellipses of the
same circles the sim uses, so what players see always matches what hits.
**Enemy bodies (C4):** a part drawn h tiles above an enemy's feet covers the ground h / 0.6 tiles up the
screen, so for our attacks an enemy's hitbox is its feet circle swept up the screen over its drawn body
(a capsule on the ground, §9, §15.3). An aim line or cone that crosses the drawn body, head included,
hits; feet circles still walk, collide and take enemy attacks.

### 2.6 UI art (neon knights)

- **Icons: lit badge.** A solid bone glyph (24-unit grid) with ink cut-ins and amber parts that glow,
  set inside a chamfered gunmetal tile. The tile carries the state: rest (gunmetal edge), active,
  selected or ready (amber edge with glow), dimmed (glyph at 35%, e.g. the build button while its meter
  charges). Where space is tight (TV announcements, wishlist rows, inline text) the glyph is used
  without the tile. Knight badges are the knights' helms, so a knight looks the same everywhere.
- **Icon files:** `art/neon-knights/icons/<id>.svg` with `.glyph` and `.glow` groups, plus
  `badge-tile.svg` and `badge-tile-active.svg`. Every file on disk is in exactly one of the three lists
  below (73 icon ids plus the two tiles); the manifest test checks the disk against them (§15.9).
- **In use (51):**
  - knights: `class-warden`, `class-ranger`, `class-commander`, `class-artificer`
  - classes: `role-tank`, `role-marksman`, `role-support`, `role-control`
  - main attacks and supers: `main-<knight>` and `super-<knight>` for each knight (8)
  - build button (§10.1): `act-shield` (Warden), `act-mine` (Ranger), `act-beacon` (Artificer),
    `act-flag` (Commander, throw a flag), `act-recall` (Commander, recall the flag); dimmed to 35%
    while the meter charges
  - upgrade-card marks (§6.1): `card-vitality`, `card-might`, `card-haste`, `card-reach`,
    `card-swiftness`, `card-focus`, `card-toughness`, `card-recovery`, `card-tinkerer`,
    `card-attack`, `card-super`, `card-passive`, `card-build`, `card-effect`, `card-hunter`,
    `card-ally`, `card-squad`, `card-combo`
  - lobby and status: `leader` (the party leader's mark), `overflow-shield` (beside a player's HP bar
    while the Overflow shield holds, §6.1), `reconnecting` (on a disconnected player's TV nametag,
    §11.3)
  - shop and HUD: `coins`, `ready`, `request`, `repair`, `base-hp`, `base-armor`, `sentry-damage`,
    `sentry-range`, `sentry-third`
- **On file, unused (15; the build idea pool and dropped shop items, kept in the atlas):** `turret`,
  `mortar`, `wall`, `net`, `fortify`, `turret-rate`, `mortar-radius`, `tower-hp`, `wall-hp`,
  `charged-walls`, `net-charges`, `act-place`, `emergency-kit`, `squad`, `card-supply`.
- **Removed outright (7; deleted in RD12 with the rest of `review/redesign/obsolete.md`'s "Removed
  outright" list):** `cell`, `act-pickup`, `act-deliver`, `act-buy`, `act-throw`, `act-give`,
  `act-drop`.
- **TV HUD layout (combat):** a thin top band split three ways: wave and phase top-left, base HP bar
  centered directly above the Citadel, team coins top-right. The boss bar runs along the bottom edge.
  Purchase announcements stack bottom-left (glyph + text, a bar in the buyer's color). During the build
  phase the wishlist shows on the right. Everything stays inside the 96 px TV-safe margin. There is no
  build-ready indicator on the TV (the meter lives on the phone).
- **World HP bars (code-drawn):**
  - **Enemy HP bars:** shown only once damaged (hidden at full HP); a thin bar above the sprite with a
    violet fill (violet = enemy; red stays for danger markers); width scales with enemy size. Scrap
    mites have none. The Colossus keeps its bottom-edge boss bar instead.
  - **Build HP bars:** the same rule, with an amber fill, for HP builds (§7).
- **Phone buttons:** round, at the §10.1 sizes, gunmetal fill with a gunmetal edge, the action icon
  inside. The super's charge is a ring that fills clockwise and pulses amber when full; the build
  meter is a ring that fills clockwise and turns a **steady** amber when full (no pulse), so the two
  read differently. The stick is round.
- **Phone screens:** join (code prefilled from the QR, name, one button); knight select (swipeable
  cards: the knight's front view in the player's color, class with its `role-*` badge, main, super and
  build with tap/aim, passive card); lobby (big Ready, lineup with color, knight helm and ready state,
  and the `leader` mark beside the party leader; the party leader also sees difficulty and Start);
  combat controller with a status strip (HP and base HP); **card pop-up** (full screen, no stick: the
  class growth header, three cards, Confirm, the phase timer; §10.2); **shop** (right 2/3 of the
  screen with the movement stick on the left third: team coins, team shop rows with price,
  hold-to-confirm fill on big buys, Request and "Requested by" tags, Ready at the top right; §10.3);
  down (respawn countdown only); reconnecting overlay; end of run (party leader's three options).
- **Upgrade cards:** chamfered portrait cards; common has a gunmetal frame, rare a double amber frame.
  Each card shows its category mark (§6.1).
- **TV screens:** home (keyboard and gamepad: the focused row is lit amber, ◂ ▸ change difficulty,
  "Resume wave N" only when a snapshot exists); lobby (URL, large mono room code, QR, six slots showing
  each knight's front view in the player's color with a name band, knight and ready state; open slots
  dashed); combat HUD (see above; the Stalker's lock-on flash is world UI, and a ready super shows as an
  amber pulse on the knight's ring, §10.1); low-HP alarm (red vignette and "Citadel under attack" under
  the base bar); build-phase HUD (the phase timer replaces COMBAT; the next-wave preview takes the boss
  bar's place at the bottom with enemy portraits and counts, a newly introduced type framed in violet,
  and **never the hot side**, §9.4; ready status and wishlist on the right); victory and defeat summary
  (banner over the keep, run stats, one award card per player in their color).
- **Portal flare:** about 1 s before a portal spawns a group, it flares (its `flare` frame plus the
  `portal-flare` sparks, §3.1). It shows where something is about to appear, never the wave's pattern.

## 3. Map, base and camera

### 3.1 Map
- The base sits on the **top edge** of the map, centered, with its gate facing down-field. In the §2.5
  view, tall sprites hide what's drawn behind them (above them on screen). At the top, the Citadel only
  hides off-map space, and players see its gate rather than its back.
- **v1 has one map, an open field** of 36 × 24 tiles (§15.2) with **6 fixed portals**: 2 on the bottom
  edge and 2 on each side edge. Side portals sit on the **lower two-thirds** of their edge, so nothing
  spawns within a few tiles of the Citadel. Positions (a starting layout to tune in `map.ts`, §14):

| Portal | Side | Tiles |
|---|---|---|
| `bottom-w` | bottom | cols 9–10, row 23 |
| `bottom-e` | bottom | cols 25–26, row 23 |
| `left-n` | left | col 0, rows 11–12 |
| `left-s` | left | col 0, rows 18–19 |
| `right-n` | right | col 35, rows 11–12 |
| `right-s` | right | col 35, rows 18–19 |

- A **side** is the 2 portals on one edge: `left`, `bottom` or `right`. Sides matter for the hot side
  (§9.4).
- **Every portal is live from wave 1.** There are no lane unlocks and no sealed entries; new enemy
  types carry the progression instead. Enemies spawn just outside the edge at a portal and walk in.
- **Portal look:** a slow violet swirl in a violet-iron collar on the map edge (`map/portal/<side>-idle`;
  bottom-edge portals use the `bottom-*` frames, side portals their side's). About 1 s before it spawns
  a group it **flares** (`<side>-flare`: vortex lit, a light column, `portal-flare` sparks).
- **No walls in v1.** Nothing a knight places blocks movement, and the v1 map has no blocked tiles.
  The map format keeps a `blocked` tile kind and flow fields price terrain, so v2 maps with permanent
  walls are map data, not new systems (§13). Balance watch: an empty field can feel flat; a few small
  blocked props are a data-only fix if playtests say so.

### 3.2 Camera
- **v1: fixed camera showing the whole map.** Every player is always on screen, and there is no camera
  logic.
- Because nothing scrolls, the map must stay readable on a TV from across the room. This limits map
  size.
- A dynamic camera is planned for v2 (§13).

### 3.3 Base HP and damage
- The base has a **single HP pool**, shown as a bar at the top of the TV, directly above the Citadel.
  The HUD leaves about 3 tiles of screen headroom above the Citadel's footprint for its keep, core and
  smoke plumes (§3.6).
- **Visual damage stages:**
  - 66%: cracks
  - 33%: fire
  - 10%: heavy smoke
- **How enemies damage the base:**
  - Most enemies stop at the base and attack it continuously, so players can still run back and save it.
  - **Runners** deal one burst of damage on contact, then die.
  - **Siege** enemies shell the base first whenever it is in range (§9).
- Attacks that used to target towers (Siege shells, the Colossus's boulder throw) now target players.
- **Feedback:**
  - The HP bar flashes on every hit, and the screen shakes slightly on big hits.
  - At 25% HP, an alarm sounds and a red tint appears around the TV edges.
  - Base HP is also shown in each phone's status strip.

### 3.4 Repair
- There is no passive base regeneration. Damage is permanent unless the team pays to repair it.
- **Repair comes only from the team shop** (§6.2): anyone can buy it in the build phase, paid from team
  coins, at a price that rises with each purchase. There is no other repair source.

### 3.5 Sentry guns
- **2 sentry guns** (code: archers) are always present. They are part of the base and can't be killed
  separately. They are what slows a front nobody is covering.
- They target the nearest enemy in range, **including Flyers**.
- **Shop upgrades, buyable by anyone:** three independent one-time purchases, in any order (§6.2):
  - Damage
  - Range
  - A third sentry

### 3.6 Citadel art (neon knights, settled)

- **The brand keep, built:** the Citadel is the favicon in 3D: a crenellated keep with a lit amber gate,
  flanked by curtain walls and two corner towers. Footprint 4 × 2 tiles centered on the top edge, gate
  facing down-field. Stone-gunmetal fronts, lighter tops, amber glow seams; drawn per §2.5.
- **Layering:** the core and tower sentries stand on the roof top faces and are drawn before the front
  ramparts (merlons), so the ramparts overlap their bases.
- **Power core:** a glowing amber sphere in a three-prong cradle on the keep's roof, the brightest point
  on our side. It flickers on every hit and dims at the lowest damage stage.
- **Sentry guns (§3.5):** one swivelling unit per tower: a drum head on a fixed pedestal, with the
  barrel coming out of an amber-ringed collar. The head is modeled in 3D and projected per §2.5 so the
  drum, collar and barrel always line up (pre-rendered frames, not a separately rotated barrel). Five
  aim frames: left, down-left, at camera, down-right, right (the window sentry uses at camera). A
  sentry snaps to the frame nearest its target. Damage swaps in twin barrels; Range adds a laser scope
  on top of the collar with a fading amber sight line; both can stack (4 loadouts × 5 aims). The third
  sentry leans out of a window above the gate, so it never blocks the core. Sentries fire amber
  tracers, including at Wasp drones.
  Mounts, in Citadel sprite units (anchor (170, 234), the front-center of the footprint): left tower
  (40, 106), right tower (300, 106), window (170, 150). The window sentry uses the at-camera frames at
  0.62 scale, so it takes the Damage and Range loadouts too. Draw order: body, glow, core, corner
  sentries, ramparts, window, window sentry, then the damage overlays.
- **Damage stages (§3.3), cumulative:** 66% cracks (each crack drawn individually, with its own length,
  angle and branches, never one shape repeated; broken glow seams, a fallen merlon, rubble at the wall
  base); 33% adds fire (flames on the keep and walls); 10% adds heavy smoke (tall plumes that pour
  upward and flicker, dimmed core and gate). Stages reverse as HP is repaired back over each threshold.
- **Animations:** hit (core flickers, keep shakes, HP bar flashes); siege shells (red landing marker on
  the footprint first); shop repair (an amber wave over the whole Citadel); low HP at 25% (core pulses
  with the alarm); destroyed (core implodes, glow cuts out, keep collapses into its footprint, ending on
  the rubble frame with a dull core).
- The Citadel's ground plate is its only ground frame (the TD build's pads at the gate are removed,
  §2.6, §15.10).

## 4. Run structure

- **Fixed run of 15 waves.** Bosses at waves 5, 10 and 15. Target length is about **20–24 minutes**,
  including build phases (tune in playtesting).
- **Loss:** the team loses when the base reaches 0 HP. The base plays a collapse animation, then the
  summary screen appears.
- **Win:** the run is won when the wave 15 boss is defeated. A victory screen appears, then the summary
  screen.
- **Summary screen:** shows waves survived and per-player stats with one award card per player
  (§15.6 `RunStats`: damage dealt, boss damage, kills, damage taken, deaths, healing done, builds
  placed).
  - **Feedback (#57):** a QR to the feedback form pre-filled for this game in the top-right corner
    (PLATFORM decision #11); every phone's summary has **Give feedback**, which opens it in a new tab.
- **End-of-run options** (chosen by the party leader's phone, §11.1):
  1. **Play again** (default): every player keeps their knight and goes straight to Ready.
  2. **Change Knight:** players return to knight select (they choose a knight, not a class).
  3. **Return to home:** the TV goes back to the pre-lobby home page. The room closes, and players
     rejoin through a new room code.
  - (FF14) Play again marks every connected player Ready in the lobby, so the 3-second countdown
    starts at once. Return to home removes every phone from the room (they show "The TV went home"
    with a button back to the code screen) and forgets the room, so the next Create gets a new code.
- The resume snapshot (§11.5) is cleared when the run ends.
- **Wave flow:** combat ends → **card pop-up** (full screen on each phone; a private pick-1-of-3 with
  the class growth header) → **shop** (team items, with the movement stick) → Ready → next wave's
  combat. The run opens the same way: a build phase (card pop-up with no growth header, then the shop)
  before wave 1.
  - **Build phase:** no enemies. Cards, shopping and moving. **No builds are placed in the build
    phase.** It is capped at **20 s** and ends early when every connected player is Ready; a card not
    confirmed by the deadline is picked at random for that player (§10.2).
  - **Combat phase:** pure action. No menus.
- The upcoming wave's enemy types and counts are shown during the build phase, never its hot side.
- Enemy count scales with player count (§9.4) and difficulty (§2.2).

## 5. Death, respawn and regen

- Knights have HP. When a knight dies, it respawns at the base after the respawn time:

| Players | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Respawn time | 6 s | 10 s | 10 s | 10 s | 15 s | 15 s |

  multiplied by the difficulty's respawn multiplier (§2.2). Quick Recovery (§6.1) subtracts 2 s per
  stack but never takes the respawn below **4 s solo, 5 s otherwise**; that floor never raises a
  respawn that is already shorter.
- **Delayed regen** for every knight: **5 s after the knight last took damage or used its main attack
  or super** (RC1, §15.11 #120), it heals **8% of max HP every 1 s** (in ticks, not a smooth trickle)
  until full or until one of those happens again. A wound-up attack restarts the wait at the press and
  again when it lands. Placing a build doesn't restart it.
  - **Regen runs in the build phase too.** HP still carries over between waves, but a 20 s build phase
    (about 17 s to refill from 1 HP, the wait included) is always enough to refill, so there is no
    separate full-heal rule.
  - Regen isn't a heal from anyone: it charges nothing, counts in no stats and triggers no heal cards
    (§15.11 #98). A down or dazed knight doesn't regen.
  - Balance watch: 8%/s also applies in combat. If support healing feels pointless, lower the
    percentage or lengthen the delay (§14).
- Knights who are down when combat ends respawn at once, at the start of the build phase.
- **Nothing is lost on death:** upgrade cards, class growth, the build meter and team purchases
  persist. A down knight's builds stay on the map. The meter doesn't fill while the knight is down or
  dazed (§7).
- Coins are never carried; kills pay the team pool directly.

## 6. Economy

- **Team coins are the only currency.** Kills add coins to the **shared team pool**. Players never
  carry anything.
- **Coin income is low on purpose:** coins per kill = the enemy's budget cost (§9.1) × the coin rate in
  the balance sheet, times the difficulty's coin multiplier (§2.2). A Swarm group pays when its last
  unit dies. Starting values are set with the shop prices (§6.2, §14).
- **Personal power** comes only from upgrade cards and per-wave class growth (§6.1). There is no
  personal shop and no personal currency in v1 (§13).
- **Between waves:**
  - Each player privately picks 1 of 3 upgrade cards for their own knight (§6.1). Cards are free.
  - The team shop spends from the shared pool (§6.2).

### 6.1 Upgrade cards and class growth

**Rules**
- **Cards upgrade your knight; the shop upgrades the base.** A card can upgrade its knight's attacks,
  super, build, squad and passive. The team shop holds only base items.
- **Offer:** 3 cards per build phase, with no duplicates within one offer.
- **Rarity:** common and rare.
  - About 15% of offers include one rare (never more than one).
  - Every offer after a boss wave includes a guaranteed rare.
- **Stacking:** cards can be picked more than once unless marked unique. A stack shows as "×N."
- **Stat math:** stacks add percentages of the base value (three +10% cards give +30%), never
  multiplicatively. Range, movement speed and damage reduction have caps (starting value: +40% total).
- **Passive cards:** each knight has one **rare, unique passive card** (§8). Cards that improve a
  passive appear only once the player owns it, through the same prerequisite check as combos; unlike
  combos they stack unless marked unique (#122).
- **Build cards:** each knight has two cards that upgrade its build.
- **Combo cards** appear only once the player owns both of the combo's prerequisite cards. Combo cards
  are unique.
- **The card picker excludes:**
  - unique cards the player already owns
  - cards whose prerequisites (one or two cards) the player doesn't own
  - favored-enemy cards whose enemy can't spawn for this team, for example Skyhunter when Flyers are
    replaced (§9)
  - any card that depends on a knight not on the team (none in v1, but the rule applies to future
    cards)
- **Status effects:** burn and poison use the same timed-effect system as stun, slow, morale and the
  shield generator's guard.
- **How they look** (every one keeps the color rule, §2.3):
  - **Burn:** amber flames on the body. **Poison:** amber nanite corrosion. Every burn or poison
    damage tick flashes the whole body white for about 60 ms, like a hit.
  - **Stun:** the enemy's glow goes dark (its unlit frames, §15.10), and amber chevrons orbit above it.
    A stunned enemy always plays its idle clip, never its walk, even while it slides (§15.11 #36).
  - **Slow:** arcs crawl up the legs, climbing and flickering (`shock-crawl`), and the walk plays
    slower.
  - **Overflow shield:** the `overflow-shield` icon beside that player's HP bar; no world sprite.
  - **Guard** (inside a shield generator's field): the generator's shimmer dome shows it; no per-unit
    sprite.

**Per-wave class growth**
- At the end of every wave each knight gets an automatic stat bump **set by its class** (§8.1): the
  tank's growth is mostly HP, the marksman's mostly damage, the support's split between HP, damage and
  healing, the control's HP and damage. Boss waves give a bigger bump.
- Growth uses the cards' stat math: additive percentages of the base value.
- **Growth only raises uncapped stats** (max HP, damage, healing), so it never uses up the shared caps
  on range, movement speed and damage reduction.
- It shows as a header on the card pop-up, for example "Wave 4 cleared: +HP +DMG", above the three
  cards. The build phase before wave 1 has no header.

**Card marks:** each card shows a category mark from the icon set (§2.6):

| Mark | Cards |
|---|---|
| `card-vitality` … `card-recovery` | the 8 original shared commons, one mark each (Vitality, Might, Haste, Reach, Swiftness, Focus, Toughness, Quick Recovery) |
| `card-tinkerer` | Tinkerer |
| `card-attack` | Quick Draw, Piercing Shot, Volley, Heavy Slam, Heavy Bash |
| `card-super` | Blast Radius, Earthshaker, Rally Cry |
| `card-passive` | Steady Aim, Challenger, Field Medic, Morale, Deadeye, Wide Aura |
| `card-build` | Shrapnel Charge, Minefield, Wide Field, Reinforced Generator, Booster Beacon, Strong Arm |
| `card-effect` | Fire Arrows, Venom Bolts, Aftershock |
| `card-hunter` | Skyhunter, Giant Slayer, Siege Breakers |
| `card-ally` | Overflow, Triage |
| `card-squad` | Forced March, Veterans, Last Stand, Drillmaster, Reinforced Ranks |
| `card-toughness` | Unshakable, Vanguard (and the common Toughness) |
| `card-combo` | Wildfire, Fault Line, Plague, Warcry |

`card-supply` stays on file, unused (§2.6).

**Shared commons (9; every knight, with numbers tuned per knight)**

| Card | Effect |
|---|---|
| Vitality | +max HP |
| Might | +damage |
| Haste | +attack speed |
| Reach | +range (capped) |
| Swiftness | +movement speed (capped) |
| Focus | +super charge rate |
| Toughness | Take less damage (capped) |
| Quick Recovery | −2 s respawn time (floor 4 s solo, 5 s otherwise, §5) |
| Tinkerer | +build charge rate (§7.2) |

**Knight cards**

*Ranger*

| Card | Tier | Effect |
|---|---|---|
| Quick Draw | Common | Faster arrows |
| Blast Radius | Common | Larger shockwave (his super) |
| Shrapnel Charge | Common | Mines trigger faster and hit a wider area (build card) |
| Fire Arrows | Rare | Arrows apply burn |
| Piercing Shot | Rare | Arrows pass through the first enemy |
| Skyhunter | Rare | +50% damage vs Flyers |
| Volley | Rare | Every 4th shot fires 3 arrows in a spread |
| Steady Aim | Rare, unique | Passive card: standing still (movement stick released) for a short time boosts damage and range |
| Deadeye | Rare | Steady Aim activates faster. Requires Steady Aim |
| Minefield | Rare, unique | +1 active mine (build card) |
| Wildfire (Fire Arrows + Piercing Shot) | Combo | Burning enemies burst into flames when they die, igniting enemies nearby |

*Warden*

| Card | Tier | Effect |
|---|---|---|
| Heavy Slam | Common | Wider slam arc |
| Earthshaker | Common | Longer super stun. Doesn't add stagger on the boss |
| Wide Field | Common | Larger shield generator radius (build card) |
| Aftershock | Rare | The jump slam slows every enemy it hits for about 5 s (`slowMs` in the card's params; RC1, #118: on his super, not his main) |
| Giant Slayer | Rare | +50% damage vs Brutes and the Colossus |
| Unshakable | Rare | Immune to slows and knockback |
| Challenger | Rare, unique | Passive card: nearby enemies target the Warden first |
| Reinforced Generator | Rare | More shield generator HP and a stronger damage reduction (build card) |
| Fault Line (Aftershock + Earthshaker) | Combo | The jump slam leaves a long slowing fissure along its arc |

*Artificer*

| Card | Tier | Effect |
|---|---|---|
| Strong Arm | Common | Longer, faster build throws (build card) |
| Booster Beacon | Common | The healing beacon heals faster and has more HP (build card) |
| Venom Bolts | Rare | Nanites apply poison |
| Overflow | Rare | Healing beyond full HP becomes a temporary shield |
| Triage | Rare | Double healing on knights below 30% HP |
| Field Medic | Rare, unique | Passive card: a small healing aura for nearby knights (combat only) |
| Wide Aura | Rare | Larger Field Medic radius. Requires Field Medic |
| Plague (Venom Bolts + Field Medic) | Combo | Poisoned enemies spread poison when they die |

*Commander*

| Card | Tier | Effect |
|---|---|---|
| Heavy Bash | Common | Wider shield bash, stronger knockback |
| Forced March | Common | The squad moves faster, both when following and when going to the flag |
| Drillmaster | Common | Soldiers get more HP and damage (stacks) |
| Siege Breakers | Rare | Squad deals +50% damage vs Siege |
| Veterans | Rare | Soldiers who survive a wave permanently gain stats |
| Last Stand | Rare | The squad deals more damage the fewer soldiers are left |
| Vanguard | Rare | The Commander takes less damage while his squad is near |
| Rally Cry | Rare | Reinforcements has a **50% chance** to spawn 2 soldiers instead of 1 (rolled from the seeded combat stream). Stacks: +25% per extra copy, up to 100%. The TV shows "×2" on a double spawn |
| Morale | Rare, unique | Passive card: allied knights and soldiers inside the rally flag's area or near the Commander gain damage, attack rate and movement speed. Inside both areas they still get one effect; the two don't stack |
| Reinforced Ranks | Rare, unique | +1 squad cap |
| Warcry (Rally Cry + Vanguard) | Combo | Reinforcements also briefly gives nearby knights the morale effect (with its flash) |

That is 9 commons plus 11 Ranger, 9 Warden, 8 Artificer and 11 Commander cards: 48 in total. Exact
numbers are set during playtesting (§14). Removed from the tower-defense list: Master Mason,
Bodyguard, Light Load, Bulk Buyer, Bladework, the old Fault Line and the Lead from the Front passive
(merged into Morale).

### 6.2 Team shop

The shop is **team-only,** paid from the shared coin pool. Personal power comes only from cards and
growth, so every coin purchase is a team choice.

**What's sold**

| Item | Tiers | Details |
|---|---|---|
| Base repair | Repeatable | Restores a chunk of base HP; the price rises with each purchase (§3.4) |
| Sentry damage | 1 | §3.5 |
| Sentry range | 1 | §3.5 |
| Third sentry | 1 | §3.5 |
| Base max HP | 3 | Each tier raises the Citadel's max HP and its current HP by the same amount |
| Base armor | 3 | The Citadel takes less damage |

- Prices rise with each tier. Every item is always shown (every team can use them).
- **Pricing target (starting values in the balance sheet, tuned with coin income):** about 10
  purchases per run, and the team **can't afford much in the first couple of waves:** the cheapest
  item (repair) becomes affordable after wave 2, a sentry upgrade or a tier I after about wave 3–4, and
  the third sentry and tier III items need saving across several waves.
- The shop is thin in v1 on purpose; more items are a v2 addition (§13).

**Purchasing rules**
- **Any player can buy any team item.** There is no approval step.
- **Every purchase is announced on the TV,** with the buyer's name and color, for example "Foster bought
  Base Armor II."
- Items above a price threshold need a **press-and-hold to confirm** (about 0.6 s), to prevent accidental
  purchases.
- **Request button:** any player can tap "Request" on a shop item. The item appears on a wishlist on the
  TV, tagged with the player's color, until someone buys it or the wave starts. This lets quieter players
  join the negotiation without shouting.

## 7. Builds

Every knight has one **build**: a temporary placement that controls the arena (§2). Builds replace the
tower-defense structures entirely.

### 7.1 Build rules

These apply to every build unless its entry in §7.3 lists an exception.

- **One active build per knight.** Placing a new one removes the old one (the old one is removed the
  moment the new one is thrown or placed).
- **Builds are placed only in combat,** never in the build phase.
- **Lasting builds use HP or charges, never a timer.** They **stay on the map between waves** while they
  have HP or charges left. A newly placed build always starts at full HP or full charges; a build that
  survives a wave keeps its current HP or charges into the next one. **Builds don't regen.**
- **Timed effects are instant** (none in v1 builds; for example the pool's magnet pull or burning oil,
  §13). They run out on their own and never carry into the next wave.
- **Build effects run in combat only** (the shield generator's field, the beacon's healing). In the build
  phase builds stand idle.
- A down or dazed knight's builds stay on the map and keep working.
- Builds don't snap to tiles: an at-feet build lands at the knight's foot point, and a thrown build at
  its landing point, clamped to the playfield and outside the Citadel's footprint (§15.11 #101).

### 7.2 Build meter

- Every knight has a **build meter** (0–1). A full meter lets the knight place its build once, and
  placing it empties the meter.
- **Hybrid charge, set per knight:** a slow **passive fill** over time, plus fill from the knight's
  **actions.** Both rates live per knight in the balance sheet, so each build is balanced against how
  strong it is and how much damage its knight deals (a weak build or a low-damage knight charges
  faster). A knight with an action rate of 0 is purely timed.
- **Action sources are per knight:** damage dealt by its main and super by default; healing too for
  knights whose job is healing (the Artificer's healing outside his super and build: Field Medic).
- **A build's own damage and healing never charge the build meter.** They charge the knight's
  **super**, which rewards good placement. A super's own damage still never charges the super, and
  super healing charges neither. Squad damage charges the Commander's super at a reduced rate, never
  his meter.
- **The meter starts the run full,** so wave 1 opens with a build. It **carries over between waves,
  does not fill during the build phase,** and doesn't fill while the knight is down or dazed.
- **Tinkerer** (common card) raises the charge rate, through the modifier system like Focus.
- On the phone the meter is a ring around the build button (§10.1). There is no build-ready indicator
  on the TV.

### 7.3 Input, targeting and pathing

- **Input is set per build** and uses the same grammar as attacks (§10.1):
  - **At-feet builds** are tap-type: tap the build button to place it at the knight's feet.
  - **Thrown builds** are aimed sticks: drag to aim, release to throw; a quick tap auto-targets (the
    nearest enemy group in range for offensive builds, the knight's own feet for the rest; v1 has no
    offensive thrown build, so every quick-tapped thrown build lands at the knight's feet); slide back
    into the dead zone to cancel. The stick's length sets the distance: the build lands at the knight's
    position + aim × his throw range, so it never passes the range (RD3, §15.11 #112). While aiming,
    the TV shows the landing spot as a 0.6 ground ellipse at the build's real effect radius, plus its
    maximum throw range (`sim/preview.ts` `buildPreview`, the same landing the sim uses).
  - **Every throw flies at one speed** (RC2, #126): the shield generator, the healing beacon, the rally
    flag and the Commander's Reinforcements soldier all fly at `THROW_SPEED` (5 tiles/s, `balance.ts`
    builds section), so a throw's flight time is its distance / 5 s (1.2 s for a 6-tile build throw).
    Each keeps its own `minFlightMs`, so a quick tap at the feet stays quick; Strong Arm multiplies a
    build throw's speed on top.
- **Builds as targets:** enemies target an HP build exactly as they target a knight, with the same
  aggro radius and leash; when a knight and a build are both in range, the enemy picks the **nearest**
  (the same tie-break used between knights). **Only builds with HP are targetable.** Charge builds
  (mines) and the rally flag can't be attacked; mines are used up instead. Enemies whose AI never
  targets knights (Runners) never target builds either; each enemy's rule is in §9.
- **No walls in v1:** nothing a knight places changes pathing. The ground flow field is built once per
  run and never rebuilt (§15.5).
- **Build traits** (data, §15.4): `targetable` (has HP; enemies attack it, Brutes hunt it),
  `dealsDamage` (the Hunter stays out of its range), `hidden` (translucent to players; the Hunter
  senses and avoids its trigger radius), `triggerRadius` and `maxActive`.

### 7.4 The v1 builds

| Build | Knight | Input | Lasts by | Effect | Traits |
|---|---|---|---|---|---|
| Shield generator (`shield_gen`) | Warden | Thrown | HP | Knights and squad soldiers in its radius take less damage (builds aren't affected); radius shown on the TV | targetable |
| Mines (`mine`) | Ranger | At feet | 1 charge each | Triggers after a short delay when a ground enemy comes within its trigger radius, then deals area damage; Flyers pass over | dealsDamage, hidden; up to 3 active |
| Healing beacon (`beacon`) | Artificer | Thrown | HP | Heals allied knights in a small area around it, in pulses | targetable |
| Rally flag (`rally_flag`) | Commander | Thrown | Recall or replace | The squad goes to the flag and fights there | none (can't be attacked) |

- **Shield generator:** its damage reduction is a status effect (`guard`) re-applied each combat step to
  allied knights and soldiers in its radius; where generators overlap, the strongest wins. It applies
  after card damage reduction and outside its +40% cap (§15.3). Wide Field and Reinforced Generator
  improve it. Its throw is a slow lob at the shared throw speed: 1.2 s at full range (§7.3; RC2, #126).
- **Mines** (exception to the one-build rule): one mine per full meter, **up to 3 active** (Minefield:
  +1); placing one more removes the oldest. A mine arms about 1 s after it's placed, then turns
  translucent to players (40%). A ground enemy entering its trigger radius starts a short trigger delay,
  then it bursts: area damage to ground enemies, and the mine is gone. Runners and the Colossus's
  Charge set mines off like any ground enemy; Flyers never do. Shrapnel Charge improves them (its
  shorter delay has a floor, `minTriggerMs`). A delay cut off by the end of the wave doesn't burst: the
  mine re-arms and keeps its charge (§7.1, build effects run in combat only; #121).
- **Healing beacon:** heals allied knights (not soldiers, not builds) in its radius every pulse. Its
  healing charges the Artificer's super, never his meter. Booster Beacon and Strong Arm improve it.
- **Rally flag** (exception to the HP-or-charges rule): the flag can't be attacked and stays until it
  is recalled or replaced, including between waves. With the meter full, the build button throws a new
  flag (the old one is removed); with the meter not full and a flag out, a tap **recalls** it and the
  squad follows the Commander again (recall never uses the meter). The flag's aim preview uses the
  squad's flag ring as its radius.

### 7.5 Build art (neon knights)

- Every build is ours: knight gunmetal with amber glow, never violet. Frames are listed in the art
  README's "Builds (redesign)": `shield-gen/<flight|landed|active|damaged|destroyed>`,
  `beacon/<flight|landed|active|damaged|destroyed>`, `mine/<armed|trigger>`, and
  `rally-flag/flight-{pole,cloth,trim}` in flight, then the planted `rally-flag/*` frames.
- **States:** `flight` is drawn upright while code spins and arcs it, with its shadow on the ground;
  `landed` on touchdown until it switches on; `active` while working; `damaged` replaces it below half
  HP (code can flicker its glow); `destroyed` shows briefly, then the `scrap-ours` pile.
- **Active extras:** the generator stands on `shield-base` under a cycling `shield-shimmer-1…3` dome;
  the beacon pulses `beacon-pulse` with `heal-glint`s over healed knights.
- **Mines** show `armed` at full opacity for about 1 s, then at 40% once live; `trigger` at full
  opacity during the delay; then `mine-blast-ring` and `mine-blast`.
- **Code-drawn:** build shadows and the in-flight shadow; amber build HP bars (§2.6); the effect radius
  of the shield generator and the beacon as a faint dotted amber 0.6 ground ellipse; the throw-landing
  aim ellipse and throw range (§10.1).
- **Brute target cue:** a brief violet flash at the build a Brute locks on to (`brute-target` under it,
  `brute-target-arrow` above it).
- The tower-defense structure art (pulse turret, mortar, walls and charged walls, shock nets, Fortify,
  the build ghost) stays on file, unused: it is the build idea pool's art (§13).

## 8. Knights

### 8.1 Classes

A class sets a focus, an HP tier, a damage band and its per-wave growth (§6.1); everything else belongs
to the knight. Starting values, relative to a baseline knight (`balance.ts`): the HP tier multiplies
the baseline knight HP, and the damage band multiplies the damage of the knight's own main and super.

| Class | Focus | HP tier | Damage band | Growth |
|---|---|---|---|---|
| Tank | Hold the line, draw and absorb attacks | 1.6× | 0.9× (mid) | Mostly HP |
| Marksman | Remove threats fast, at range | 0.8× | 1.15× (high) | Mostly damage |
| Support | Keep the team alive and strong | 0.9× | 0.8× (low), plus healing | HP, damage and healing |
| Control | Decide where enemies fight and what they can do: hold territory (including a side the knight isn't on), slow, stun, pull, knock back | 1.0× | 0.95× (mid) | HP and damage |

- **What makes control distinct:** every knight's build controls the arena a little, so the control
  class carries control in its **main attack and super too,** and its build is the strongest control
  effect. Other classes' builds lean toward their own focus (a tank's shield, a marksman's mines, a
  support's beacon).
- v1 has four classes. More (for example a squad leader, if the Commander's squad becomes its own
  playstyle) come later (§13).

### 8.2 The v1 knights

| | Warden | Ranger | Artificer | Commander |
|---|---|---|---|---|
| Class | Tank | Marksman | Support | Control |
| Main | **Hammer smash:** damage in an arc spreading out in front of him (2.89 tiles: RC2 made it 1.65× longer; 68° wide: RC2 made it a third narrower, #127), with no knockback (RC2, #124) | **Longbow shot:** the longest range in the game | **Nanite blast:** about 5 nanites fired at random spots in a narrow cone over about 0.8 s (one burst per release; cooldown ≥ 0.8 s; spread from the seeded combat stream) | **Shield bash:** a solid rectangle from him along the aim (2.25 tiles long, 1.5 wide; every enemy whose body overlaps it is hit) with knockback (RC2, #156, #160) |
| Super | **Jump slam:** an airborne wind-up (1.1 s in a 1.35 s clip; RC2, #125), then damage and stun in an arc longer than the main's and wider (102°; it kept its width when RC2 narrowed the main, #127); less damage than the main. The airborne pause is a tell for players (enemy AI doesn't dodge) | **Shockwave** from the Ranger: knockback and light damage in a wide circle | **Heal cone:** a wide nanite cone that heals himself and the allied knights it reaches (not builds, not soldiers) | **Reinforcements:** spawns one squad soldier, thrown a short distance. At the squad cap the button stays dimmed and the charge is held |
| Build | Shield generator (thrown) | Mines (at feet) | Healing beacon (thrown) | Rally flag (thrown); recall |
| Passive | None built in; Challenger card | None built in; Steady Aim card | None built in; Field Medic card | None built in; Morale card |
| Hits Flyers | No | Yes | Yes | No |
| Strongest against | Brutes, Swarms, Hunters | Flyers, Runners, Siege | Swarms, Flyers; keeps the team alive | Siege, Grunts, Runners in transit |

**Input type per knight** (§10.1):

| Knight | Main | Super | Build |
|---|---|---|---|
| Ranger | Aimed | Tap (shockwave from himself) | Tap (mine at feet) |
| Warden | Aimed | Aimed | Aimed (thrown) |
| Artificer | Aimed | Aimed | Aimed (thrown) |
| Commander | Aimed | Aimed (soldier thrown a short distance; a quick tap aims toward the flag, or straight ahead with no flag out) | Aimed (thrown); a tap recalls when the meter isn't full and a flag is out |

- **Jump slam wind-up (RC1, #116; timing RC2, #125):** he is committed from the press to the landing: rooted, keeping the
  aim and facing he jumped with; main and build presses are lost and no aim preview shows. He stays a
  target and takes damage. If he goes down or dazed, or the phase ends, the slam doesn't land (no
  damage, stun or impact effects) and the charge stays spent.
- **Passives are cards:** no knight has a built-in passive. Each has one rare, unique passive card
  (§6.1): the old built-in passives that still apply (Steady Aim, Field Medic) and new ones
  (Challenger, Morale). Mason is removed (no walls).
- **Ranger range:** on the open map a long-range bow may cover two sides from the middle. Range is the
  knob to tune.
- **Hits Flyers** (`hitsFlyers` per knight): melee can't hit Flyers; the Ranger's bolts and the
  Artificer's nanites can. It drives the Flyer spawn rule (§9).

### 8.3 Charging

- **Super:** every super charges from the knight's own damage dealt (main attack, and its build's
  damage), at a per-knight rate. A super's own damage never charges the super.
  - **Artificer:** healing charges his super too: Field Medic healing and beacon healing (super healing
    charges neither the super nor the meter).
  - **Commander:** his own damage plus squad damage at a reduced rate.
- **Build meter:** §7.2 (passive fill + main and super damage; the Artificer adds his Field Medic
  healing; never build damage, build healing or squad damage).

### 8.4 Commander's squad

- **Starts the run with 2 soldiers.** After that Reinforcements is the only source; soldiers don't
  respawn.
- **Squad cap:** starting value 4 (Reinforced Ranks: +1); tune in playtesting. At the cap the super
  button stays dimmed and its charge is held.
- Soldiers have low HP. With a flag out they go to it and fight within its ring; with no flag out they
  follow the Commander. They walk slower than he does (3.45 vs his 4.3 tiles/s, about 80%;
  RC2, #160), so on the march they clearly trail him; more than 3 tiles from their slot they hurry (×1.45, about 5 tiles/s) and
  regroup. Forced March and Morale still apply on top. Survivors carry over between waves, keeping their current HP (soldiers don't
  regen).
- Squad damage charges his super at a reduced rate, never his build meter. His damage for the balance
  rule (§2) counts his own plus the squad's.
- **Thrown soldiers** can't be hit or targeted in the air and take their formation slot on landing.
- **Enemies target soldiers like knights** (§9, RC2): aggro radius, leash, nearest wins; a soldier
  at 0 HP dies.
  A double spawn never passes the cap. A new soldier takes the lowest free squad index.
- **Last Stand** counts the soldiers short of the cap (RD9, §15.11 #142).
- **Shield bash** (RC2): a solid rectangle from his feet along the aim, 2.25 tiles long (the old
  1.6-tile arc + 40%) and 1.5 wide (RD9-fix-1's 2, −25%); knockback 0.864 (the old 1.2 × 0.8 × 0.9), pushed away from him. Heavy Bash
  widens the rectangle (+20% `width`) and adds knockback (+40%).
- **Two Commanders** each keep their own squad and flag.
- **Morale** (card): see §6.1. It needs no TV visual of its own; Warcry reuses the morale flash.
- The squad has no bonus archers in v1.

### 8.5 Passive and card implementation
- Passive cards, card behaviors and build behaviors are self-contained modules with hooks (for example
  `onTick`, `onDamageDealt`, `onHeal`), attached by config (§15.3).
- Build behaviors are registered by `BuildId` (`src/host/sim/builds/index.ts`), so a new build from the
  idea pool (§13) is a new module plus content, not a change to the knights. The shared pipeline
  (`builds/core.ts`) does the meter, placement, flight, landing, switch-on, HP and targeting; a
  behavior adds `check(def)` (reads its content params), an optional `maxActive` hook (the mines'
  exception), `combat(b)` (its effect, each combat step while active) and `placed(owner, b)` (right
  after it leaves his hands: the flag's squad order, RD9). A build without a behavior
  can't be placed yet: its button stays dimmed and its meter full (RD3).

## 9. Enemies

Each enemy type is designed as a problem that specific classes solve.

| Enemy | Behavior | Answered by |
|---|---|---|
| Grunt (Drone) | Walks to the base and attacks it; attacks knights and HP builds that come within its aggro radius | Everyone |
| Runner (Skitter) | Fast and fragile; ignores knights and builds and bursts on the base. Caught in transit (mines, stuns, knockback) | Ranger (bow, mines in its path), Warden (super stun), Commander (shield bash, squad at a flag on its route), Artificer (cone) |
| Brute | **Build hunter:** goes straight for the nearest targetable build, **at any distance.** With none on the map (or once it has destroyed them all) it walks toward the base and attacks knights like a Grunt | Warden (HP, stun), Ranger (kiting at range), Commander (squad); any targetable build pulls it off course |
| Siege (Bombard) | Paths toward the base and **stops only when something is in range.** Target priority: **base > players (and soldiers) > builds**, nearest within each; it retargets the moment a higher-priority target enters range. Keeps the red landing marker before each shell. The team's main ranged threat to knights | Ranger (outranges it), Commander (flag thrown beside it, squad dives in), Warden (HP to walk in) |
| Flyer (Wasp drone) | Flies straight; **range slightly increased** over the tower-defense value. Ignores ground trap builds (never sets off mines) but still shoots knights and HP builds in its aggro radius; melee can't hit it | Ranger, Artificer, the sentries (spawns only for teams that can hit it) |
| Swarm (Scrap mites) | Many weak units, in packs of 8 | Warden (arc), Artificer (spread), Ranger (mines) |
| Hunter (Stalker) | Hunts players; **senses hidden builds** (sees and avoids mines' trigger radii) and **stays out of range of damage-dealing builds and the sentries**; **speeds up once it locks on** to its quarry | Warden (HP, stun), Commander (squad blocks it), Artificer (healing) |
| Boss (Colossus, §9.2) | Appears at waves 5, 10 and 15 | Everyone (the stagger meter) |

- **Every enemy must be answerable by at least two classes or by a baseline every team has** (§2); the
  table's last column is the v1 check.
- **Melee attacks cannot hit Flyers.**
- **Body hitboxes (C4, Foster):** our attacks (knights' shots, arcs, cones and circles, mine blasts,
  the sentries) hit an enemy anywhere on its drawn body: torso, head and legs, from the feet up to the
  top of the head (the Wasp: its hull at its flight height, not its shadow). Arms, tails, rotors and
  barrels are left out. The Colossus keeps a low hitbox, its legs, a bit bigger than its feet, so its
  head and chest never count. Sizes are measured off each rig and live in the balance sheet (§15.4);
  auto-aim and the sentries aim at the body's near end (the feet, or the Wasp's hull). Enemy attacks,
  walking, collisions, the Commander's soldiers and ground effects (mine triggers, Fault Line's fissure,
  spreads) keep the feet circles.
- **Who attacks what (aggro leash):** Grunts, Brutes (once no build is left), Swarms and Flyers attack a
  knight, a Commander's soldier or an HP build that comes within a short aggro radius and chase it up
  to a leash distance (measured from where they left their way); the nearest candidate wins (a knight
  on an exact tie). When they lose the target (past the leash, or it goes down, dazed or away) they
  **go on toward the base from where they stand** on the ground field (Flyers straight at the
  Citadel), never back to the point they left; a target let go at the leash is ignored until it
  leaves the aggro radius, so the leash still ends a chase (RC2, §15.11 #157). Runners never attack
  knights or builds. Siege follows its priority above. Hunters always hunt players. Challenger
  (Warden card) makes nearby enemies pick the Warden first. Radii live in config.
- **Soldiers as targets (RC2, §15.11 #158):** the Commander's soldiers are targets exactly like
  knights: the same aggro radius, leash and nearest-wins with knights and HP builds; Siege ranks
  them with the players; enemy attacks, shots and shells damage them, and a soldier at 0 HP dies
  (no respawn, §8.4). A soldier in the air (Reinforcements) isn't a target until it lands. The
  Brute's build hunt, the Hunter's quarry and the Colossus's lock-ons (boulder and Charge targets)
  stay knights (or builds) only; the slam and the Charge still hit soldiers (§9.2).
- **Brute:** it goes for the nearest targetable build by distance, rechecked every step, so a build
  landing nearer pulls it off course (the bait tactic), and reaches it on a ground field toward that
  build (§15.5); when that build is destroyed it picks the next. The TV flashes each build it locks on
  to (§7.5).
- **Hunter (C3, redesigned):** it hunts the nearest player and keeps that quarry until they go down or
  dazed, or another player comes clearly closer (2 tiles closer, so two players at similar range don't
  flip it). Two phases: it **stalks** at normal speed, taking the route that spends the least time in
  range of the sentries and damage-dealing builds and outside hidden builds' trigger radii (§15.5),
  until its quarry is within about **5 tiles**; then it **locks on** (the quarry's color flashes as a
  ring at the quarry's feet for about 2 s, §9.6) and **sprints**. The flash marks the lock-on moment,
  not the quarry pick. v2 behavior is in §13.
- **Flyers spawn only if the team has a knight that can hit them** (`hitsFlyers`: the Ranger and the
  Artificer in v1). Otherwise their spawn slots are filled with additional ground units, so a
  melee-only team (Warden, Commander) or a solo melee knight never faces Flyers it can't answer.
- The team's composition is checked at the **start of every wave**, counting only players connected
  at that moment, so a ranged player dropping mid-run can't strand the team against Flyers.
- **Enemy power over the run:** knights get stronger every wave (growth, cards, shop) while each enemy
  type's stats stay fixed; the wave budget, new types and an optional **per-wave enemy HP and damage
  multiplier** (§9.3) carry the curve.

### 9.1 Starting stats

These are starting values for playtesting, relative to the Grunt baseline. All of them live in the
balance sheet.

| Enemy | HP | Speed | Damage | Budget cost | Notes |
|---|---|---|---|---|---|
| Grunt | 100 | 1.0 | 10/hit | 1 | Baseline |
| Runner | 40 | 2.0 | 40 burst | 1 | Hits the base once, then dies |
| Swarm | 8 × 25 | 1.2 | 4/hit each | 3 per group | Spawns as a group of 8 |
| Brute | 600 | 0.6 | 40/hit | 5 | Hunts builds |
| Flyer | 80 | 1.2 | 12/hit | 2 | Range about 1.25× its tower-defense value |
| Siege | 150 | 0.8 | 25/shell | 4 | Long range; base > players > builds |
| Hunter | 200 | 1.3 (sprint faster) | 15/hit | 3 | Hunts players |

- **Coins per kill** follow the budget cost times the coin rate (§6). A Swarm group pays when its last
  unit dies. Difficulty applies a coin-income multiplier (§2.2).
- Enemy HP bars and the per-wave enemy multiplier apply to every type.
- v1 has no elite variants (§13).

### 9.2 Boss: the Colossus

The Colossus is a huge, slow walker that comes from a portal on the hot side toward the base: a giant
walker mech with a glowing core in its chest (§2.1); its art is in §9.6.

**Design rules**
- Every big attack has a clear wind-up and a red ground marker showing where it will land, so players
  can dodge by watching the TV.
- Every class has a useful job in the fight, and no class is required.
- It paths toward the base on the ground field like any walker.
- **Each visit teaches one new move.**

**Attacks by boss wave**

| Wave | Attacks and changes |
|---|---|
| 5 (Mk I) | **Slam:** a red circle appears in front of it, and the slam lands 1.5 s later, damaging knights, soldiers and HP builds. **Boulder throw:** targets a player (the largest group of players), with a red marker showing where it will land. Only a light stream of Grunts spawns alongside it |
| 10 (Mk II) | Everything from wave 5, plus **Charge:** it locks on to a knight, a red lane marker shows its path, then it plows down the lane, hitting knights and soldiers once and knocking them aside, destroying any HP builds it crosses and setting off any mines it crosses (the rally flag is left alone). Dodged, not tanked; it punishes stacking builds in one spot. Grunt and Swarm escorts walk with it |
| 15 (Mk III) | Everything from wave 10, plus it **calls in Runners** periodically, from the start of the fight. **Below 50% HP, final phase:** it moves and attacks faster, and each slam sends out a shockwave ring that players must dodge |

**Stagger meter**
- The Colossus can't be stunned directly. It has a hidden stagger meter.
- All damage fills the meter a little. Warden stuns fill it more, but not so much that the Warden can
  lock the boss down.
- When the meter is full, the Colossus is staggered for about 3 seconds and takes bonus damage. Then the
  meter resets.
- **Stun resistance:** for 4 seconds after it gets back up, Warden stuns don't fill the meter at all
  (damage still does), so a Warden-only team can stagger it now and then but never keep it down
  (§15.11 #55). The TV shows nothing for this window.

**Boss wave rules**
- A large boss HP bar runs along the bottom edge of the TV (§2.6).
- If the Colossus reaches the base, it attacks the base with heavy hits. This threatens a loss but isn't
  instant.
- **The boss's death ends the wave.** Any remaining enemies collapse.
- **Reward:** every player gets a guaranteed rare upgrade card and the bigger boss-wave class growth
  (§6.1).
- Boss HP scales with the player-count table (§9.4).

### 9.3 Wave generation

- **Budget plus pool.** Each wave has hand-authored data (§15.4 `WaveDef`):
  - a threat budget
  - the enemy types allowed
  - guaranteed spawns, for example the type being introduced that wave, or the boss (optionally pinned
    to a portal)
  - its **hot-side schedule** (§9.4)
  - an optional **enemy multiplier** for HP and damage (default 1.0), so the curve against the knights'
    growth can be tuned without code changes
- A generator spends the budget on allowed enemy types, using their budget costs, and spreads the groups
  across the wave's duration in **spawn pulses** and across the portals:
  - **Spawn pulse** (RD3, §15.11 #112): up to `players + 1` groups that spawn at the same moment, each
    pulse in its own equal slice of the wave's duration.
  - **Active portal cap:** each pulse uses at most **`players + 1`** portals (capped at 6: 2 in solo, 6
    with 5 or 6 players, so a full team sees every portal). The active portals are chosen per pulse.
  - While a side is hot, every pulse includes at least one hot-side portal, and the hot side receives
    the **hot share** of the budget (starting value 0.55, from the 50–60% range); the rest is spread
    over the other active portals. Solo: one hot-side portal and one other. The split is chosen over
    the whole wave: the hot share of its cost closest to the content share and never under half,
    with a group elsewhere in every pulse of two or more where the costs allow it (a lumpy solo wave
    may put both groups of a pulse on the hot side).
  - The boss spawns at a seeded portal on the side hot when the wave starts (the first pulse's).
- **Seeded:** each run has a random seed, so runs vary but any run can be reproduced exactly for
  debugging: the seed reproduces the waves (portals and hot sides included) and card offers, and the
  seed plus a recorded input log replays the whole run (§15.3, §15.9).
- Flyers are replaced with ground units when the team has no knight that can hit them (§9).
- The generator stays reusable: Dungeon Crew will use the same system for its rooms (§15.4).

### 9.4 Wave layout and pacing

| Wave | Introduces | Hot side |
|---|---|---|
| 1 | Grunts | One for the wave, no shifts |
| 2 | Runners | One for the wave, no shifts |
| 3 | Swarms | One for the wave, no shifts |
| 4 | Brutes | One, plus 1 mid-wave shift |
| 5 | **Boss** Mk I | The boss's side, no shifts |
| 6 | Flyers | One, plus 1 mid-wave shift |
| 7 | Siege | One, plus 1 mid-wave shift |
| 8 | Hunters | One, plus 1 mid-wave shift |
| 9 | Mixed | One, plus 2 mid-wave shifts |
| 10 | **Boss** Mk II and escorts | The boss's side, no shifts |
| 11 | Mixed | One, plus 2 mid-wave shifts |
| 12–14 | Mixed, rising budget; heavier waves at 12 and 14 | **Per spawn group** |
| 15 | **Boss** Mk III, final phase | **Per spawn group** (the boss's escorts too) |

- **Hot side:** a side (§3.1) that gets the hot share of the wave's budget while it's hot.
  - It is **never announced,** not in the wave preview and not when it shifts. Players read it from the
    enemies coming at them.
  - **Mid-wave shifts** happen at 1/2 of the wave's duration (one shift) or at 1/3 and 2/3 (two
    shifts), always to a different side, seeded (`waves:<n>`).
  - **Per spawn group** (waves 12–15): each spawn pulse (§9.3) rolls its own hot side, never the same
    side twice in a row, so attacks come from every side, each one focused.
  - Boss waves 5 and 10: the boss's side is the hot side for the whole wave.
- **Portal flare:** a portal flares for about 1 s just before it spawns a group (§3.1). It shows where
  something is about to appear, never the wave's pattern.
- **Combat length:** about 60–90 seconds per wave. A wave ends when every enemy is dead, except boss
  waves, which end when the boss dies (§9.2).
- **Target run length:** about 20–24 minutes, including build phases (§4).
- **Player-count table** (a lookup in the balance sheet, not a formula), counted from the players
  connected at the start of the wave (§11.3):

| Players | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Wave budget and boss HP | 0.6 | 1.0 | 1.25 | 1.5 | 1.75 | 2.0 |
| Respawn time | 6 s | 10 s | 10 s | 10 s | 15 s | 15 s |

  From 2 players up this matches the tower-defense curve. Solo is lower because one player can't split
  fronts and a death leaves only the sentries defending. Scaling the number of enemies, not their HP,
  keeps each enemy type feeling the same. Difficulty multipliers (§2.2) apply on top, and the wave's
  own enemy multiplier after both.

### 9.5 Debug panel (developer only)

Enabled on the TV build with a URL flag and never shown to players. It can:
- jump to any wave
- spawn any enemy type at any portal
- make players invincible
- add coins
- fill every knight's build meter, or one player's (RD6)
- force the hot side: this wave's spawn groups that haven't flared and every later wave's move to the
  forced side's portals until it's cleared (RD6, §15.11 #114)
- run the simulation at 2× speed
- show and set the run seed
- show hitboxes, ranges, flow-field arrows, the current hot side, portal activity (groups queued per
  portal, flaring now, time to the next group) and each knight's build meter (RD6)
- download a replay of the current run (§15.9)

The TV's `window.__pcg` hooks (dev or `?debug=1`, e2e) read the same: `builds()` (kind, owner,
position, HP, flight state), `meters()` (each knight's meter, aim held, builds out), `preview(slot)`
(the sim's `buildPreview`), `portals()` (activity and the hot side, forced or not), and drive
`fillMeter(slot?)` and `forceHot(side)` as logged debug commands (RD6).

### 9.6 Enemy art (neon knights, settled)

**Faction rules:**
- Hulls are dark violet-iron, so the whole body reads as enemy before the glow is found. Knights are
  cool gunmetal.
- Emissive is violet only (eyes, cores, seams). Never amber, never red.
- Machine posture: hunched forward, with spikes. Knights stand upright.
- No player colors, rings or names on enemies (except the Stalker's brief lock-on flash). Size signals
  toughness.
- Same production rules as the characters (§2.4) and the perspective rules (§2.5): three-quarter view
  with top faces, mirrored left/right, vector cut-out rigs, ink outline, alignment and layering.
  Enemy glow sits inside each part (`class="glow"` groups), so it moves with the part.
- Every attack has a visible wind-up tell (listed per enemy). Every ground marker is a 0.6 ellipse.
- Every enemy and the Colossus has a hit (a recoil lean with the white flash) and a death: the glow
  cuts out, the parts collapse into a pile on the ground with `scrap-theirs`, then fade (§15.11 #35).
  Big walkers (Brute, Colossus) stomp: the body drops hard on each footfall.
- **HP bars:** a thin violet bar above each damaged enemy (§2.6); Scrap mites have none.

**Drone (Grunt):** a little shorter than a knight, reaching about the Warden's shoulders. A short torso
leaning hard forward on short legs with normal knees, spikes along the spine, no neck (the head sits on
the front shoulder), a single violet eye slit, a short blade arm and a back claw, both mounted low on
the body. Moves at a hunched trot; blade slash with the claw bracing.

**Skitter (Runner):** low and wide on four spindly legs, about half a knight's height. A violet core
sphere sits embedded in a socket on its back (a dark collar ring with a front lip, the sphere half
sunk into it, with curved cage ribs over it). It's the brightest thing on the enemy side, because it
detonates on the base. Fast low scuttle; the core pulses faster as it nears the base.

**Brute:** about 1.5× a knight's height. Tiny sunk head, violet furnace grille in the chest, heavy
shoulder plate over a thick near arm ending in a ram fist, and a far fist hanging on the other side.
Heavy stomp. Hit tell: the furnace flares and the fist rears back before each hit (the Warden's stun
window). Locking on to a build flashes `brute-target` at the build.

**Bombard (Siege):** a four-legged artillery walker, noticeably bigger than a knight, on thick splayed
legs with wide foot pads; a long mortar barrel angled up and a rack of glowing shells on its back.
Plods until something is in range, plants its legs and lifts the barrel; the muzzle charges violet
before each shot, and a red landing marker shows where the shell will hit.

**Wasp drone (Flyer):** no legs. Hovers at about a knight's head height, out of hammer reach, with two
violet rotor discs each spinning on its own mast, a stinger cannon and a down-thruster glow under the
rear of the body; its shadow stays on the ground below. Bobs at a fixed height and never drops toward
the ground, so it always reads as out of melee reach. **Flight height (C4, Foster):** its hull's
underside flies 1.37 tiles over its shadow, half its first height (2.74).

**Scrap mites (Swarm):** tiny beetle bugs, about a fifth of a knight's height: a round split shell, a
small head with antennae, six short legs and one violet eye, in packs of 8. Packs are scattered and
uneven (mixed sizes, positions and tilts), never in rows, but every mite faces the same general
direction; none ever faces backward. Animation: each mite skitters on its own jittery path at its own
speed, with small random stops and heading wobble; the pack spreads and bunches as it moves. Never
in step. Randomize each mite's offset, speed and wobble.

**Stalker (Hunter):** a lean machine hound: deep chest, tucked waist, two pointed ears on the back of the
head, a low head thrust forward with twin violet eye slits (the only enemy with two eyes), fins forward
on the back that sweep well back, and a short spiked tail. Loping stalk; a faster, lower sprint once
locked on; wind-up tell: it crouches low, then lunges.
**Lock-on flash:** when the Stalker locks on (its quarry within about 5 tiles, §9), that player's color
flashes as a ring around the quarry's feet for about 2 s, then there's no indicator until it locks on
again. This is the one exception to "no player colors on enemies", so the whole room sees who's
targeted and can step in (§15.11 #45, #85).

**Colossus (boss):** about 2.6× a knight's height; tall and top-heavy (the only enemy taller than it is
wide): a wide shoulder yoke, a small sunk head with one violet eye bar, two slab fists hanging low,
thick legs, and a big violet core in an armored chest ring. Drawn as a true side view facing right,
like every enemy (mirrored for left), at every tier. Spires, plumes and back spikes ride on the yoke;
horns ride on the head.
**It upgrades each time it returns, at the same size.** Built as one rig with stacking optional parts:
- **Mk I (wave 5):** the bare frame. Plain yoke, smooth slabs, few seams, no spires or spikes.
- **Mk II (wave 10):** adds three exhaust spires on its back, spikes on the yoke and near pauldron,
  knuckle spikes on the ram fist (the boulder-throwing hand), and more lit seams on legs and far fist.
  The yoke and knuckle spikes suit the Charge pose.
- **Mk III (wave 15):** adds two taller spires (five total; they launch its Runners), horns on the head,
  rear spikes, armored shin and far-fist plates, a studded core ring, and glow seams across the yoke.
- **Final phase (wave 15, below 50% HP):** the chest armor cracks open around a larger exposed core, and
  violet plumes pour from the spires.
**Stagger meter:** the core shows the hidden meter, brightening and pulsing faster as it fills. At full,
the Colossus drops to one knee for about 3 s and the core flares white-violet during the bonus-damage
window.
**Tells:** slam (both fists raise, fist seams flare, red circle, lands 1.5 s later); boulder throw
(tears up scrap with the near fist and winds back, red landing marker); **Charge** (its head snaps to
the target, it lowers the spiked yoke about 12° so the spires point forward, the head drops in front,
the near leg paws the ground with `landing-dust` puffs, the red lane marker shows the path, then the
run with `charge-dust` trailing at its feet); shockwave (violet outline ring rolling out from each
final-phase slam); call Runners (spire plumes surge, then Skitters launch from the spires).
**Walk:** slow, heavy steps with a slight ground shake. The legs trade places every step: the stepping
leg swings forward and is drawn in front, the planted leg drops behind, so the front leg alternates
sides. Swap the legs' draw order at mid-stride, with a slight scale-up on the leg in front.
**Head tracking:** the head turns side to side toward where it's walking or aiming, sliding slightly
toward that side with the eye bar following; before a slam, boulder throw or Charge it snaps to face
the target.

## 10. Controls

General rules:
- Phones are held in landscape.
- The controller follows the platform requirements: `touch-action: none`, locked viewport, Wake Lock,
  a manual full-screen button (never automatic; an Add-to-Home-Screen sheet where the browser has no
  full-screen API, e.g. iPhone), reconnect handling, and no vibration
  (`PLATFORM.md` §3).
- Every measurement below is inside the device safe area: offsets are added to
  `env(safe-area-inset-*)`.

### 10.1 Combat layout

Reference viewport is 844×390 CSS px (iPhone 14, landscape). Positions scale as a percentage of the
viewport. Sizes are fixed in px, with the minimums listed.

**Movement stick (left half)**
- The touch zone is the entire left half of the screen.
- **Idle state:** when no thumb is on the left half, the stick is always drawn at its rest position at
  40% opacity, so players know it's there.
- **Rest position:**
  - Center is 17% of the viewport width from the left edge (≈143 px).
  - Center is 30% of the viewport height up from the bottom edge (≈117 px).
- **Size:** base radius 60 px, knob radius 26 px. Maximum knob travel 60 px.
- **Behavior:**
  - On touch, the stick re-centers under the thumb at full opacity.
  - On release, it eases back to the rest position over ~150 ms and returns to idle opacity.
- **Dead zone:** 12% of the travel radius.

**Action cluster (right half)**
- The buttons are arranged in an arc around the main attack button, which is the thumb's resting spot.
- **Main attack:** 96 px diameter.
  - Center is 20% of the viewport width from the right edge (≈169 px; button edge ≈121 px from the
    right).
  - Center is 32% of the viewport height up from the bottom edge (≈125 px; button edge ≈77 px from the
    bottom).
- **Super:** 76 px diameter, centered at offset (−92 px, −78 px) from the main button's center (up and
  to the left).
- **Build button:** **60 px** diameter (56 px before the redesign), centered at offset (−134 px, +24 px)
  from the main button's center (to the left). At 844×390 it is 58 px from the main button and 42 px
  from the super, its edge 66 px from the bottom (§15.11 #115, revising #105).
- **Labels:** ATTACK, SUPER and BUILD sit centered under their buttons, starting 14 px below the drawn
  edge (past the 11 px reach of the aim and meter rings). No label touches any button, ring or other
  label at any supported viewport.
- **Spacing rules:**
  - Gap between any two buttons is at least 24 px.
  - No button edge is closer than 64 px to the right edge or 64 px to the bottom edge, so the thumb
    never has to scrunch up to reach a button.
  - All buttons must be at least 56 px in diameter.
- **Hit areas:** each button's touch target extends 8 px beyond its drawn edge. Where targets overlap,
  the nearest button center wins.

**Aimed sticks** (a main attack, super or build configured as aimed):
- **Tap** (released within 150 ms and inside the dead zone): auto-aims. Attacks aim at the nearest
  valid enemy in range; thrown builds land at the knight's own feet (v1 has no offensive thrown build);
  the Commander's Reinforcements throws toward his flag (straight ahead with no flag out).
- **Drag:** aims. The aim is drawn **on the TV**, not the phone. Maximum drag radius 70 px.
- **Aim preview** (C3, §15.11 #41): the TV draws the real hit area, from the same effective stats the
  sim uses (content through cards, growth and class multipliers): a transparent amber bar the bolt's
  range long and its hitbox wide (2 × `rules.projectileRadius`) for a single bolt (Ranger; #52), a
  transparent amber-filled cone for arcs, cones and spread volleys (Warden smash and jump slam,
  Artificer blast and heal cone), a transparent amber-filled rectangle of the attack's length and
  width for rectangles (Commander bash, RC2), a filled amber 0.6 ellipse for circles. **Thrown
  builds and soldiers** show the landing spot as a 0.6 ground ellipse at the build's real effect radius
  (the rally flag: the squad's flag ring), plus the throw range as a faint ring around the knight.
  Previews lie on the ground under the units, dim enough to stay out of the bloom. A super previews
  only once charged; a build only while its button can place.
- **Dead zone** (the center grace zone): 25% of the drag radius around where the finger landed (17.5 px),
  so a thumb back near the middle counts without finding the exact center (C4, §15.11 #53).
- **Release outside the dead zone:** fires (or throws) in the aimed direction, the one the TV shows.
- **Slide back into the dead zone, then release:** cancels. The TV's preview hides while the aim is in
  the dead zone; dragging out again, still held, re-arms it and the preview shows again (C4,
  §15.11 #51, #53).

**Firing:** every attack and build fires **on release**, once per release.
- Holding an aimed button only shows the preview on the TV until release.
- **Aimed buttons are semi-floating joysticks** (C1, FF4-fix-2). They draw as a joystick: the icon in the
  center, a circle around it, and an outer ring for the range. A finger landing anywhere on the right half
  picks the button whose edge is nearest (the bounds between the buttons; farther than 56 px from every
  button's edge picks none), and the joystick's center becomes where the finger landed. Tap buttons keep
  their fixed circles.
- Holding a tap-type button does nothing; it fires when released.
- Holding never repeats. A release during an attack's cooldown fires as soon as the cooldown ends. A
  build release while the meter isn't full does nothing (except the Commander's recall).

**Super charge indicator**
- A ring around the super button fills clockwise as the super charges.
- **When full:**
  - The button flashes once, brightening for 150 ms.
  - It then pulses continuously: the ring scales 1.0→1.12 and back at 1.2 Hz until the super is used.
  - The same full state also shows on the TV as an amber pulse on the player's ring: an amber ring
    just outside their colored ring, pulsing at the same rate and scale. The colored ring stays drawn
    on top, so the player color still reads. No badge over the head (C2, §15.11 #38).
- The Commander's super at the squad cap stays dimmed with its charge held.

**Build button = the action button** (F1). The tower-defense context table, the structure arc, Give/drop and
every crate action are removed. The button only places, throws or recalls the knight's build:
- **Icon:** the build's `act-*` icon (§2.6); the Commander's switches to `act-recall` while his flag
  is out and the meter isn't full.
- **Gesture** follows the build's input type (§7.3): tap-type for at-feet builds (and the Commander's
  recall), an aimed stick for thrown builds.
- **Build meter ring:** fills clockwise around the button, like the super's ring. The button is dimmed
  until the meter is full (the recall state is lit). **Full = a steady amber ring, no pulse,** so it
  reads differently from the super. **No build-ready indicator on the TV.**

**Status strip** (top center, small): HP and base HP. Players watch the TV, so the phone shows only
glanceable information. The build meter lives on its button.

The Warden's smash and the Commander's bash are aimed (§15.11 #47); a quick tap still auto-aims, so
melee stays a one-touch swing.

### 10.2 Build phase

The build phase has two phone screens in order, then Ready:

1. **Card pop-up** (full screen, no stick): the class growth header ("Wave 4 cleared: +HP +DMG"; none
   before wave 1), the three cards with rarity frames, **tap a card to select it, then tap Confirm**, and
   the phase timer. Selecting is local to the phone; Confirm sends the pick. Once the pick is confirmed,
   the phone moves on to the shop.
2. **Shop** (§10.3), with the movement stick on the left third, so players can reposition while
   shopping.

- **No builds are placed in the build phase.** The build phase is cards, shopping and moving.
- **Timer:** a **20 s cap,** ending early when every connected player is Ready. A card not confirmed by
  the deadline is picked at random for that player (seeded, §15.3).
- A player can tap Ready before confirming a card; the pick is still made at the deadline. The phase's
  end is the deadline either way: when everyone is Ready early, cards not confirmed are picked then
  (RD3, §15.11 #112).

### 10.3 Shop screen (build phase)

The shop fills the right 2/3 of the phone; the movement stick stays on the left third. It is one column:
a header line (title and a short hint, which is dropped on short screens), then the scrolling rows. It shows:
- the team's coin pool
- the team shop (§6.2): item rows with price, hold-to-confirm on big buys, and a Request toggle on
  every item, with "Requested by" tags
- **Ready** at the top right
- no tabs

### 10.4 Dead
- The phone shows only a respawn countdown.
- The top bar's pause button (§10.5) stays, so a downed player can still pause the team.

### 10.5 Team pause (C4, §15.11 #54)
- **Top bar:** during a run (wave countdowns, build and combat phases, and while down) every player's
  phone has a pause button in the top-right corner of the top bar, a code-drawn two-bar glyph on a
  gunmetal chamfered tile (the icon set has no pause icon). It isn't shown in the lobby, knight select,
  the waiting and claim screens, or the summary. On the shop screen the coin count moves left of it.
- **Any player pauses the whole run** for every player and the TV. The run freezes: sim steps, the
  build timer, wave countdowns and respawn timers; the TV's render-only motion holds still too.
- **Paused:** every phone shows a "Paused" card over its screen, "<Name> paused the run" (or "You paused
  the run") and a **Resume** button; **any player** can resume, not only the one who paused. The TV shows
  a "Paused" card naming who paused over a scrim, inside the safe margin.
- **No buffered input:** going into the pause drops every held gesture on the phones; presses made while
  paused never fire after the resume, and menu actions that change the run (buy, request, card, Ready,
  a late join) are refused with "Not right now" until the resume. Resume starts at once (no 3-2-1):
  nothing held through the pause carries a press over.
- Not in v1: a per-player pause, pause menus (settings, quit), TV-side pause controls.

## 11. Lobby, join and reconnect

Room codes, join flow and reconnect tokens belong to the shared relay and `net-client`, and are reused
from Sunny Side Slam. Everything else in this section is Fort Frenzy game logic running on the host.

### 11.1 Lobby
1. **TV creates a room** and shows the room code plus a QR code linking to the join URL with the code
   filled in.
2. **A phone joins,** enters a name and is assigned a color. In the lobby it can pick another of the six
   colors (`color` intent, §15.6); colors other players hold show as unavailable. Colors stay unique: a
   color another player holds (connected or not) is refused, never swapped, and a player keeps their
   color through reconnects, leader handoff and the run. Once Ready, the Ready
   button and every other lobby action darken until the player taps Ready again to un-ready.
3. **Knight select on the phone:** swipeable knight cards, each showing name, class, what the main
   attack, the super and the build do (tap or aim), and the passive card (§8). One swipe moves exactly
   one card, however long. The TV shows the lineup live. Duplicate knights are allowed.
4. **Start:**
   - When every player is Ready, a 3-second countdown starts the run.
   - The first player to join is the **party leader**. They can force-start once at least one player
     is Ready, so **the party leader can start alone** (§15.11 #100).
- **Players: 1–6.** Solo play is supported in v1. A seventh phone sees a "Game full" screen. The title
  and this range live in `game.meta.ts` (the game's catalog entry, `PLATFORM.md` decision #9): code
  reads them from there, so change them there.
- **Removing players:** in the lobby, the party leader's phone or the TV can remove any other player
  (as in Sunny Side Slam). Once a run starts, nobody can leave or be removed; a player whose phone drops
  stays in the run, dazed (§11.3).
- **Leader handoff:** if the leader disconnects, leadership passes to the next-earliest joined
  connected player, and doesn't snap back when the original leader returns (as in Sunny Side Slam).
- **TV menus never need a mouse.** The home screen (difficulty, create room) works with keyboard or
  gamepad, with no hover-only interactions. Once a room exists, the party leader's phone drives the TV
  menus: changing difficulty in the lobby, and the end-of-run options (§4).

### 11.2 Mid-run joins and knight changes
- **Late joins** are accepted only during the build phase. The new player spawns at the base with a
  **full build meter** (a Commander with 2 soldiers), a card offer, and no cards or class growth yet
  (§15.11 #99). A phone that joins during combat sees "Joining at the next build phase" until then.
- Enemy scaling and the Flyer composition check are recalculated at the next wave start, from the
  players connected at that moment.
- Players **cannot change knight** mid-run.

### 11.3 Player disconnect
- **Identity:** on join, the relay issues a reconnect token, stored on the phone. Reconnecting with the
  token restores the same player slot, and the host keeps that player's full state while they're gone.
  After the relay's token window (30 s), the host still matches a returning phone to its slot by player
  key (§15.6).
- **Dazed state:** while disconnected, the knight stops and turns translucent. Enemies can't target it.
  Its meter doesn't fill and it doesn't regen; its builds stay and keep working; a Commander's squad
  holds at the flag or around him.
- **The slot is held for the whole run.** A disconnected player is never removed mid-run; they stay
  dazed until they reconnect, at any time. Player-count scaling and the Flyer check count only players
  connected at the start of each wave (§9, §9.4).
- **What players see:**
  - On the phone: a "Reconnecting…" overlay.
  - On the TV: a reconnecting icon on that player's nametag.
- **Pausing:** the game auto-pauses if every player is disconnected at once, or while the TV's browser
  tab is hidden (browsers stop animation frames there anyway). Any player can also pause the whole run
  from their phone (§10.5). The three are independent: the run moves only when none applies, and a
  phone coming back doesn't clear a team pause.
- **iOS backgrounding:** when the page becomes visible again (`visibilitychange`), the phone reconnects
  immediately with its token.

### 11.4 Input freshness
- **Phones send at a fixed rate,** not only when input changes:
  - 20–30 Hz while any control is touched.
  - A 5 Hz heartbeat while idle.
- **The host treats input older than 250 ms as neutral:** sticks zeroed, buttons released. A dropped
  phone must never leave its knight running in the last direction.

### 11.5 Host refresh or crash: resume
- **Snapshot:** the host saves a run snapshot to its browser storage (`localStorage`, so it survives a
  browser crash) at the start of every build phase, and again on every change during the build phase
  (purchases, card picks, requests). The snapshot contains (§15.8):
  - difficulty and run seed
  - wave number
  - base HP and repair purchase count
  - team coins
  - every team shop purchase and tier
  - **builds on the map:** each one's kind, owner, position and its HP or charges left (and the rally
    flags)
  - each player slot's name, color, knight, HP, **build meter, class growth,** upgrade cards, current
    card offer and pick, and reconnect identity (player key and device ID, §15.8), plus the party
    leader
  - each Commander's **squad soldiers** (HP and Veterans gains)
  - the wishlist and the run's per-player stats (for the summary screen)
- **Room survives:** the relay keeps the room alive for about 2 minutes after the host disconnects, so a
  reloaded TV reclaims the same room code with its host token. Phones stay joined.
- **Resume:** after a reload, the TV offers "Resume wave N." Resuming restores the latest snapshot: the
  build phase of wave N as it was last saved. Any progress from the interrupted combat phase is lost.
- **Expiry:** if the room has expired, the snapshot can still resume, but phones must rejoin. Players
  are matched back to their slots by device ID where possible (reconnect tokens and player keys belong
  to the old room code), and otherwise pick a free slot.
- The snapshot is cleared when the run ends in a win or a loss.

## 12. v1 scope

- 4 classes (tank, marksman, support, control) with one knight each: Warden, Ranger, Artificer and
  Commander, each with one build and one passive card.
- 48 upgrade cards (§6.1), per-wave class growth and the team shop (6 items, §6.2).
- 1 map: an open field with 6 portals.
- 1 look: neon knights (§2.1).
- 3 difficulty levels (§2.2), Normal by default.
- **1–6 players,** solo included.
- All 7 enemy types plus 1 boss that returns at waves 5, 10 and 15 (Mk I–III).
- The developer debug panel (§9.5) and the balance harness (§15.9).
- Audio: a small set of sound effects (for example the base alarm, hits, boss wind-ups, builds and
  purchases). No music.
- Everything in §13 is out of scope for v1.

## 13. Later (v2+)

Ideas deferred from v1. Build v1 so these can be added without rewrites.

| Item | Notes | v1 prep |
|---|---|---|
| More builds (the build idea pool) | The menu for future knights; see the table below | Build behaviors are modules registered by `BuildId`, with traits in content (§7.3, §15.4) |
| Personal currency | Each knight earns a personal currency (power cells) to spend as upgrade points in stat categories. It overlaps with the upgrade cards, so v2 decides whether it replaces or complements them | Stats already go through the modifier system |
| More team shop items | The v1 shop is thin on purpose (§6.2) | Shop items are content |
| Terrain and temporary walls | v2 maps bring permanent walls; a temporary wall build (tank) reroutes enemies with wall pathing, including Brute and Colossus wall targeting | The map format has a `blocked` tile kind and flow fields price terrain (§3.1, §15.5) |
| Squad solo mode (likely v3 or v4) | One knight of each class. The player switches "focus" between them, controlling the focused knight with its full actions; bots control the other three. The build phase is longer, because one player decides for all four. (Not 1-player play, which v1 has) | Knights read input through an input-source interface (phone controller now, bot later), never directly from the network |
| More classes and knights | 2–3 knights per class; new classes (for example a squad leader) | Classes and knights are separate content (§15.4) |
| More passive cards | The tower-defense v2 passive candidates as cards where they still fit (Spotter, Bulwark, Stonefoot, Salvage, Inspire) | Passive cards are modules |
| Dynamic camera | Zooms and pans to keep all players in view (Smash Bros. style) | Render through a camera abstraction, even though v1 keeps it fixed |
| Endless mode | Survive as long as possible, high score | None needed |
| More maps, each with its own boss | New maps, each with its own boss. The first candidates are the Warlord (stays back behind a shield and summons enemies; killing the summoners drops the shield) and the Burrower (tunnels and resurfaces at a different portal) | Map layout and boss are defined by config, and boss behavior is its own module |
| Card reroll | Reroll your 3 offered cards, paid from team coins | Offers are generated by one seeded function, so a reroll just calls it again |
| Critical hits | Crit chance and crit damage cards | Damage goes through one function, so crit is one extra step there |
| Elite enemy variants | Modifiers such as armored or fast | Enemy stats come from config, so a variant is a stat override |
| Music | v1 ships sound effects only (§12) | The presentation layer carries an audio map (§15.4), so music is more entries plus a player |
| Enemy back views | Back views for the common walkers (§2.4) | Rig views are looked up per rig from data, so a new view is data, not code (§15.2) |
| Hunter v2 behavior | Walks in and waits where nothing that shoots can hit it; attacks a player within the Ranger's range; otherwise waits for a player below 50% HP (always targeted) or a Brute to shelter behind (Foster, C3) | The Hunter is its own `ai` module with a threat map (`ai/threat.ts`) |
| End-of-run stats banners | The summary shows **all** of the run stats for each player in a per-player banner, like a fighting-game results screen (user, RC0). v1 keeps the §4 summary: waves survived, per-player stats and one award card per player | `RunStats` already holds every per-player stat (§15.6), so this is summary layout only |

**Build idea pool** (from REDESIGN §C5, with Foster's mechanics notes; best-fit class):

| Build | Input | Mechanics | Best fit | Status |
|---|---|---|---|---|
| Shield generator | Thrown | Knights and squad in range take less damage; range shown | Tank | v1 Warden |
| Mines | At feet | Up to 3 active; translucent; short trigger delay; ground enemies only | Marksman | v1 Ranger |
| Healing beacon | Thrown | Heals allied knights in a small area | Support | v1 Artificer |
| Rally flag + squad | Thrown | The squad fights at the flag; soldiers come from his super | Control | v1 Commander |
| Pulse turret | Thrown | Like the tower-defense pulse turret but weaker; enemies treat it as a knight. Deals damage; not a decoy | Marksman | Pool |
| Shock net | Thrown | Like the tower-defense shock net (slows ground enemies crossing it), with a stronger slow | Control | Pool |
| Nanite bomb | At feet | Mine-like; on trigger, infects nearby enemies for 3–4 s with damage over time | Control (area denial); also marksman | Pool |
| Stun trap | At feet | Stuns the enemy that triggers it | Control | Pool |
| Magnet box | Thrown | Pulls enemies in range toward it for about 2–3 s; pulled enemies can still attack and be hit; the boss is immune | Control; also tank (pull enemies into himself) | Pool |
| Oil slick | Thrown (oil drips along the flight path) or at feet (a trail for 3–4 s while the knight moves); undecided | Oil on the ground that can be lit on fire | Control | Pool |
| Damage station | Thrown | Boosts allies' damage in an area; has HP and is attacked | Support | Pool |
| Buff station variants | Thrown | Same as the damage station, buffing another stat (for example movement speed) | Support | Pool |
| Robot pet | Thrown | Chases enemies and fights back; limited HP and attack, but can defeat a few enemies before dying | Marksman (peels enemies off a ranged knight); also tank | Pool |
| Temporary wall | In front of the knight, facing direction | Reroutes enemies using wall pathing (including Brute and Colossus wall targeting) | Tank | Waits for maps with structure |

A build meant to draw fire needs more than the default rule (a taunt or a larger aggro radius), since
every HP build already draws fire; none in v1 (the decoy idea became the pulse turret).

## 14. Open / under discussion

1. **Name:** the game stays **Fort Frenzy** (`fort-frenzy.fostercurtis.dev`; app folder and game ID
   unchanged). Before any public or Steam release, check it against Steam, itch.io and the USPTO
   trademark database. ("Stronghold" was dropped because of Firefly Studios' *Stronghold* series.)
2. **Numbers to set in playtesting:** every one lives in `src/content/balance.ts` (§15.4); the spec
   states starting values and stops there. Open: the baseline knight HP and each knight's damage,
   ranges and cooldowns; the class HP tiers, damage bands and growth; super charge rates and sources;
   build meter passive and action rates; build HP, charges, radii, throw ranges, trigger and arm delays,
   the shield generator's reduction and the beacon's heal rate; the squad cap and soldier stats; regen
   delay and percentage; respawn times and the difficulty multipliers; the hot share and the active
   portal cap; wave budgets and per-wave enemy multipliers; coin rate and shop prices (the §6.2 curve);
   card numbers; aggro and leash radii, the Hunter's lock-on range and sprint, and the Flyer's range.
   - **Main-attack cooldowns start at 0.4 s or more** (the Artificer's at 0.8 s or more). Attacks fire
     once per release (§10.1), so Haste only matters while the cooldown is longer than a fast tap.
   - **Balance watches:** regen vs support healing (§5); an empty field feeling flat (§3.1); ranged
     knights taking too few hits (Siege targeting and the Flyer's range are the first answer; revisit
     after playtesting); the Ranger covering two sides from the middle (§8.2).
3. **Passive regeneration:** settled by the redesign (§5, REDESIGN A6).
4. **Sound effects (settled 2026-10-29, §15.11 #34):** Foster supplies Kenney.nl CC0 packs in
   `audio/kenney/<pack>/` (with each pack's `License.txt`); the build picks the set from them and
   converts it to `.mp3` in `audio/neon-knights/`. Every file gets a license entry (§15.10).
5. **Art status:** the neon-knights art is complete in `art/neon-knights/` (§15.10), the redesign art
   included (builds, portals, redesign effects, the Commander's shield, the Warden's slam group, the
   new icons; merged from `art/redesign`), so the redesign uses no placeholders. Art the redesign
   leaves behind is listed in `art/neon-knights/review/redesign/obsolete.md`: "kept on file" stays
   (the build idea pool), "removed outright" is deleted in RD12 (§2.6). Anything missing falls back to
   the dev-only shapes (§15.2) and text labels for icons.
6. **Map layout:** the v1 map (§3.1, §15.2: 36 × 24 tiles, 6 portals) is a starting layout to tune in
   playtesting. The map shrank from 38 × 28 to give the bottom-edge boss bar (§2.6) its own band inside
   the TV-safe margin; revisit if it plays cramped.
7. **Knight joints:** the knights' pivots were derived from the geometry. Review them in motion,
   especially plumes, weapon grips and the Commander's shield.

---

## 15. Technical design

Decisions and contracts for building §1–§14. Type sketches are TypeScript. **The redesign's sketches
(marked v2) are exact:** RD2 implements them as written in the contract files named in §15.11, which
freeze after RD2 (additive changes only after that). Repo-wide rules are in `PLATFORM.md`; the relay
protocol is in `apps/relay/SPEC.md`. Where this section says "as in Sunny Side", the pattern is in
`apps/sunny-side` (its `SPEC.md` and `BUILD_PLAN.md` §8).

### 15.1 Repo and packages

- **App:** `apps/fort-frenzy`, package `@pcg/fort-frenzy`, game ID `fort-frenzy`, domain
  `fort-frenzy.fostercurtis.dev` (§2.3). Same layout as Sunny Side: `index.html` (TV, `data-entry="host"`)
  and `play.html` (phone, `data-entry="controller"`) as separate Vite entries.
- **Relay and `@pcg/net-client`:** reused unchanged. The relay is game-agnostic (`maxPlayers` 8), so the
  redesign needs no relay change or redeploy (§15.6).
- **Shared packages** (`PLATFORM.md` §4), both TS source importing nothing from `apps/**`. **The
  redesign changes no shared code** (§15.11 #71): `layoutCombat`, `ChargeRing` and `RoundButton` are
  Fort Frenzy's own; the build button reuses the kit's `aimedGesture` and `tapGesture` unchanged;
  `radialGesture` stays exported (frozen API) and unused; catalog validation already accepts
  `minPlayers: 1`.
  - **`@pcg/controller-kit`** (DOM only, never Phaser):
    - platform: Wake Lock, a manual **full-screen button** (`createFullscreenButton`: no automatic
      full screen on tap; where the API is missing, e.g. iPhone Safari, it opens the Add-to-Home-Screen
      sheet instead), landscape lock after full screen is entered, the rotate overlay,
      `touch-action`/viewport setup, safe-area helpers
    - an app shell that wires the platform pieces on by default, the overlays (reconnecting, host away,
      rotate) and a screen router that reuses DOM between screens in the same group
    - input widgets: the floating joystick (radius, dead zone, idle opacity and ease-back as
      parameters), the hold button, the nearest-center router with hit slop, hold-to-confirm, the
      **aimed-button gesture**, the tap gesture and the radial-drag gesture (unused here, §15.7)
    - a schema-driven input sender: tuple layout, counters, fixed rate while touched (§15.6)
    - the `?dev=1` fake client and screen switcher harness, plus DOM helpers
  - **`@pcg/game-kit`** (no Phaser, no DOM in the core entry):
    - the fixed-step loop and `catchUpSteps`, `lerp`/`lerpAngle`
    - the seeded RNG (§15.3)
    - host helpers: visibility pause, host Wake Lock, `relayUrl`, QR helper, the `window.__pcg` debug
      installer
    - `@pcg/game-kit/vite`: the `/play` rewrite plugin and the LAN URL banner plugin
- **Extraction-ready folders inside the app** (not packages until a second consumer exists, §1, §9.3):
  - `src/host/systems/<name>/`: `modifiers`, `effects`, `damage`, `cards`, `waves`, `flowfield`. Each
    imports only `@pcg/game-kit` and its sibling systems, never Fort Frenzy content, sim or render code.
    Game data comes in as parameters.
  - `src/host/party/`: roster, player-key and device-ID matching, leader and handoff, colors, names,
    ready and lobby removal.
  - ESLint enforces both, so extracting later is a folder move.
- **App layout** (v2):

```
apps/fort-frenzy/
  index.html  play.html  vite.config.ts  vercel.json  playwright.config.ts  game.meta.ts
  SPEC.md  REDESIGN.md  REDESIGN_BUILD_PLAN.md  BUILD_PLAN.md (TD history)
  art/neon-knights/     the art set (layout in its README.md, §15.2, §15.10): rigs/<id>.json,
                        sprites.json, characters/ enemies/ structures/ effects/ map/ (SVG sources),
                        icons/ (§2.6), review/ (reference only, never built)
  audio/neon-knights/   .mp3 SFX
  audio/kenney/<pack>/  Kenney CC0 source packs (Foster's drop; the build picks and converts from them)
  assets/LICENSES.json  one entry per asset or pack (§15.10)
  scripts/              build-atlases.ts, replay.ts, soak, bench, balance (Node)
  src/
    shared/        messages.ts (protocol), ids.ts, theme.ts (brand.css mirror), relayUrl
    content/       balance.ts (every tuning number, §15.4), map.ts, index.ts, types.ts
    presentation/  types.ts, shared.ts (phones + TV: display names, icons, portraits),
                   host.ts (TV only: atlases, rigs, clips, SFX, map frames)
    host/
      sim/         deterministic run simulation: world, systems, step order, run phases, economy;
                   builds/ (build behaviors by BuildId), autopilot/ (bots, per-knight build policy)
      systems/     extraction-ready systems (above)
      party/       extraction-ready lobby/party (above)
      net/         relay wiring, input sources, phone state sync, intent routing
      render/      Phaser rendering: camera, layers, rigs, clips, bloom, effects
      scene/       the World scene's views; scene/builds/<build>.ts per build (import.meta.glob)
      audio/       SFX player and cues
      ui/          the TV's DOM overlay (HUD and full-screen screens)
      debug/       debug panel (§9.5), replay recorder
    controller/    phone app (DOM)
    styles/        brand.css (brand kit)
```

- **No theme layer** (§2.1, §15.11 #64). `src/themes/` becomes `src/presentation/`
  (`PresentationShared`, `PresentationHost`, the rigs and clips; §15.4): it stays a presentation
  boundary the sim can't import, minus theme selection (§15.11 #68). There is no theme id, theme row
  or theme intent.
- **Art stays in `art/neon-knights/`** (and audio in `audio/neon-knights/`), not flattened
  (§15.11 #67): `build-atlases.ts` treats `art/<set>` as the root, the rig clips import rig JSON by path,
  the art README and review sheets cite the path, and the art agent owns the folder. Nothing reads art
  from outside it.
- **Lint boundaries** (root `eslint.config.js`; a shared-config change, so it runs the full gate):
  - `src/host/{sim,systems,party}/**`: no `phaser`, no `@pcg/net-client`, no `src/presentation/**`
    (was the `themes` pattern), no DOM.
  - `src/host/{sim,systems}/**`: no `Math.random`, `Date.now`, `performance.now` or `new Date()`
    (determinism, §15.3).
  - `src/host/{systems,party}/**`: no imports from `src/content`, `src/host/sim` or other app folders.
  - `src/controller/**`: the existing rule (no Phaser, nothing under `host/`).

### 15.2 Engine and rendering

- **Phaser 4.2.x** renders only; it never owns game state (as in Sunny Side). **No physics engine:** the
  sim moves bodies kinematically, with circle hitboxes, a uniform spatial hash for "who's near me"
  queries and soft separation, collision against `blocked` tiles (none on the v1 map), and knockback as
  a velocity impulse with damping. Our attacks hit enemies' body capsules (§2.5, §9, C4); the debug
  hitbox overlay (§9.5) draws each enemy's capsule as a 0.6 stadium over its feet circle, and the
  gallery's too.
- **Canvas:** 1920 × 1080 logical, `Scale.FIT`.
- **Screen layout** (W = 48 px tile width, depth 28.8 px per §2.5):

Everything sits inside the brand's 96 px TV-safe margin (`--space-tv-safe`) on all four sides.

| Band | Screen y | Holds (§2.6) |
|---|---|---|
| Top margin | 0–96 | nothing (TV-safe) |
| Top HUD | 96–136 | wave and phase (left), base HP bar centered directly above the Citadel, team coins (right); "Citadel under attack" under the bar at low HP |
| Headroom | 136–216 | the Citadel's keep, core and smoke plumes rise into it (§3.6) |
| Playfield | 216–907 | 36 × 24 sim tiles, x 96–1824; during the build phase, ready status and the wishlist overlay its right side |
| Bottom HUD | 907–984 | boss bar (boss waves); purchase announcements stack bottom-left. The build phase's next-wave card is 156 px tall (828–984, x 600–1760, clear of the announcements): it ends on the bottom edge and overlays the playfield's last rows so enemy icons (120 × 88, shrinking to 56 wide with tighter spacing when a wave has many types, so none is cut) read from the couch (C1); the text block is only as wide as its text and the icons follow it (RC2) |
| Bottom margin | 984–1080 | nothing (TV-safe) |

- **Map v1** (`src/content/map.ts`, §15.4): 36 × 24 tiles, all `open` except the Citadel footprint
  (cols 16–19, rows 0–1) and the portal tiles. Portals (§3.1): `bottom-w` cols 9–10 row 23, `bottom-e`
  cols 25–26 row 23, `left-n` col 0 rows 11–12, `left-s` col 0 rows 18–19, `right-n` col 35 rows
  11–12, `right-s` col 35 rows 18–19. Enemies spawn just outside the edge at the portal and walk in.
  A starting layout to tune (§14).
- **Camera:** every world-to-screen conversion goes through one interface, so the v2 dynamic camera
  (§13) is a new implementation, not a rewrite.

```ts
interface Camera {
  /** World (tiles; z = height in tiles) → screen px, applying the §2.5 projection. */
  worldToScreen(x: number, y: number, z?: number): { sx: number; sy: number };
  /** Ground ellipse radii for a world circle of radius r (rx = r·W·k, ry = rx·0.6). */
  groundEllipse(r: number): { rx: number; ry: number };
  /** Zoom factor k (1 in v1). */
  readonly scale: number;
  update(dtMs: number, focus: readonly { x: number; y: number }[]): void; // no-op in v1
}
// v1 FixedCamera: sx = 96 + x·W, sy = 216 + y·W·0.6 − z·W
```

- **Layers** (v2), bottom to top:
  1. ground: map tiles, portals (idle and flare frames), the Citadel plate
  2. ground overlays: red danger markers (the Colossus Charge lane included), build rings and
     footprints (`shield-base`, `beacon-pulse`, `mine-blast-ring`, `brute-target`, the dotted build
     effect-radius ellipses, the rally-flag ring), `shockwave`, `landing-dust`, `charge-dust`,
     `slam-cracks`, player rings (with the amber super-ready pulse, §10.1), the Field Medic circle,
     range previews, AoE rings (all 0.6 ellipses of sim circles), the amber-filled bar, cone, circle
     and throw-landing aim previews and the throw range ring (§10.1; the sim's `hitShape` and
     `throwShape`, code-drawn), build and in-flight shadows
  3. **world**, one y-sorted layer: **builds** (mines translucent once live), the Citadel, units,
     soldiers, flyers, arcing projectiles and thrown builds and soldiers. Sort key = foot point; flyers,
     arcing projectiles and anything thrown sort by their shadow.
  4. effects: hit sparks, tracers, muzzle flashes, plumes, `shield-shimmer-*`, `mine-blast`,
     `brute-target-arrow`, `portal-flare`
  5. world UI: nametags and HP bars (flipping below near the top edge, §2.1), the violet enemy and
     amber build HP bars (§2.6), the Stalker lock-on flash, the Rally Cry "×2"
  6. HUD (screen space)
  Rings and footprints always sit under the build or knight they belong to.
- **Ground, world or effects:** each non-rig frame's `layer` in `sprites.json` is one of:
  - `ground` (layers 1–2): anything flat on the ground, as its own frame.
  - `world` (layer 3): upright things, plus builds, projectiles, shells, scrap and the deploy beacon.
  - `effects` (layer 4): flashes, sparks, heal glints, the shock crawl, the shield shimmer, blasts.
  - No frame is on two layers, so a knight standing on a build's footprint is never drawn behind it.
- **What's Phaser and what's DOM:** layers 1–5 are Phaser, since world UI moves with entities every
  frame and needs interpolation and y-sorting. The **HUD and the full-screen TV screens** (home, lobby,
  summary) are a **DOM overlay** over the canvas, scaled with it to the 1920 × 1080 logical size. They
  reuse `brand.css` (chamfers, `drop-shadow` glow, fonts) and the same SVG icon badges as the phones,
  with crisp text; the bloom doesn't touch them.
- **Bloom:** one threshold bloom on the composited world (layers 1–4) at half resolution. The threshold
  catches amber `#e8a33d` and violet `#8f6bff` and never the gunmetal and violet-iron shades (§2.5). SVG
  glow filters are stripped at rasterize time (§15.10), so nothing double-glows.
- **Rigs** (§2.4): each character, enemy and the mortar is a rig. Its parts are atlas frames.
  Animation clips live in code as keyframe tracks per part; the rig JSON says where parts are.

```ts
type ViewId = 'side' | 'front' | 'back';
interface RigDef {
  id: string;                                // rig id: 'warden', 'colossus', 'mortar'
  viewBox: [number, number, number, number]; // shared by every part in every view: parts stack at rest
  views: Partial<Record<ViewId, RigView | RigPoses>>; // enemies, Colossus, mortar: side only (§13)
  /** Named part groups, hidden unless code turns the group on: { banner, sword } (Commander),
   *  { 'core1-full', ... } (Artificer gauge = build meter), { slam } (Warden), { mk2, mk3, final }
   *  (Colossus, cumulative), { ii, iii, band1, band2, band3 } (mortar). */
  optional?: Record<string, string[]>;
}
/** A view with several part sets (the Ranger: 'stand' and 'ready', §2.4); others have one. */
interface RigPoses { poses: Record<string, RigView>; defaultPose: string }
interface RigView {
  foot: [number, number];                    // anchor, sprite units
  parts: Record<string, {
    frame: string;                           // '<rig>/<view>/<part>'
    pivot: [number, number];
    parent?: string; at: [number, number];   // attach point on the parent
    tint?: 'player';                         // grayscale color part only; player color multiplied over it
    emissive?: boolean;                      // glow piece (knights' <host>-glow, drawn right after its
                                             // host); code can pulse/brighten it
  }>;
  order: string[];                           // back-to-front for this view (and pose)
  /** Named points that ride on a part: nametag, badge, muzzle, shield, hammer-ground, pack, eyes, top, ... */
  attach?: Record<string, { part: string; at: [number, number] }>;
}
interface Clip { durationMs: number; loop: boolean; tracks: Record<string, Keyframe[]> }
interface Keyframe { t: number; rot?: number; dx?: number; dy?: number; sx?: number; sy?: number;
  alpha?: number; glow?: number; order?: string[] } // order: per-key draw-order swap (Colossus legs)
```

- **Every part in every view:** per §2.4's full-size rule, each view (and pose) lists every part,
  including parts fully hidden at rest, so animation can bring any part into view. Never drop a part
  because it's hidden at rest. Draw order is per view: in back views, arms come before the cloak or
  cape and pauldrons after it, and the Artificer's backpack is the last body layer.
- **Poses:** the Ranger has two part sets per view, `stand` (idle, walk) and `ready` (Steady Aim,
  firing). Steady Aim crossfades from `stand` to `ready`; firing without Steady Aim snaps to `ready` for
  the shot. Every other rig has one pose per view.
- **Frame names:** a frame's name is its file path under its category folder (`characters`, `enemies`,
  `structures`, `effects`, `map`), without `.svg`. Rig ids are the knights' code ids (`warden`,
  `ranger`, `artificer`, `commander`) and the enemies' art names (`drone`, `skitter`, …, mapped from
  enemy ids in `PresentationHost.rigFor`).
  - Rig parts: `<rig>/<view>/<part>`, or `<rig>/<view>/<pose>/<part>` for posed rigs
    (`ranger/front/ready/bow`). Single-view rigs (enemies, the Colossus, the mortar) use `side`.
  - Every other frame is listed in `sprites.json` with its viewBox, anchor, layer, tint and attach
    points (for example muzzles per aim frame).
  - Builds: `shield-gen/<state>`, `beacon/<state>` (`flight landed active damaged destroyed`),
    `mine/<armed|trigger>`, `rally-flag/<ring|pole|cloth|cloth-trim>` planted and
    `rally-flag/flight-<pole|cloth|trim>` in flight; anchor (0, 0) = ground center.
  - Sentries: `sentry/<loadout>/<aim>` (loadouts `base dmg rng max`, aims `l dl c dr r`), origin at the
    mount point (§3.6).
  - Citadel: `citadel/<part>` and the damage overlays `citadel/dmg-cracks`, `dmg-fire`, `dmg-smoke`
    (atlas frames, since every crack is hand-drawn); `citadel/rubble` is the destroyed end state.
  - Scrap: `effects/scrap-ours-1`…`5` (1–2 footman-sized, 3–5 build-sized), `effects/scrap-theirs-1`…`5`.
  - Effects: projectiles (`bolt`, `nanite-bolt`, `bombard-shell`, `boulder`, `wasp-shot`) and muzzle
    flashes point along +x from (0, 0) and rotate to their projected direction; `shock-crawl` scales to
    the slowed enemy's leg height; the redesign effects (`shield-base`, `shield-shimmer-1…3`,
    `beacon-pulse`, `mine-blast-ring`, `mine-blast`, `brute-target`, `brute-target-arrow`, `shockwave`,
    `landing-dust`, `charge-dust`, `slam-cracks`, `slam-cracks-wide`, `portal-flare`) are placed and
    scaled per the art README's "Effects" table.
  - Map: `map/ground/1`…`4` (1 on most tiles, 2–4 sparsely by a seeded hash of the tile),
    `map/edge/<n s e w ne nw se sw>` on border tiles except portal tiles,
    `map/portal/<bottom|left|right>-<idle|flare>` (anchored at the edge midpoint between a portal's two
    edge tiles; every bottom portal uses `bottom-*`, side portals their side's frames), and
    `map/decor/*`. `floorLift` (`PresentationHost.map`) is added to every ground, edge and decor frame
    at draw time (Phaser ADD tint; portals keep their glows untinted), so the floor reads lighter than
    its art: it lifts the #262b33 stone to #62676f, enough for the violet-iron hulls and the ink
    outlines to stand off it, and still below the bloom (§15.11 #43).
  - Status effects (§6.1): `burn-1`/`2` and `corrosion-1`/`2` loop at about 8 fps, anchored
    bottom-center on the body at the top of its legs, at 0.7 of its height, capped at 4× the
    frame (RC2: about halfway between the old full-height flame and #159's 0.45, only the Colossus
    capped, §15.11 #159, #161); `stun-1`…`4` loop
    centered on the enemy's `top` point.
  - Frames kept on file but unused (the tower-defense structures, `review/redesign/obsolete.md`) stay
    in `sprites.json` and the atlas until RD12 deletes the "removed outright" ones.
- **Facing and aim snapping:** side views mirror for left. Knights and footmen take the view from the
  stronger axis of aim (while attacking) or movement, and switch axis only when the other axis is 15%
  stronger. Aim frames switch only once the target angle is 8° past a sector boundary. Projectiles
  rotate to their projected screen direction; Wasp drones mirror only.
- **Composing a rig:** walk the view's `order`, skip parts whose `optional` group is off, and rotate
  each part about its pivot, chained through its parents. Glow pieces are normal frames whose alpha or
  glow code may raise. The Colossus swaps its legs' draw order mid-stride with `Keyframe.order`. A
  knight's `badge` point may sit above the rig's viewBox, over the helm. The knights' one-piece
  front/back `legs` (and `legs-glow`) are drawn as two halves cropped at the crotch, `legs.l`/`legs.r`
  (back view `legs.bl`/`legs.br`), so clips move each leg on its own (§15.11 #37). A clip may be solved
  per view as `<clip>@<view>` (the down pile); the rig plays the variant for its current view. The
  Warden's smash and jump slam switch the `slam` group on at impact and hide `hammer`/`hammer-glow`
  (front and back views; the side view turns `hammer` to rot 64), per the art README. A clip does the
  switch with `Keyframe.groups` (`{ slam: true }` from that key on; a group no key names follows
  `setGroup`), and hides the upright hammer with `alpha` keys until the recover (#113).
- **Renderer API** (`src/host/render/types.ts`): the FF3-fix-1 and FF8 additions stay
  (`RigInstance.clipMs`, `clipDone`, `EffectSpawner.burst`, `bodyBurst`, `scrap`, `arcWave`). RD10 adds
  `MarkKind` `brute-target`, `brute-target-arrow` and `charge-dust`, and `mark`'s optional `flipX`
  (mirrors a frame about its anchor). RD5 adds the **build-view API** (a view per `BuildId` under `src/host/scene/builds/<build>.ts`, found with
  `import.meta.glob`: create, update from the sim's `BuildEnt` each frame, destroy), which freezes after
  RD6. A view exports `view: BuildViewFactory` (`id`, `create(ctx): BuildView`); the scene
  (`scene/buildsView.ts`) fills a `BuildViewState` (phase, ground point, throw height and progress, HP
  fraction, effect radius, clock, the beacon's `nextPulse`) from each `BuildEnt` and holds a destroyed build's wreck 600 ms
  before the `scrap-ours` pile. `render/buildKit.ts`'s `LifecycleBuild` is the shared life cycle
  (flight spin and shadow, `landed` → `active`, `damaged` below 50% HP, the dotted effect ellipse, the
  amber bar once damaged, an optional footprint and cycling dome), so a build's view only names its
  frames. `EffectSpawner.mark(kind, sx, sy, ms, scale)` places the fading ground and effect frames
  (`slam-cracks`, `slam-cracks-wide`, `landing-dust`, `portal-flare`; RD7 adds `shockwave`,
  `mine-blast-ring`, `mine-blast`). RD7 also adds `BuildViewState.triggered?` (a mine in its delay) and
  `LifecycleBuild`'s `liveAlpha` and `trigger` look fields, so the mine's view still only names its
  frames (#123).
- **Pooling:** render-side only. Phaser objects for projectiles, effects, damage numbers, HP bars and
  Swarm units come from per-kind pools; sim entities are plain objects, not pooled.
- **Interpolation:** the renderer draws positions lerped between the last two sim steps (as in Sunny
  Side), keyed by entity id; spawned entities draw at their current position, removed ones disappear.
  A body drawn at its ground point (every enemy, the Wasp included: its hover height is art, not the
  sim's `z`) lerps on the ground at both ends; heights lerp only between heights (C3, §15.11 #44).
  The Wasp's flight height is `render/clips/wasp.ts` `WASP_FLIGHT_TILES` (its art's own lift plus the
  render hover `WASP_HOVER_TILES`), and its content body's `bottom` matches it (C4, §15.11 #50).
  Thrown builds and soldiers draw along their sim `Flight` (§15.3) with a code-drawn arc height.
- **Per frame,** render code changes only alpha, crop and scale of existing objects (HP bars, rings,
  meters); it never re-uploads text or rebuilds graphics (the TD plan's FF7-fix-1, FF8, FF9 lessons).
- **Missing frames:** a dev-only fallback draws a labeled shape for the ID (sized from its hitbox), so a
  missing asset never breaks a build. Production builds fail the atlas check instead (§15.10).
- **Performance budget** (v2), measured at peak load: **6 knights, 30 soldiers, 150 enemies, 100
  projectiles, 24 builds** (6 Rangers × 4 mines with Minefield), on an integrated GPU laptop (Intel Iris
  Xe class) at 1080p: whole frame ≤ 16.7 ms, one sim step ≤ 2 ms, bloom ≤ 2 ms. The TV measures it in
  its stress mode, `?debug=1&stress=1` (FF15): the real sim and World scene with no phones, six
  autopilot knights (every knight) on wave 15 against the Colossus Mk III held in its final phase,
  Swarm packs topping the crowd up to 150, 24 builds, 30 footmen and 100 projectiles
  (`&peak=synthetic` scatters the whole roster instead), with an overlay of frame time, CPU render
  submit, bloom (GPU timer query, else bloom on − off) and the sim step's mean and p99. Agents can't
  judge GPU performance (headless software GL); the stress mode is for a real TV.

### 15.3 Simulation

- **Loop:** fixed 60 Hz steps with an accumulator, a catch-up cap and render interpolation, from
  `@pcg/game-kit` (as in Sunny Side). The debug 2× speed runs two steps per frame slot. The host
  runs no steps while the TV tab is hidden, while every run player is disconnected, or while the team
  is paused (§10.5; that one also holds the debug `advance` stepper). A pause is outside the sim: no
  command, no replay entry, just no steps.
- **One deterministic sim owns the whole run** from the countdown to the summary: phases and timers,
  combat, builds and meters, regen, economy, shop, cards and growth, and scaling. The lobby is outside it
  (`party/`); a run starts from `RunStart { seed, settings, slots }`. Everything that changes run state
  enters as either an **input sample** or a **command** at the start of a step, which is what makes
  replays exact.
- **Entity model: ECS-lite.** Plain typed arrays per entity kind, and pure system functions run in a
  fixed order. No ECS library, no class hierarchy.

**Sim types (v2, `src/host/sim/types.ts`).** Unchanged from the TD build unless shown: `Body`, `Unit`,
`StatBlock`, `StatusEffect`, `AttackState`, `ProjectileEnt` (minus the structure parts below),
`DangerMarker`, `TileGrid` (minus `occupant`), `SpatialHash`, `BaseState`, `SimCtx`, `AttackEvent`,
`DamageCalc`, `DamageResult`, `HealResult`, `HealCalc`, `EffectApplyEvent`, `Hooks`, `Modifier`,
`ModuleDef`, `EffectDef`, `BossBehavior`, `BossAct`, `RunSlot`, `RunStart` (`SimCtx.unit` also resolves builds). Removed: `StructureEnt`,
`CratePile`, `ThrownCrate`, `World.structures`, `World.cratePiles`, `World.thrown`,
the wall-smashing field and `FlowFields.dirty`, `TileGrid.occupant`, every `LaneId`, `StructureId` and
theme id use.

```ts
/** A thrown build or soldier in the air (§7.3): it lands at `to` on `landsAt`. */
export interface Flight { from: Vec2; to: Vec2; launchedAt: number; landsAt: number }

export interface PlayerEnt extends Unit {
  slot: number; classId: ClassId;             // the knight (ClassId = KnightId, §15.4)
  name: string; color: PlayerColorId; connected: boolean;
  respawnAt: number | null;                   // dead until this tick (§5)
  superCharge: number;                        // 0..1
  meter: number;                              // build meter 0..1 (§7.2); starts the run at 1
  main: AttackState; super: AttackState;
  burst: NaniteBurst | null;                  // the Artificer's blast still firing; never saved (RD8)
  build: AttackState;                         // the build button: queued press, aim, held (§10.1)
  mainAim: Vec2 | null; superAim: Vec2 | null;
  buildAim: Vec2 | null;                      // live aim while a thrown build is held (TV preview)
  /** Regen (§5): no regen before `quietUntil` (5 s after the last damage, main or super); next tick at `nextRegen`. */
  regen: { quietUntil: number; nextRegen: number };
  stillTicks: number;                         // Steady Aim
  flag: Vec2 | null;                          // Commander's rally flag, standing or landing (null = following)
  squadSeeded?: boolean;                      // Commander: his starting soldiers were given (once a run)
  growth: { regular: number; boss: number };  // class growth bumps received (§6.1)
  cards: Partial<Record<CardId, number>>;
  offer: CardId[] | null; picked: CardId | null;
  ready: boolean; invincible: boolean;
  run: RunStats;
}
// Removed from the TD PlayerEnt: crates, kits, radialOpen, radialSlot, lastBuilt, ghost.

export interface SoldierEnt extends Unit {
  owner: number; index: number; veterans: number;
  mode: 'follow' | 'rally';
  target: EntityId | null;
  attack: AttackState;
  flight: Flight | null;                       // thrown by Reinforcements; joins on landing
}

export interface EnemyEnt extends Unit {
  kind: EnemyId; flying: boolean;
  portal: PortalId | null;                     // where it spawned (was `lane`)
  group: number;
  ai: 'path' | 'aggro' | 'return' | 'attack' | 'siege' | 'hunt' | 'boss';
  target: EntityId | null;                     // a knight, soldier, build or BASE_ID
  leashFrom: Vec2 | null;                      // where it left its way (the leash is measured from here)
  dropped?: EntityId;                          // the target it let go at the leash (RD10-fix-1, §9)
  hunting: number | null;
  huntSince?: number;                          // Hunter, Brute: tick it locked on (drives the flash, §9.6)
  locked?: boolean;                            // Hunter: locked on and sprinting (§9)
  huntBuild?: EntityId;                        // Brute: the build it is going for (RD10)
  attack: AttackState;
  wander?: { side: number; pace: number; until: number };
  boss?: { mk: 1 | 2 | 3; stagger: number; staggeredUntil: number | null; finalPhase: boolean;
    act?: BossAct | null; ready?: Record<string, number>; stunAt?: number | null };
}
// HP and damage are baked at spawn: difficulty × player-count table × WaveDef.enemyMult (§2.2).
// BossAct.kind for the Colossus: 'slam' | 'boulder' | 'charge' (the tell) | 'chargeRun' | 'call' (the
// wall attack is gone). BossAct.hit? lists who the run already hit (RD10).

/** A placed build (§7). A Unit so it takes damage through `applyDamage` and carries card mods. */
export interface BuildEnt extends Unit {
  kind: BuildId;
  owner: number;                               // the knight's slot
  seq: number;                                 // placement order per owner (oldest mine goes first)
  state: 'flight' | 'landed' | 'active';       // a destroyed build is removed (event `buildGone`)
  flight: Flight | null;
  targetable: boolean;                         // HP builds (BuildDef.traits.targetable)
  charges: number | null;                      // mines; null for HP builds and the flag
  liveAt: number;                              // tick it starts working (landing + switch-on, mine arming)
  triggerAt: number | null;                    // mines: a ground enemy set it off; bursts at this tick
  nextPulse: number | null;                    // beacon: next heal pulse tick
}

export interface FlowFields {
  ground: FlowField;                           // built once per run (no rebuilds, §15.5)
  hunted: (FlowField | null)[];                // per hunted player, by slot
  brute: Record<number, FlowField>;            // per targeted build, keyed by its tile index (§15.5)
}

export interface TeamState {
  coins: number;
  shop: Record<ShopItemId, number>;
  wishlist: { item: ShopItemId; slot: number }[];
  /** Fixed at each wave start from the players connected then (§9.4, §11.3). */
  scaling: { players: number; budget: number; bossHp: number; respawnMs: number;
    activeCap: number; flyers: boolean };
}

export interface PendingSpawn {
  atTick: number; portal: PortalId; enemy: EnemyId; count: number;
  hot: SideId | null;                          // the hot side at this pulse (debug only; null before RD3)
  flared: boolean;                             // portal flare sent (§9.4, `rules.flareMs` ahead)
}

export interface RunSettings { difficulty: DifficultyId }

export interface World {
  tick: number; phase: Phase; wave: number;
  phaseEndsAt: number | null; seed: number; settings: RunSettings; nextId: EntityId;
  players: PlayerEnt[]; soldiers: SoldierEnt[]; enemies: EnemyEnt[];
  builds: BuildEnt[];
  projectiles: ProjectileEnt[];
  markers: DangerMarker[];                     // telegraphs, the Charge lane included
  spawns: PendingSpawn[];
  grid: TileGrid; fields: FlowFields; spatial: SpatialHash;
  base: BaseState; team: TeamState;
  events: SimEvent[];
}
export type Phase = 'countdown' | 'build' | 'combat' | 'victory' | 'defeat' | 'summary';
// ProjectileEnt.from: KnightId | EnemyId | BuildId | 'archer'; blockedBy is gone (nothing blocks shots).
// DangerMarker.payload.hitsStructures becomes hitsBuilds. DangerMarker.shape adds 'lane' (RD10): the
// Charge's path from (x, y) to (x2?, y2?), `r` to each side; it only shows, the run itself hits.
```

- **Input sources** (§13 squad solo mode): knights only ever read an `InputSource`.

```ts
export interface PlayerInput {
  move: Vec2; mainAim: Vec2; superAim: Vec2; buildAim: Vec2; // −1..1; aim 0,0 on a fire = auto
  mainAiming: boolean; superAiming: boolean; buildAiming: boolean;
  mainFires: number; superFires: number; buildFires: number; // counters
}
export interface InputSource { sample(tick: number): PlayerInput }
// PhoneInputSource (§15.6 staleness), AutopilotInputSource (§15.9), ReplayInputSource (§15.9)
```

  The first sample after a (re)connect only baselines the counters; a counter going backwards (phone
  reload) re-baselines without firing (as in Sunny Side).
- **A build press** (`buildFires` grows) resolves from the state at the step it lands (§15.11 #97): in
  combat, alive and connected, with `meter` = 1 → place (at-feet) or throw toward `buildAim` (thrown;
  0,0 = the knight's feet), emptying the meter and removing the knight's oldest build over `maxActive`;
  else a Commander with a flag out → recall; else nothing.
- **Commands** (v2):

```ts
export type SimCommand = (
  | { c: 'presence'; slot: number; connected: boolean }
  | { c: 'join'; slot: number; name: string; color: PlayerColorId; classId: ClassId }
  | { c: 'ready'; slot: number; ready: boolean }
  | { c: 'buy'; slot: number; item: ShopItemId }
  | { c: 'request'; slot: number; item: ShopItemId; on: boolean }
  | { c: 'card'; slot: number; card: CardId }
  | { c: 'debug'; slot: number; action: 'jumpWave'; wave: number }
  | { c: 'debug'; slot: number; action: 'spawn'; enemy: EnemyId; portal: PortalId }
  | { c: 'debug'; slot: number; action: 'invincible'; on: boolean }
  | { c: 'debug'; slot: number; action: 'coins'; amount: number }
  | { c: 'debug'; slot: number; action: 'meter'; target?: number } // every knight's meter, or `target`'s (RD6)
  | { c: 'debug'; slot: number; action: 'hot'; side: SideId | null } // force the hot side; null clears (RD6)
) & { ref?: number };
// Removed: build (select/place/cancel), give.
// `Sim.debugHot` reads the forced side (the debug panel's readout); the sim keeps it outside `World`.
```

- **Step order** (v2):
  1. apply this step's commands (logged order)
  2. sample every slot's `InputSource`; diff press counters into main, super and build fire events
  3. knights: movement, attacks and supers, build presses (place, throw, recall), passive meter fill
     (combat only), regen ticks
  4. builds: flights land, switch-on and arming, mine triggers and bursts, shield generator `guard`
     re-applied and beacon pulses (combat only)
  5. AI: enemies (path, aggro leash over knights and HP builds, Brute build hunt, Siege priority,
     Hunter stalk and sprint, flyer, runner), soldiers (thrown soldiers land and join), the boss module
  6. integrate movement, soft separation, `blocked`-tile collision
  7. projectiles and area attacks → `applyDamage` (ours hit enemy bodies, `sim/body.ts`, C4: the
     content body swept up the screen as a ground capsule, `segmentHitsBody`, `circleHitsBody`,
     `sectorHitsBody`; candidates from `SpatialHash.queryBox`, which looks the tallest body's reach
     south of the shot); enemy attacks on knights, soldiers, HP builds and the base
  8. status effects, `onTick` hooks, auras (combat only)
  9. deaths: hooks, coins; destroyed builds removed; Hunter fields re-priced when a build appeared or
     went
  10. wave spawner (portal flares `rules.flareMs` ahead)
  11. phase checks: wave cleared, boss dead, base destroyed, build timer (on the deadline: random card
      picks, then combat)
- **Determinism rules:** timers are whole steps; all randomness comes from seeded streams; no wall clock
  in the sim (lint, §15.1); arrays iterate in id order and every sort tie-breaks by id. Replays are
  exact on the same JS engine (`Math.sin` and similar may differ between browsers). A **state hash**
  (FNV-1a over a canonical serialization of `World`) checks determinism in tests and replays.
- **RNG** (`@pcg/game-kit`): a small seeded PRNG plus named streams derived from (seed, label), so one
  stream's use never shifts another's. Streams: `waves:<n>` (groups, portals, hot sides and shifts),
  `cards:<wave>:<slot>` (offers), `cardPick:<wave>:<slot>` (the deadline's random pick, §10.2),
  `combat:<wave>` (all in-combat randomness: Scrap-mite jitter, the nanite blast's spread, Rally Cry
  rolls; FF10 keeps each mite's drift, pace and re-roll tick in `EnemyEnt.wander`).

```ts
interface Rng { next(): number; int(lo: number, hi: number): number; pick<T>(xs: readonly T[]): T }
function rngStream(seed: number, label: string): Rng; // hash(seed, label) → sfc32-style generator
```

- **Modifiers and hooks:** one interface for passive cards, cards, class growth, status effects, auras,
  build behaviors and boss behaviors. Hooks run per entity in attach order, then status effects in
  application order. (`Hooks` is unchanged from the TD build: `onTick`, `onAttack`, `modifyOutgoing`,
  `modifyIncoming`, `beforeEffect`, `onDamageDealt`, `onDamageTaken`, `onHeal`, `onKill`, `onDeath`,
  `onPhase`, `modifyHeal`.)

```ts
interface Modifier { id: string; stats?: StatMod[]; hooks?: Partial<Hooks> }
// ids: 'card:fire_arrows', 'card:steady_aim' (passive cards), 'growth' (class growth), 'effect:burn',
// 'build:shield_gen'. Modules are registered by id and built from content params:
function defineModule<P>(id: string, make: (params: P) => Modifier): ModuleDef<P>;
```

- **Class growth** is one `growth` modifier per knight, rebuilt from `PlayerEnt.growth` and the class's
  `ClassDef.growth` whenever a bump lands (end of every wave; the boss bump after boss waves).
- **Stats:** `value = base × (1 + clamp(Σ addPct, min, cap)) + Σ add` (§6.1: stacks add, never multiply).
  Caps come from config (range, movement speed and damage reduction: +40%). A knight's base `maxHp` is
  `rules.knightHp × ClassDef.hp`; the class's `damage` band multiplies the base damage of its main and
  super (never its build's, never its squad's), baked in when the knight is created.
- **Status effects:** one timed-effect system (§6.1). Each effect carries a source, a strength, a
  duration in steps and a stacking policy. **Auras** (Field Medic, Vanguard, Morale, the shield
  generator's `guard`) are short effects re-applied each combat step to units in range, with `refresh`
  (`guard`: `strongest`).

```ts
interface EffectDef { id: EffectId; stacking: 'refresh' | 'strongest' | 'stack'; maxStacks?: number;
  tickEveryMs?: number; modifier: (strength: number) => Modifier }
interface StatusEffect { def: EffectId; strength: number; remaining: number; stacks: number;
  source: EntityId | null }
// v2 effects: burn, poison, stun, slow (strongest), morale (damage, attack speed and move speed),
// shield (Overflow), aura_field_medic, aura_vanguard (refresh), guard (strongest; shield generator),
// taunt (refresh; Challenger: enemies in aggro range pick this knight first)
```

- **Damage pipeline:** every hit goes through one function (§13 crits).

```ts
interface DamageCalc { source: EntityId | null; target: EntityId; amount: number;
  kind: 'melee' | 'ranged' | 'area' | 'dot' | 'contact' | 'shell'; tags: readonly string[] }
function applyDamage(ctx: SimCtx, calc: DamageCalc): DamageResult;
// 1 base → 2 attacker modifyOutgoing (Might, Giant Slayer, Skyhunter, Steady Aim, morale, Last Stand)
// → 3 crit (no-op in v1) → 4 target modifyIncoming (Toughness, Vanguard, base armor), the card
// reduction capped at +40%; then the `guard` reduction (strongest generator), outside that cap
// → 5 shields (Overflow) → 6 HP → 7 events: super charge and meter charge (by source: §7.2, §8.3;
// tags 'build', 'super', 'squad' pick the rule), boss stagger, run stats, onDamageDealt/Taken,
// death hooks, coins
```

  Difficulty, player-count and wave multipliers are baked into stats at spawn, not applied per hit.
  Damage from a build carries the tag `build` and its owner as `source`; soldiers' damage carries
  `squad` with the soldier as `source`; supers tag `super`.
- **Healing:** `ctx.heal` runs the healer's `modifyHeal` (Triage), then the target's `onHeal`
  (Overflow), and charges per §8.3 (beacon healing tagged `build`, the super's tagged `super`). Regen
  (§5) is not a heal: it sets HP directly, with no hooks, charge or stats (§15.11 #98).
- **Boss behaviors** are modules, so new bosses (§13) don't touch the Colossus.

```ts
interface BossBehavior {
  id: string;                                    // 'colossus'
  init(ctx: SimCtx, boss: EnemyEnt, variant: { wave: number; mk: 1 | 2 | 3 }): void;
  tick(ctx: SimCtx, boss: EnemyEnt): void;       // picks attacks, emits DangerMarkers with wind-ups
  onDamage?(ctx: SimCtx, boss: EnemyEnt, r: DamageResult): void;  // stagger meter
}
// The Colossus: slam and boulder (Mk I), + Charge (Mk II: a 'lane' DangerMarker from the boss past
// its target knight, then the run, hitting knights and soldiers once and knocking them aside,
// destroying HP builds and triggering mines it crosses), + call Runners and the final-phase shockwave
// (Mk III). Boss-wave rules shared by every
// boss (spawn at a seeded hot-side portal, the Mk, death collapsing the wave) live in
// `sim/boss/index.ts`.
```

- **Events** (`src/host/sim/events.ts`, an append-only registry): the TD members for crates,
  structures, placement, give/throw and lane warnings are removed. RD2 adds the members the redesign
  needs, at least: `buildPlaced { slot; build: EntityId; kind }`, `buildLanded { build }`,
  `buildHit { build }`, `buildGone { build; kind; destroyed: boolean }`, `mineTrigger { build }`,
  `mineBurst { build }`, `recall { slot }`, `portalFlare { portal }`, `bruteTarget { enemy; build }`,
  `huntLock { enemy; slot }`, `reinforce { slot; count }` (count 2 = the "×2"), `growth { slot; boss }`
  and `cardAuto { slot; card }` (a deadline pick). Later milestones append. RD3 appends
  `buildHp { build; kind; owner; hp; maxHp }`: an HP build's bar data, sent when it lands and with
  every `buildHit` (mines and the flag never send it). RD3-fix-1 appends
  `windupCancelled { source; slot }`: a knight's wound-up attack was cut short (down, dazed, phase
  end), so the TV calls off its impact and leaves the clip. RD9 appends
  `warcry { slot; targets; durationMs }`: the knights Warcry reached, which the TV flashes (the Morale
  card has no visual, so the `morale` effect alone can't drive it). The thrown-build aim preview is
  `buildPreview(p, content, aim = p.buildAim)` in `sim/preview.ts`: `{ kind, from, landing, radius,
  range }` (tiles), null when not aiming or for at-feet builds. `soldierPreview(p, content, aim =
  p.superAim)` is the same for Reinforcements (radius: the soldier's body), and `superHeld(world, p,
  content)` says the squad cap holds the super (the phone's `superBlocked`, no TV pulse).

### 15.4 Data and config

- **Format: TS data modules** in `src/content/`, typed with `satisfies` against
  `src/content/types.ts`. Units: distances in tiles, speeds in tiles/s, times in ms (converted to
  steps at load), damage and HP as numbers.
- **One balance sheet (settled 2026-11-04, §15.11 #48):** every number that affects balance lives in
  `src/content/balance.ts` (§14 #2). It is a **sectioned file**, one `// ==== <Section> ====` banner per
  section so parallel milestones edit only their own: run rules, scaling, classes, one section per
  knight (Warden, Ranger, Artificer, Commander), builds, enemies, Colossus, waves, cards common, cards
  per knight, shop, harness. That covers HP, damage, ranges, areas, timers, speeds, prices, wave
  budgets, meter and charge rates, build stats, and the numbers behind AI and card behavior (aggro and
  leash, Hunter threat cost and lock-on, Swarm jitter, squad engage range, shell minimum flights,
  projectile hit radius, card offer size and rare chance, damage-over-time ticks and stacks).
  `src/content/map.ts` holds the map layout; `index.ts` assembles `Content` (an append-only registry).
- **No numbers in the sim:** card, passive, build, shop and boss modules read every param from
  content (a missing param throws), and the sim reads optional content fields without fallback values.
  What stays in code is engine plumbing, not balance: the step rate, spatial-hash and flow-field
  steering internals (`systems/` can't import content), physics thresholds, spawn scatter and
  render-only arcs.
- **Validation test** (Vitest): every referenced id exists (knights' classes, builds and passive
  cards, card prerequisites, favored enemies, wave pools, guaranteed spawns and their portals, shop
  targets, modules); every knight's passive card is rare and unique; every `requires` has 1 or 2 ids;
  the player-count table has exactly one row per player count 1–6; class growth uses only `maxHp`, `damage` and `healing`; each wave's budget covers its
  guaranteed spawns; every module builds from its content params; every optional field the sim reads is
  present; the phone's card copy quotes the content numbers.

**Ids (v2, `src/shared/ids.ts`).** Lists stay `as const` with `isOneOf`; after RD2 they are append-only.

```ts
/** The knights (§8.2). `ClassId` is the knights' historic wire name and stays an alias. */
export const KNIGHT_IDS = ['ranger', 'warden', 'artificer', 'commander'] as const;
export type KnightId = (typeof KNIGHT_IDS)[number];
export const CLASS_IDS = KNIGHT_IDS;
export type ClassId = KnightId;
/** The classes (§8.1): a knight's playstyle. */
export const ROLE_IDS = ['tank', 'marksman', 'support', 'control'] as const;
export type RoleId = (typeof ROLE_IDS)[number];
/** One build per knight (§7.4). */
export const BUILD_IDS = ['shield_gen', 'mine', 'beacon', 'rally_flag'] as const;
export type BuildId = (typeof BUILD_IDS)[number];
/** The six portals (§3.1) and the three sides. */
export const PORTAL_IDS = ['bottom-w', 'bottom-e', 'left-n', 'left-s', 'right-n', 'right-s'] as const;
export type PortalId = (typeof PORTAL_IDS)[number];
export const SIDE_IDS = ['left', 'bottom', 'right'] as const;
export type SideId = (typeof SIDE_IDS)[number];
/** Unchanged. */
export const ENEMY_IDS = ['grunt', 'runner', 'swarm', 'brute', 'flyer', 'siege', 'hunter', 'colossus'] as const;
/** Team shop (§6.2). The sentry upgrades keep their `archer_*` code ids. */
export const SHOP_ITEM_IDS = ['repair', 'archer_damage', 'archer_range', 'archer_third', 'base_hp',
  'base_armor'] as const;
/** Upgrade cards (§6.1): the 9 commons, then each knight's, in the spec's table order. */
export const CARD_IDS = [
  'vitality', 'might', 'haste', 'reach', 'swiftness', 'focus', 'toughness', 'quick_recovery', 'tinkerer',
  // ranger
  'quick_draw', 'blast_radius', 'shrapnel_charge', 'fire_arrows', 'piercing_shot', 'skyhunter', 'volley',
  'steady_aim', 'deadeye', 'minefield', 'wildfire',
  // warden
  'heavy_slam', 'earthshaker', 'wide_field', 'aftershock', 'giant_slayer', 'unshakable', 'challenger',
  'reinforced_generator', 'fault_line',
  // artificer
  'strong_arm', 'booster_beacon', 'venom_bolts', 'overflow', 'triage', 'field_medic', 'wide_aura',
  'plague',
  // commander
  'heavy_bash', 'forced_march', 'drillmaster', 'siege_breakers', 'veterans', 'last_stand', 'vanguard',
  'rally_cry', 'morale', 'reinforced_ranks', 'warcry',
] as const;
/** Status effects (§15.3). */
export const EFFECT_IDS = ['burn', 'poison', 'stun', 'slow', 'morale', 'shield', 'aura_field_medic',
  'aura_vanguard', 'guard', 'taunt'] as const;
/** Build-button icons (§2.6, §10.1). */
export const ACT_ICON_IDS = ['act-shield', 'act-mine', 'act-beacon', 'act-flag', 'act-recall'] as const;
export type ActIconId = (typeof ACT_ICON_IDS)[number];
/** Unchanged: DIFFICULTY_IDS, PLAYER_COLOR_IDS. */
/** Sound cues (§12); RD13 may append. */
export const SFX_IDS = ['base_alarm', 'base_hit', 'player_hit', 'enemy_hit', 'enemy_death',
  'build_placed', 'build_destroyed', 'boss_windup', 'purchase', 'card_pick', 'wave_start', 'victory',
  'defeat'] as const;
// Removed: STRUCTURE_IDS, LANE_IDS, THEME_IDS (and their types).
```

**Content types (v2, `src/content/types.ts`).** Unchanged unless shown: `Vec2`, `Tile`, `StatMod`,
`ModuleRef`, `EffectApply`, `UnitStats`, `Condition`.

```ts
export type TileKind = 'open' | 'blocked' | 'citadel' | 'portal';

/** Append-only after RD2. The TD crate stats and `repairRate` are gone. */
export const STAT_IDS = [
  'maxHp', 'damage', 'attackSpeed', 'range', 'moveSpeed', 'superCharge', 'damageReduction',
  'respawnMs', 'projectileSpeed', 'arcDeg', 'radius', 'durationMs', 'stunMs', 'healing', 'knockback',
  'throwRange', 'throwSpeed', 'auraRadius',
  // redesign
  'buildCharge',      // meter fill rate (Tinkerer)
  'buildHp',          // the knight's HP builds (Reinforced Generator, Booster Beacon)
  'buildRadius',      // effect / blast radius (Wide Field, Shrapnel Charge)
  'buildPower',       // guard strength, heal per pulse (Reinforced Generator, Booster Beacon)
  'buildTriggerMs',   // mine trigger delay (Shrapnel Charge: negative addPct)
  'buildMax',         // extra active builds (Minefield: add 1)
  'squadCap',         // Reinforced Ranks: add 1
  'squadHp', 'squadDamage', 'squadSpeed', // Drillmaster, Forced March
  'width',            // a `rect` attack's width (Heavy Bash; RD9-fix-1)
] as const;
export type StatId = (typeof STAT_IDS)[number];
// StatMod.scope: 'main' | 'super' | 'build' | 'squad' (was 'passive'; omitted = the whole knight).

export interface AttackDef {
  // 'spawn': Reinforcements (RD9). 'rect': a solid rectangle from the attacker along the aim,
  // `range` long and `width` wide; an enemy body overlapping it is hit (shield bash, RD9-fix-1).
  shape: 'projectile' | 'arc' | 'cone' | 'circle' | 'spawn' | 'rect';
  damage: number; range: number; cooldownMs: number; windupMs?: number;
  arcDeg?: number; width?: number; count?: number; spreadDeg?: number;
  burstMs?: number;                                 // nanite blast: `count` shots over this long
  burstMinReach?: number;                           // nanite blast: nearest spot, fraction of range
  speed?: number; hitsFlyers: boolean; knockback?: number;
  radius?: number; minFlightMs?: number;
}

/** A class (§8.1). Keyed by RoleId; a knight names its class. */
export interface ClassDef {
  id: RoleId;
  hp: number;                                       // HP tier: × rules.knightHp (tank 1.6)
  damage: number;                                   // damage band: × main and super damage (tank 0.9)
  growth: { regular: StatMod[]; boss: StatMod[] };  // per wave cleared; boss waves use `boss`
}

export type InputType = 'aimed' | 'tap';
export type ChargeSource = 'damage' | 'healing';

/** A knight (§8.2). */
export interface KnightDef {
  id: KnightId;
  role: RoleId;
  moveSpeed: number; radius: number;
  main: AttackDef;
  /**
   * `heal`: heals the knight and allied knights in the cone (Artificer). `spawn`: Reinforcements
   * throws `count` soldiers `throwRange` tiles (Commander; Rally Cry may double it).
   */
  super: AttackDef & { effects?: EffectApply[]; heal?: number;
    spawn?: { count: number; throwRange: number; throwSpeed: number; minFlightMs: number;
      spread: number } };                           // soldiers thrown together land this far apart
  build: BuildId;
  input: { main: InputType; super: InputType; build: InputType };  // build mirrors BuildDef.input
  hitsFlyers: boolean;                              // §9 Flyer spawn rule
  /** Super charge per point (§8.3): own damage (main and its build's), healing, squad damage. */
  superCharge: { perDamage: number; perHeal?: number; perSquadDamage?: number };
  /** Build meter (§7.2): passive fill per second in combat, plus per point from `sources`. */
  meter: { perSec: number; perPoint: number; sources: ChargeSource[] };
  passiveCard: CardId;                              // its rare, unique passive card (§6.1)
  /** Commander only (§8.4). */
  squad?: {
    start: number; cap: number;                     // 2 and 4 to start
    soldier: UnitStats;
    followRadius: number;
    aggro: { radius: number; leash: number };
    hurry?: { at: number; factor: number };
    formation: { flagRing: number; followSpread: number };
  };
}

/** A build (§7). */
export interface BuildDef {
  id: BuildId;
  input: InputType;                                 // 'tap' at feet, 'aimed' thrown
  throw?: { range: number; speed: number; minFlightMs: number };   // thrown builds
  hp?: number;                                      // HP builds (targetable)
  charges?: number;                                 // charge builds (mines: 1)
  radius: number;                                   // effect radius: field, heal area, blast, flag ring
  bodyRadius: number;                               // its own hitbox (enemies attack it, Charge crosses it)
  maxActive: number;                                // 1; mines 3
  traits: { targetable: boolean; dealsDamage: boolean; hidden: boolean };
  triggerRadius?: number;                           // mines: a ground enemy this close sets it off
  triggerMs?: number;                               // mines: delay before the burst
  armMs?: number;                                   // placed → live (mine arming, landed → active)
  damage?: number; knockback?: number;              // mine burst
  guard?: number;                                   // shield generator: damage reduction 0..1 (`guard`)
  heal?: { amount: number; everyMs: number };       // beacon pulses
  module?: ModuleRef;                               // its behavior's extra params, if any
}

export interface EnemyDef {
  id: EnemyId; hp: number; speed: number; radius: number; flying: boolean;
  budget: number; groupSize?: number;
  ai: 'path' | 'runner' | 'siege' | 'hunter' | 'flyer' | 'boss' | 'swarm' | 'brute';
  field: 'ground' | 'none';                         // the wall-smashing field is gone
  attack: AttackDef;
  aggro?: { radius: number; leash: number }; slowResist?: number; boss?: ModuleRef;
  /** Hunter (§9): `lockRange` (about 5 tiles) starts the sprint at × `sprint`; its field adds
   *  `threatCost` per sentry or damage-dealing build covering a tile (range + `threatPad`) and
   *  `hiddenCost` on hidden builds' trigger radii. */
  hunt?: { closeRange: number; retargetTiles: number; threatCost: number; threatPad: number;
    hiddenCost: number; lockRange: number; sprint: number };
  jitter?: { drift: number; pace: number; paceRange: number; stopChance: number;
    rollMs: [number, number]; stopMs: [number, number] };
  body?: { radius: number; bottom: number; top: number };
}
// Removed: EnemyDef.vsStructure, CharacterDef (→ ClassDef + KnightDef), StructureDef (→ BuildDef).

export interface CardDef {
  id: CardId; owner: KnightId | 'common'; tier: 'common' | 'rare' | 'combo';
  unique?: boolean;
  requires?: CardId[];                              // 1 (improves a passive) or 2 (combo) ids
  favoredEnemy?: EnemyId; requiresKnight?: KnightId;
  stats?: StatMod[]; module?: ModuleRef;
  perKnight?: Partial<Record<KnightId, StatMod[]>>; // commons: numbers tuned per knight
}

export type UpgradeTarget = 'base' | 'archers';
export type UpgradeEffect =
  | { kind: 'repair'; hp: number }
  | { kind: 'stats'; target: UpgradeTarget; stats: StatMod[] }   // base maxHp, base armor, sentries
  | { kind: 'archers'; add: number }
  | { kind: 'module'; target: UpgradeTarget; module: ModuleRef };
export interface ShopItemDef {
  id: ShopItemId;
  tiers: { price: number; effect: UpgradeEffect }[];
  visibleIf?: Condition; holdToConfirm?: boolean;
  repeatable?: boolean;                             // repair: bought again and again, price rising
}
// Removed: ShopItemDef.qmOnly and afterRegularWaveOnly; UpgradeEffect crates, kit, discharges.

/** Hot-side schedule (§9.4). */
export type HotSchedule = { mode: 'wave'; shifts: 0 | 1 | 2 } | { mode: 'group' };

export interface WaveDef {
  n: number; budget: number; allowed: EnemyId[];
  guaranteed: { enemy: EnemyId; count: number; portal?: PortalId }[];
  durationMs: number;
  hot: HotSchedule;
  enemyMult?: { hp?: number; damage?: number };    // default 1 (§9.3)
  boss?: { id: EnemyId; mk: 1 | 2 | 3 };
}

export interface DifficultyDef { id: DifficultyId; budget: number; enemyHp: number;
  enemyDamage: number; baseHp: number; coinIncome: number; respawn: number }

/** One row per player count 1–6 (§9.4): replaces ScalingDef. */
export interface PlayerCountRow { players: number; budget: number; bossHp: number; respawnMs: number }

export interface MapDef {
  id: string; cols: number; rows: number; tiles: string[];          // ASCII rows
  legend: Record<string, TileKind>;
  portals: Record<PortalId, { side: SideId; entry: Tile[]; spawn: Vec2 }>;
}

export interface BaseDef { hp: number; stages: number[]; alarmAt: number;   // §3.3–§3.5
  archers: { count: number; at: Vec2[]; attack: AttackDef } }              // repairPerCrate is gone

export interface RulesDef {
  startCoins: number; coinRate: number;             // coins per kill = budget × coinRate × difficulty
  countdownMs: number;
  buildCapMs: number;                               // 20 000 (§10.2)
  victoryMs: number; defeatMs: number;
  flareMs: number;                                  // portal flare ahead of a spawn (~1000, §9.4)
  inputStaleMs: number;
  knightHp: number;                                 // baseline knight HP (× ClassDef.hp)
  regen: { delayMs: number; pct: number; everyMs: number };   // 5000, 0.08, 1000 (§5)
  respawnFloorMs: { solo: number; team: number };   // Quick Recovery floor: 4000, 5000 (§5)
  hot: { share: number };                           // 0.55 (§9.3)
  respawn: Vec2[];
  statCaps: Partial<Record<StatId, { pctMin?: number; pctMax?: number; addMin?: number; addMax?: number }>>;
  separation: number; knockbackDecay: number;
  projectileRadius: number; enemySwingSlack: number; enemyShotSlack: number;
  cardOffer: { size: number; rareChance: number };
  dots: Partial<Record<EffectId, { maxStacks: number; tickEveryMs: number }>>;
  comboSpread: { radius: number; durationMs: number };
}
// Removed from RulesDef: respawnMs (→ PlayerCountRow), spawnWarningMs (→ flareMs), dropLockMs,
// pickupRadius, giveRadius, breakerWallCost, fortifyReach.

/** The balance harness (§15.9). */
export interface HarnessDef {
  wave: { enemy: EnemyId; count: number }[];        // 12 grunt, 4 runner, 1 swarm, 1 brute (grouped types count groups)
  portal: PortalId;                                 // 'bottom-w'
  difficulty: DifficultyId;                         // 'normal'
  seeds: number[];                                  // 5 seeds
  bands: [number, number];                          // ±0.20 and ±0.25 of the mean clear time
  durationMs?: number;                              // RD3: the groups spread over this long (30 000)
  capMs?: number;                                   // RD3: longer than this = not cleared (300 000)
}

export interface Content {
  rules: RulesDef; base: BaseDef; map: MapDef;
  classes: Record<RoleId, ClassDef>; knights: Record<KnightId, KnightDef>;
  builds: Record<BuildId, BuildDef>; enemies: Record<EnemyId, EnemyDef>;
  cards: CardDef[]; shop: ShopItemDef[]; waves: WaveDef[];
  difficulty: Record<DifficultyId, DifficultyDef>; scaling: PlayerCountRow[];
  harness: HarnessDef;
}
```

- **As implemented in RD2** (contract fixes, §15.11 #111): `Content` keeps the code's arrays looked
  up by id through the sim's catalog (`knights`, `classes`, `builds`, `enemies`, `cards`, `shop`,
  `waves`, `difficulties`, `scaling: PlayerCountRow[]`) and nullable singletons (`map`, `base`,
  `rules`, `harness`), not records. Transitional fields, each removed by the milestone named:
  `KnightDef.passive?: ModuleRef` (the always-on passive until the knight's kit milestone makes it the
  passive card). RD9 removed the Commander's (`KnightDef.super.selfEffects`, `AttackDef.shape:
  'buff'`, the effect ids `aura_lead_from_the_front` and `haste`). The Colossus's Citadel multiplier
  (`EnemyDef.vsStructure.base`, gone) is its boss param `baseMult` (1.5).
- **Generic system signatures** (extraction-ready, §15.1; Fort Frenzy passes its content in). The
  wave generator takes the redesign's inputs **additively**: Fort Frenzy passes its portal ids as
  `lanes`, each portal's side in `sides`, and the hot schedule, share and cap.

```ts
// systems/waves: spends a budget on a pool and spreads groups over lanes (portals) and time (§9.3)
function generateWave<E extends string>(input: {
  budget: number; pool: { id: E; cost: number; groupSize?: number }[];
  guaranteed: { id: E; count: number; lane?: string }[]; lanes: string[]; durationMs: number;
  substitute?: Partial<Record<E, E[]>>; rng: Rng;
  // v2 (additive): without these, every lane is live and groups go round-robin (RD2)
  sides?: Record<string, string>;                         // lane → side
  hot?: { mode: 'wave'; shifts: 0 | 1 | 2 } | { mode: 'group' };
  hotShare?: number;                                      // budget share to the hot side's lanes
  activeCap?: number;                                     // lanes used per spawn pulse
}): { atMs: number; lane: string; id: E; count: number; hot?: string }[];
// Rules with `hot` set (RD3): every pulse uses ≤ activeCap lanes and at least one hot-side lane;
// the hot side gets `hotShare` of the budget; shifts at 1/2 or 1/3 and 2/3 of `durationMs` to a
// different side; 'group' rolls a side per pulse, never the same twice in a row. A pulse is up to
// activeCap groups at one time; a pinned guaranteed spawn keeps its lane. Fort Frenzy spawns the
// boss itself, at a seeded portal on the first pulse's hot side (§9.3; RD3, #112).
// systems/cards: one pure function, so a v2 reroll is just another call (§13)
function pickOffer<C extends { id: string }>(input: {
  pool: readonly C[]; eligible: (c: C) => boolean; isRare: (c: C) => boolean;
  rareChance: number; guaranteedRare: boolean; size: number; rng: Rng }): C[];
```

  Fort Frenzy's `activeCap` is `min(players + 1, 6)`, fixed at the wave start with the rest of
  `TeamState.scaling`.
- **Presentation** (`src/presentation/`, §15.1) holds presentation only. The sim can't import it
  (lint), the types carry no gameplay fields, and a test fails if an object has keys outside its type.
  The rig contract (`RigDef`, `Clip`, `SpritesJson`) and the generated manifest's shape move here from
  `src/themes/types.ts` unchanged, except that the manifest's `ThemeAssets`/`themes` keying becomes the
  art set (`ArtSetId = 'neon-knights'`, `sets`).

```ts
interface PresentationShared {                   // phones and TV (src/presentation/shared.ts)
  /** The one display-name table (§2.1). */
  names: Record<KnightId | RoleId | EnemyId | BuildId | ShopItemId | CardId | 'base' | 'faction', string>;
  flavor?: Partial<Record<string, string>>;      // knight card lines, card text
  icons: IconSprite;                             // art/neon-knights/icons/*.svg as one inline SVG sprite
  iconFor: {
    knight: Record<KnightId, string>; role: Record<RoleId, string>;
    main: Record<KnightId, string>; super: Record<KnightId, string>;
    build: Record<BuildId, ActIconId>; shop: Record<ShopItemId, string>; card: Record<CardId, string>;
  };
  portraits: Record<KnightId, { body: string; color: string }>; // front-view images (knight select)
}
interface PresentationHost {                     // TV only (src/presentation/host.ts)
  atlases: AtlasRef[]; rigs: Record<string, RigDef>; clips: Record<string, Clip>;
  rigFor: { knight: Record<KnightId, string>; enemy: Record<EnemyId, string>; soldier: string };
  sfx: Partial<Record<SfxId, string>>;           // music joins this map in v2 (§13)
  map: { ground: string[]; edges: Record<'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw', string>;
    portals: Record<SideId, { idle: string; flare: string }>; decor?: string[];
    floorLift?: number };                        // 0xRRGGBB added to ground/edge/decor (§15.2 Map)
}
// Removed: ThemeShared, ThemeHost, the theme id, defaultDifficulty, the structure and lane maps.
```

- **Icons** (`art/neon-knights/icons/`, 24-unit SVG glyphs with `.glyph`, ink and `.glow` layers;
  usage rules in its `README.md`): phones get them as one inline SVG sprite (a `<symbol>` per icon,
  built at build time), so `.glow` takes the CSS `drop-shadow` and badge tiles stay crisp. The TV's DOM
  HUD (§15.2) uses the same sprite. A missing icon falls back to a text label. The three icon lists are
  in §2.6.
- **Knight portraits:** phones never load the TV atlases, but knight select and the lineup show each
  knight's front view in the player's color (§2.6). The atlas script renders, per knight, the front-view
  rest pose as two images: the body, and the color part alone as a mask that CSS tints with the
  player's color. They're lazy-loaded images, outside the phone's JS budget (§15.7).

### 15.5 Pathfinding

- **Flow fields** over the 36 × 24 grid, built with Dijkstra (a breadth-first search that weighs tile
  costs) outward from the tiles next to the Citadel. Each tile stores its distance and the neighbor to
  step to next. The sim's fields take 8-neighbor (octile) steps: a diagonal costs √2 × the entered
  tile's cost and never cuts the corner of an impassable tile (C3, §15.11 #46; the system's default
  stays 4-neighbor).
- **No player walls in v1** (§3.1, §7.3): nothing a knight places changes pathing, so the **ground field
  is built once per run** and never rebuilt. There are no placement-triggered rebuilds and no wall-smashing
  field.
- **Tile costs:** open 1; portal 1; `blocked` and off-map: impassable (none blocked on the v1 map; v2
  terrain is map data).
- **Fields:**
  - `ground`: most walkers, the Colossus included.
  - **`hunted`,** one per hunted player, rebuilt when that player moves to a new tile. Its cost adds
    `hunt.threatCost` per attacker covering a tile (a Citadel sentry or a `dealsDamage` build, within
    its range + `threatPad`) and `hunt.hiddenCost` on tiles inside a `hidden` build's trigger radius,
    so a Hunter stalks round the sentries and the mines when that's cheaper than the time under fire,
    and still reaches a quarry standing in range. The coverage is rebuilt at each combat start (range
    cards and sentries bought in the build phase) and whenever a build appears or goes.
  - **`brute`,** one per targeted build, keyed by the tile the build stands on: a ground field with
    that tile as its goal, built when a Brute first targets the build and dropped when the build goes
    (§15.11 #84). So "straight for the build" still works when v2 terrain arrives.
  - Flyers ignore fields and steer straight at their target.
- **Steering:** an enemy heads straight for the farthest tile down its field's chain (up to 32 tiles)
  that a body-wide corridor (±0.3 tiles) reaches without crossing a tile costlier than the chain's
  next step, so it crosses open ground on a direct diagonal to the Citadel instead of an L-shaped
  route and never shortcuts through a Hunter's priced tiles (C3, §15.11 #46). With nothing farther
  clear it steers toward its next tile's center, blended with the one after so movement doesn't
  zigzag. Plus soft separation from nearby units. Units never hard-block each other.
- **Behavior per `ai`:** `path` follows the ground field and attacks the base, plus knights, soldiers
  and HP builds inside its aggro leash (nearest first; a `taunt` knight first), and on losing its
  target follows the field on from where it stands (`return` is no longer entered; RD10-fix-1); `runner` bursts on base
  contact and attacks nothing else; `siege` walks the ground field and stops once a player, a soldier,
  an HP build or the base is in its range, shelling the highest priority (base > players and soldiers >
  builds, nearest within each), retargeting the moment a higher-priority target enters range; `hunter` stalks its quarry's
  field and locks on within `hunt.lockRange`, then sprints at `hunt.sprint` × speed (retargeting on down, daze or a player
  2 tiles closer, §9); `flyer` flies straight and aggro-leashes like `path`; `swarm` is a `path` walker
  with the in-sim mite jitter; `brute` walks its target build's `brute` field to the nearest
  targetable build at any distance and attacks it, and with none left behaves like `path`; `boss` is
  the boss module.

```ts
interface FlowField { cols: number; rows: number; dist: Float32Array; next: Int16Array } // −1 = goal
function buildField(grid: TileGrid, cost: (tile: number) => number, goals: readonly number[],
  into?: FlowField, opts?: FieldOptions): FlowField;
interface FieldOptions { diagonal?: boolean; solid?: (tile: number) => boolean }
function steerTile(field: FlowField, from: number): number; // farthest clear tile down the chain
```

### 15.6 Network protocol

Relay envelope, rooms, tokens, host reclaim and heartbeats are unchanged (relay SPEC §3). Game messages
ride in `send.data`, defined in `src/shared/messages.ts`.

- **Room:** game ID `fort-frenzy`, relay `maxPlayers` 8 (headroom for a rejoin under a new id); the game
  caps players at 6 and shows a seventh phone "Game full" (§11.1). The room never locks.
- **Handshake:** after `joined`, the phone sends `hello`. A phone with an older `proto` gets `outdated`
  and reloads once; if the host is older, the phone shows "Refresh the TV" and the TV shows a banner.
- **Identity:** slots match a phone by relay `playerId` (token rejoin), then by player key (rejoin after
  the 30 s token window, as in Sunny Side), then by device ID (resume into a new room, §15.8).
- **Input:** a JSON array (the relay carries text frames; about 70 bytes at 30 Hz × 6 phones is
  negligible).
- **Versioning (§15.11 #70):** `PROTOCOL_VERSION` goes **1 → 2** for the redesign (RD1) and stays 2 for
  the whole redesign: phones and TV always ship from one commit, so only the production change matters.
  After that it bumps on any breaking change to `messages.ts`; additive fields don't bump it.

**Messages (v2, `src/shared/messages.ts`).**

```ts
export const GAME_ID = 'fort-frenzy';
export const PROTOCOL_VERSION = 2;
export const NAME_MAX = 10;
export const AIM_DEAD_ZONE = 0.25;                   // unchanged (§10.1)

export const INPUT_TUPLE_LENGTH = 12;
export const INPUT_FLAG_MAIN_AIMING = 1;
export const INPUT_FLAG_SUPER_AIMING = 2;
export const INPUT_FLAG_BUILD_AIMING = 4;            // was INPUT_FLAG_RADIAL_OPEN

/** Phone → host input v2 (§10.1, §11.4). Sticks and aims are ints −100..100, dead zone applied on the
 *  phone. Counters only grow (a reload restarts them; the host re-baselines, §15.3). */
export type InputTuple = [
  moveX: number, moveY: number,
  mainX: number, mainY: number,       // live aim while aiming, the release aim with a fire; 0,0 = tap
  superX: number, superY: number,
  buildX: number, buildY: number,     // thrown builds: live aim, the release aim; 0,0 = tap (feet)
  flags: number,                      // INPUT_FLAG_*: 1 main aiming, 2 super aiming, 4 build aiming
  mainFires: number, superFires: number, buildFires: number, // counters
];
// Guard: length 12; [0..7] ints in −100..100; [8] int in 0..7; [9..11] naturals.

export type Intent =
  | { k: 'name'; name: string }                       // ≤ NAME_MAX code points; color auto-assigned
  | { k: 'class'; classId: ClassId }                  // the knight (knight select)
  | { k: 'ready'; ready: boolean }
  | { k: 'color'; color: PlayerColorId }              // lobby only (`taken`)
  | { k: 'leader'; action: 'start' | 'resume' | 'newRun' }
  | { k: 'leader'; action: 'difficulty'; difficulty: DifficultyId }
  | { k: 'leader'; action: 'remove'; playerId: string }           // lobby only
  | { k: 'leader'; action: 'end'; option: 'again' | 'classes' | 'home' } // 'classes' = Change Knight (§4)
  | { k: 'buy'; item: ShopItemId }
  | { k: 'request'; item: ShopItemId; on: boolean }
  | { k: 'card'; card: CardId }                       // Confirm on the card pop-up (§10.2)
  | { k: 'claim'; slot: number }                      // resume into a new room
  | { k: 'pause'; paused: boolean };                  // team pause, any run phone (§10.5)
// Removed: { k: 'build' } (select/place/cancel), { k: 'give' }, { k: 'leader'; action: 'theme' }.

export type ControllerMsg =
  | InputTuple
  | { t: 'hello'; proto: number; deviceId: string }
  | { t: 'intent'; seq: number; intent: Intent };

/** `cap`: the item is at its max tier. `crates` is gone. */
export type AckReason = 'coins' | 'cap' | 'phase' | 'invalid' | 'notLeader' | 'taken';

/** Per-player run stats (summary, §4; kept in the resume snapshot, §15.8). */
export interface RunStats {
  damageDealt: number;                // own + squad + builds
  bossDamage: number;
  kills: number;
  damageTaken: number;
  deaths: number;
  healingDone: number;                // super, beacon and Field Medic healing (not regen)
  buildsPlaced: number;
}
export const RUN_STAT_KEYS = ['damageDealt', 'bossDamage', 'kills', 'damageTaken', 'deaths',
  'healingDone', 'buildsPlaced'] as const;
/** Unchanged shape: result, wavesSurvived, durationMs, players[{ playerId, name, color, classId,
 *  stats, award: keyof RunStats | null }]. One award card per player; RD13 writes the copy. */
export interface RunSummary { /* as in the TD build */ }

export type TeamPhase = 'lobby' | 'countdown' | 'build' | 'combat' | 'summary' | 'restoring';

export interface TeamShopRow {
  id: ShopItemId; tier: number; maxTier: number;
  price: number | null;               // null = sold out (max tier)
  visible: boolean; holdToConfirm: boolean;   // qmOnly is gone
}

/** Team state every phone shows. Full snapshot, broadcast on change, ≤ 5 Hz. */
export interface TeamView {
  phase: TeamPhase; wave: number; buildEndsInMs: number | null;
  coins: number; baseHp: number; baseMaxHp: number;
  difficulty: DifficultyId;           // `theme` is gone
  leaderId: string | null;
  roster: TeamRosterEntry[];          // unchanged
  shop: TeamShopRow[];
  wishlist: { item: ShopItemId; by: string }[];
  nextWave: { enemies: { id: EnemyId; count: number }[]; boss: boolean } | null; // never the hot side
  summary: RunSummary | null;
  paused?: TeamPause | null;          // unchanged (§10.5)
}

export type MeScreen = 'name' | 'lobby' | 'waiting' | 'full' | 'combat' | 'build' | 'dead' | 'summary'
  | 'restoring' | 'claim';            // unchanged: `build` shows the card pop-up until
                                      // `cards.picked` is set, then the shop (§10.2)

/** The build button (§10.1). */
export interface MeBuild {
  id: BuildId;
  input: InputType;                   // the gesture now: 'tap' for at-feet builds and recall
  icon: ActIconId;                    // act-shield | act-mine | act-beacon | act-flag | act-recall
  meter: number;                      // 0..1 ring
  full: boolean;                      // steady amber ring, button lit
  mode: 'place' | 'recall' | 'none';  // what a release does now; 'none' = dimmed
  active: number;                     // the knight's builds on the map (mines 0..maxActive)
}

/** Class growth for the pop-up header (§6.1): "Wave 4 cleared: +HP +DMG". */
export interface MeGrowth { wave: number; boss: boolean; stats: ('maxHp' | 'damage' | 'healing')[] }

/** One phone's own state. Full snapshot, per phone on change, ≤ 10 Hz. */
export interface MeView {
  screen: MeScreen;
  slot: number | null; name: string; color: PlayerColorId | null; classId: ClassId | null;
  isLeader: boolean; ready: boolean;
  hp: number; maxHp: number;
  superCharge: number; superReady: boolean;          // 0..1 ring; full state (§10.1)
  superBlocked: boolean;                             // Commander at the squad cap: dimmed, charge held
  build: MeBuild | null;                             // null outside a run
  respawnMs: number | null;
  /** The pop-up (§10.2): selection is phone-local; Confirm sends `card`. `offer` null = no pop-up
   *  (late in the phase after a pick, or none dealt); `picked` set = show the shop. */
  cards: { offer: CardId[] | null; picked: CardId | null; owned: { id: CardId; n: number }[];
    growth: MeGrowth | null };
  claim: { slot: number; name: string; classId: ClassId }[] | null;
}
// Removed from the TD MeView: crates, carryCap, action, kits, give, arc, buildKit, build (the ghost).

export type HostMsg =
  | { t: 'team'; rev: number; team: TeamView }        // broadcast on change, ≤ 5 Hz
  | { t: 'me'; rev: number; me: MeView }              // per phone on change, ≤ 10 Hz
  | { t: 'ack'; seq: number; ok: boolean; reason?: AckReason }
  | { t: 'outdated'; proto: number };
```

- **Gestures are resolved on the phone** (tap, drag or cancel), which has the touch timing and pixel
  distances. A release goes out at once, so a fire and its aim arrive together.
- **Send rate:** a fixed 30 Hz while any control is touched, 5 Hz while idle, plus every button edge
  immediately. (Sunny Side sends sticks only on change, which a held-still thumb would starve under the
  250 ms rule.)
- **Staleness (§11.4):** the host stamps each input with its receive time. Older than 250 ms, the
  `PhoneInputSource` returns zero sticks and cleared flags; counters still apply when they arrive.
- **Menu actions are intents,** discrete messages with a `seq`, answered by `ack`. Movement, combat and
  builds stay pure input state (`PLATFORM.md` §2's rule covers movement; Sunny Side already sends
  discrete UI messages). Intents that change run state become sim commands (§15.3) and are logged for
  replays.
- **Card pick:** `card` is valid in the build phase while the player's offer is open and holds the card
  (else `invalid` or `phase`). At the deadline the host picks for every player with an offer and no pick,
  from the `cardPick:<wave>:<slot>` stream (§15.3).
- **State sync:** `team` and `me` are full snapshots with an increasing `rev` (the phone drops older
  ones), never diffs, so one message of each kind fully restores a phone after a reconnect. The host
  sends both on every `hello` and rejoin.
- **Lobby and presence** (`party/`): colors auto-assigned in brand order (cobalt, jade, sky, bone, rose,
  forest; §2.3), skipping colors already chosen; first joiner leads, with handoff per §11.1; the
  party's minimum is `game.meta.ts` `minPlayers` (1). The `color` intent maps to `party.setColor`:
  lobby only and not while that player is ready (ack `phase`), a color another member holds acks
  `taken` (no swap), an unknown player or color acks `invalid`. Relay `peer left` → a `presence` command
  makes the knight dazed (§11.3); `rejoined` or a key match restores it. A phone joining during combat
  gets `waiting` and becomes a late join at the next build phase: in a build phase it enters a name,
  picks a knight and taps Ready, which takes the next free slot (`party.joinLate`, then the sim's
  `join` command) and spawns the knight at the base with a full meter (a Commander with his starting
  squad) and a card offer. A resume (§15.8) rebuilds the party from the snapshot with `party.restore`
  (every slot away, matched by key or device ID), and `party.claim` lets an unknown phone take a slot no
  phone has matched; `party.screen` returns `claim` for it while such slots exist.
- **Team pause** (§10.5, FF14-fix-1): a `pause` intent from any phone with a run slot, in the
  countdown, build or combat phase (otherwise `phase`); pausing an already paused run keeps the first
  pauser, resuming a running one is a no-op, both ack `ok`. While paused, `team.paused` names who paused
  (absent when running) and reaches every phone in the `team` broadcast; intents that become sim
  commands, and a late join, ack `phase`. Input tuples still arrive while paused, and each
  `PhoneInputSource` subtracts the presses counted between the pause and the resume (`hold` /
  `release`), so nothing fires on resume. The summary's run time leaves the pause out.
- `messages.ts` is a frozen contract (§15.11).

**TV overlay view (v2, `src/host/ui/types.ts`).** Unchanged except: `HomeRow` loses its `theme` row
(`difficulty`, `resume`, `newRun`, `create` remain); `TvView.laneWarnings` is removed (the portal
flare is drawn in the World scene from the sim's spawn plan and `portalFlare` events, not the DOM
overlay; §15.11 #104); `Announcement.item` is a v2 `ShopItemId`. No other field changes.

### 15.7 Controller app

- **DOM and CSS, no canvas** (as in Sunny Side), built on `@pcg/controller-kit`. The screen comes from
  `me.screen`; reconnecting, host away and rotate are phone-local overlays. Screen groups that share a
  view (so a held thumb survives a switch): `combat` and `dead`; `lobby` and knight select; `build`
  (the card pop-up and the shop: the shop's movement stick shares the combat view's stick so a held
  thumb survives the pick).
- **Components:** plain TS DOM components, no framework (as in Sunny Side and the kit): `Badge` (icon +
  tile state, §2.6), `RoundButton`, `ChargeRing` (the super's pulsing ring and the build meter's
  steady ring), `StatusStrip`, `UpgradeCard`, `ShopRow`, `HoldConfirm`, `Toast`, `LineupRow`,
  `ClassCard` (portrait, §15.4). Each screen composes them and re-renders from the latest `team` and
  `me`. `src/controller/copy.ts` is a sectioned file (one section per knight, commons, shop, lobby and
  summary); its per-knight sections hold each knight's main and super input types (from content; a
  test checks they match) and card text.
- **Combat layout (§10.1)** comes from a pure function, `layoutCombat(viewport, safeInsets) → rects`,
  turning the percentage positions and fixed sizes into px rectangles, with the 60 px build button and the label rectangles.
  Unit tests check its rules at several viewports (644×300 to 1366×1024 landscape): gaps ≥ 24 px,
  button edges ≥ 64 px from the right and bottom, every button ≥ 56 px. A Playwright test screenshots
  it on real viewports (as in Sunny Side).
- **Gestures** (`controller-kit`, pure state machines with DOM adapters, unit-tested without a DOM):
  - **Aimed button** (mains, aimed supers, thrown builds): down → `pending`; released within 150 ms
    inside the dead zone → `tap` (fire, aim 0,0); dragged out → `aiming` (aim flag set, vector clamped
    to 70 px); released outside the dead zone → `fire` with the aim; released inside it after aiming →
    `cancel`. Fort Frenzy passes its dead zone to the kit (`controller/input.ts` `aimGesture`:
    `AIM_DEAD_ZONE` = 0.25 of the clamp; the kit default stays 12%). The sim hides the held aim
    (`PlayerEnt.mainAim`/`superAim`/`buildAim` null; `AttackState.held` `cancelled`) while the aiming
    flag is set and the aim is inside `AIM_DEAD_ZONE`, and shows it again once it is back out
    (FF7-fix-5). The phone's tuple ints (`aimInts`) round onto the same side of the zone as its own px
    test, so the TV shows a preview exactly when a release would fire.
  - **Tap button** (tap supers, at-feet builds, the Commander's recall): fires on release (§10.1).
  - The build button swaps between the two gestures when `me.build.input` changes (the Commander's
    recall), and is inert while `me.build.mode` is `none`. An aimed build uses the same floating aim
    zones as the attacks (build aiming flag 4, `buildX`/`buildY`, `buildFires`). The kit's radial
    gesture is unused.
- **Super ring, build ring, status strip, build icon:** drawn from `me`; the rings animate between
  updates. The flash and 1.2 Hz pulse on `superReady` are CSS animations; the build ring's full state is
  a steady amber ring. Buttons and menu items use the icon set's lit badges; a dimmed build button shows
  its glyph at 35% on the plain tile (icons `README.md`).
- **Card pop-up:** full screen, no stick; tapping a card selects it locally (amber edge), Confirm sends
  `card`; once `me.cards.picked` is set the view switches to the shop. The header renders
  `me.cards.growth`.
  Ready stays in the top bar on both screens (the coin count, shop only, sits left of it); Confirm
  locks for 1.5 s after it sends, so a double tap makes one intent.
- **Shop:** right 2/3, the stick on the left third; hold-to-confirm (0.6 s) on items with
  `holdToConfirm`; Request toggles; Ready top right; purchase failures show the `ack` reason as a toast.
- **Team pause (§10.5):** the combat and build views share one pause control (`createPauseControl`):
  the top bar's button and the paused card, both from `team.paused`. Going into a pause resets the
  view's gestures and zeroes the sticks; the input sender keeps running, so the host sees the counters
  it has to swallow.
- **Dev samples:** the `?dev=1` harness has sample `me`/`team` states for the card pop-up, the shop, each
  knight's build button states (charging, full, recall) and the squad-cap super.
- **Bundle budget:** `play.html` loads ≤ 100 KB gzipped JS, with no Phaser and no atlases, only
  `src/presentation/shared.ts` (the icon sprite and portrait images load as assets, outside the JS
  budget). `check-bundle` enforces the per-app limit.

### 15.8 Resume snapshot

- **Storage:** `localStorage` key `fort-frenzy:run` (survives a browser crash, unlike Sunny Side's
  `sessionStorage`). Versioned JSON; a version mismatch or a snapshot older than 12 hours is discarded,
  never migrated.
- **Version:** the redesign's snapshot is **`v: 3`** (RD1 used 2 for the renamed ids; RD2's shape is 3), and `v` bumps whenever its shape changes, so old
  saves are discarded (§15.11 #70).
- **When:** written at the start of each build phase and on every run-state change during it,
  debounced to 250 ms and flushed on `pagehide`. Cleared when the run ends (§4).
- **Device ID:** a random ID the phone keeps in `localStorage` (`fort-frenzy:deviceId`), not tied to any
  room, sent in `hello`. It's how a resume into a new room matches phones to slots (§11.5), since
  reconnect tokens and player keys belong to a room code.
- **No RNG state:** every stream is derived from (seed, label), so a restored card offer is identical
  and a refresh can't reroll it.

```ts
export const SNAPSHOT_VERSION = 3;

export interface SnapshotBuild {
  kind: BuildId; owner: number;                      // the knight's slot
  seq: number;                                       // placement order (oldest mine goes first)
  x: number; y: number;                              // tiles (builds don't snap, §7.1)
  hp: number | null;                                 // HP builds; null for mines and the flag
  charges: number | null;                            // mines; null otherwise
}
export interface SnapshotSlot {
  slot: number; playerKey: string; deviceId: string;
  name: string; color: PlayerColorId; classId: ClassId;
  hp: number; meter: number;                         // build meter 0..1
  growth: { regular: number; boss: number };
  cards: Partial<Record<CardId, number>>; offer: CardId[] | null; picked: CardId | null;
  stats: RunStats;
  /** Commander only: each surviving soldier's HP and Veterans gains, by index. The flag is a
   *  SnapshotBuild (`rally_flag`). */
  squad?: { soldiers: { hp: number; veterans: number }[] };
}
export interface RunSnapshot {
  v: typeof SNAPSHOT_VERSION;
  savedAt: number; build: string;                    // wall clock (host only); commit hash
  settings: { difficulty: DifficultyId; seed: number };
  wave: number;
  base: { hp: number; repairs: number };             // max HP follows the base_hp tiers in `shop`
  coins: number;
  shop: Record<ShopItemId, number>;
  builds: SnapshotBuild[];
  slots: SnapshotSlot[];
  leaderKey: string | null;
  wishlist: { item: ShopItemId; slot: number }[];
  runMs?: number;                                    // run time before the save (summary duration)
}
// Removed from v1: settings.theme, structures, cratePiles, slot crates/kits/lastBuilt, squad.size and
// squad.flag (the flag is a build).
```

- **Resume flow:** on reload, the host reclaims the room (phones stay joined and show "TV is
  restoring…"). The TV offers "Resume wave N (saved X min ago)" or "New run", focused on Resume and
  driven by keyboard or gamepad; the leader's phone can choose too. If the relay hands back a new room
  instead, the TV shows the new code; rejoining phones are matched by device ID, and any others see the
  `claim` screen listing free slots.
- **What a resume restores** (FF14): the build phase of the saved wave with its full build timer; the
  knights stand at the base with their saved HP, meter, growth and cards; cooldowns and super charge
  start over; builds come back where they were with their HP or charges (a build saved in flight lands
  where it was headed); each Commander's soldiers come back around him (or at his flag) with their HP
  and Veterans gains. A saved run reclaims (or creates) the room as soon as the TV loads, and the TV's
  home screen shows the Resume / New run rows with the room code. New run drops the snapshot and goes
  to the lobby with the phones that are there. Any phone with no slot sees `claim` while a restored
  slot is still unmatched, in the same room or a new one.
- **Implementation:** `sim/snapshot.ts` takes (`takeSnapshot`), checks (`parseSnapshot`) and restores
  (`restoreSnapshot`, run by `createSim` when `RunStart.snapshot` is set) snapshots; the host's
  `net/resume.ts` does the storage and `net/session.ts` the timing. A restore is deterministic: two
  restores of one snapshot hash the same and play on identically, and the restored world gives the same
  snapshot back.
- A resume starts a new replay segment that begins from the snapshot (§15.9).
- A team pause (§10.5) isn't in the snapshot: one saved while paused restores unpaused, into the build
  phase as above.

### 15.9 Testing

- **Headless sim:** `src/host/sim` and `src/host/systems` run in Node under Vitest with no Phaser and no
  DOM, driven by input sources and commands.
- **Replays (developer tool, not player-facing):** the host records `RunStart`, every input sample that
  changed, and every command, per step, plus the build commit hash. The debug panel downloads it as
  gzipped JSON (about 1 MB for a full run); an uncaught error offers the download automatically. Node
  `scripts/replay.ts <file>` re-runs it headless and checks the state hash every 60 steps, reporting the
  first divergence. Replays are tied to the exact build. The redesign breaks the TD replay goldens and
  seeded-run fixtures; they are regenerated, not migrated. (`Sim.spawnEnemy` and the other test helpers
  bypass the command log; replays use commands.)
- **Determinism tests:** the same seed and inputs, run twice, give identical state hashes (scripted runs
  and the soak). Scenario tests assert outcomes, not hashes, so balance changes don't break them; tests
  that do pin a balance number are updated in the same commit as the tuning.
- **Autopilot:** `AutopilotInputSource` walks toward the nearest enemy, fires on cooldown, falls back
  toward the base when hurt, and **places its build** by a per-knight policy (an append-only registry,
  `src/host/sim/autopilot/builds.ts`: where and when each knight places, throws or recalls). It seeds
  the squad-solo bots (§13).
- **Soak** (`sim/soak.ts`): the autopilot plays waves 1–15 headless with invincible knights and the
  Citadel held at full HP, so every mix reaches wave 15; each player confirms a card from every offer
  (or lets the deadline pick) and tries one team-shop item a wave (in a rotation), so card, growth,
  build and shop hooks run. The full form (`pnpm --filter @pcg/fort-frenzy soak`) plays two seeds ×
  (**1 player with each of the 4 knights**, 2 players in all 10 knight pairs, 6 players in the 4
  rotations of the knight list), each run twice: it fails on an exception, a run that doesn't end in
  victory at wave 15, or a rerun whose state hashes differ. Vitest runs a short form (one whole solo
  run, one whole 2-player run and the 6-player boss waves, twice).
- **Benchmark** (`pnpm --filter @pcg/fort-frenzy bench`): holds the §15.2 peak counts (6 knights, 30
  soldiers, 150 enemies, 100 projectiles, 24 builds) at the real peak (wave 15, the Colossus Mk III in
  its final phase, Swarm packs) and with the whole roster scattered, and times whole runs; it fails when
  a peak's p99 step (or any mean) is over 2 ms. Scenarios run one per process. Numbers swing ±50% under
  machine load; rerun once before reporting a miss. On demand, not in the CI gate.
- **Balance harness** (§2's balance rule; a report, never a gate, §15.11 #72):
  `pnpm --filter @pcg/fort-frenzy balance` runs each knight alone (autopilot with its build policy) on
  the `balance.harness` content: the standard wave of 12 Grunts, 4 Runners, 1 Swarm group and 1 Brute
  from `bottom-w`, solo scaling, Normal, 5 seeds, no cards, meter full. It prints each knight's median,
  min and max clear time and its median's distance from the mean of all four medians, and flags
  knights outside ±20% and ±25%. Every knight runs; one without a build policy yet fights without
  builds (marked in the report). `--quick` runs the first seed only (`src/host/sim/balance/harness.ts`,
  `scripts/balance.ts`). The user sets the values at RC2.
- **Unit tests:**
  - wave generator: spends within ±1 of the budget, allowed types only, guaranteed spawns present,
    Flyer substitution, spread across the duration, same seed same wave, scaling; portals: every group
    at a real portal, ≤ `activeCap` portals per pulse, a hot-side portal in every pulse while hot, the
    hot share within tolerance, shifts at the right fractions to a different side, per-group sides never
    repeat back to back, the boss on the hot side
  - card picker: every §6.1 exclusion (1- and 2-card prerequisites), no duplicates in an offer, at most
    one rare, guaranteed rare after a boss, about 15% rare offers over 10,000 seeded offers, same (seed,
    wave, slot) same offer; the deadline pick from `cardPick:<wave>:<slot>`
  - build rules: one build per knight (mines: `maxActive`, oldest removed), meter empties on place and
    starts full, no fill in the build phase or while down or dazed, build damage charges the super
    never the meter, recall without the meter, HP builds targetable and charge builds not, builds
    persist between waves without regen
  - regen timing (5 s after damage, main or super; 8% per 1 s, in the build phase too), respawn table × difficulty and the
    Quick Recovery floors
  - flow field: the ground field never rebuilds, `blocked` tiles are impassable, Hunter pricing of
    sentries, damage-dealing builds and hidden trigger radii, Brute per-target fields, every reachable
    tile leads downhill
  - damage pipeline order (the `guard` reduction after the capped card reduction), stat stacking and
    caps, class multipliers and growth, each effect stacking policy
  - config validation (§15.4), presentation key whitelist (§15.4), the icon lists of §2.6 against the
    files on disk
  - snapshot round trip: save, restore, same state hash at the build phase (builds, meters, growth,
    squads)
  - protocol guards (tuple v2, intents, views), the combat layout rules and the gesture state machines
  - asset license coverage (§15.10)
- **E2E (Playwright, as in Sunny Side):** smoke (RD6: a solo Warden starts alone, the wave 1 pop-up
  ends with the phase's random pick, combat with portal flares, a thrown shield generator with the TV's
  preview, wave 2's card Confirm and the shop, on to wave 2), phone reconnect (the same pop-up and
  meter), late join (a full meter and a card offer), team pause (also in combat), host reload and
  resume, expired room resumed by device ID, controller layout screenshots. E2E drives time with `__pcg.speed(0)` + `advance` and
  `?bloom=0&fps=15`, never sleeps.

### 15.10 Hosting, assets and licensing

- **Hosting:** a Vercel project with root `apps/fort-frenzy` and `vercel.json` `{ "cleanUrls": true }`,
  at `fort-frenzy.fostercurtis.dev`, using the shared relay through `VITE_RELAY_URL` (as in Sunny Side).
  Vercel's ignored build step skips a deploy unless `apps/fort-frenzy`, `packages/` or the lockfile
  changed.
- **Root wiring:** the five per-game scripts (`dev:`, `dev:lan:`, `build:`, `e2e:`, `check:fort-frenzy`),
  and Fort Frenzy rows in the `PLATFORM.md` §1, `README.md` and `AGENTS.md` tables.
- **Brand kit:** `brand/`, `public/` and `src/styles/brand.css` (read-only), mirrored in
  `src/shared/theme.ts` with a parity test (§2.3). `check:routes` passes as is (icons, manifest, Google
  Fonts).
- **Art:** `art/neon-knights/` is owned by the art agent (icons included); its `README.md` holds the
  layout and conventions. `review/` holds assembled references, sheets and UI mockups, which no build
  reads. `.prettierignore` skips `apps/*/art/`. The redesign art came on `art/redesign`, which is already in `main` (PR #34), so the
  art on disk is the redesign set.
  RD12 deletes exactly `review/redesign/obsolete.md`'s "Removed outright" files and their `sprites.json`
  entries; "kept on file" art stays on disk and in the atlas, unused (§2.6, §15.11 #66).
- **Atlas pipeline:** `scripts/build-atlases.ts` (`pnpm assets`) runs before every build, test and
  typecheck and in dev (watch mode). It rasterizes each SVG part with `@resvg/resvg-js` at 1× and 2×,
  **strips the review-only glow filters** (`#glow`, `#glowU`, `#glowS`), packs Phaser JSON atlases
  (≤ 4096²) and checks every rig JSON against the frames it found (every part present in every view and
  pose, `order` matching the parts, parents, optional groups and attach points resolving, §15.2). Every
  SVG outside `review/` and `icons/` must be named by a rig or by `sprites.json`. For every frame with
  `class="glow"` groups it also packs an **unlit** variant (`<frame>@unlit`), with the glow recolored to
  its side's dark shade (§2.5), so code can turn glow off where it's baked into a part: stunned enemies,
  a downed knight's glow dimming, destroyed builds and the Citadel. It also builds the phones' icon
  sprite and the knight portraits (§15.4). Output is gitignored. The TV picks 2× when the canvas's
  device-pixel size exceeds 1.5 × 1080. Atlases and audio get content-hashed names through Vite and are
  cached forever.
- **Audio:** `.mp3` SFX in `audio/neon-knights/`, mapped by `PresentationHost.sfx`. The TV preloads
  everything behind a loading bar on the home screen; the first keypress there unlocks audio (browser
  autoplay rules). Cues live in `src/host/audio/cues.ts` (append-only).
- **Licensing:** `assets/LICENSES.json` (append-only) has one entry per asset file or pack: path or glob,
  source URL, author, license and whether commercial use is allowed. A unit test fails if any file under
  `art/`, `audio/` or the fonts lacks an entry, or allows no commercial use (§2.3). Foster's own art is
  `owned`; a Kenney pack is one CC0 glob entry.

### 15.11 Contracts and decision log

**Frozen contracts** (additive changes only; headers say "Frozen", as in Sunny Side; §15.11 #69):

| From | Frozen |
|---|---|
| RD0 | The v2 sketches in this §15 (the shapes RD2 implements) |
| RD2 | `src/shared/messages.ts` (`PROTOCOL_VERSION` 2, `InputTuple` v2, `Intent`, `HostMsg`, `TeamView`, `MeView`, `RunStats`), `src/shared/ids.ts`, `src/content/types.ts`, `src/host/sim/types.ts` and `events.ts`, the `src/host/sim/snapshot.ts` types (`RunSnapshot` v3), `src/host/ui/types.ts`, `src/presentation/types.ts`, the `src/host/systems/*/index.ts` signatures, `src/host/party/index.ts` |
| RD6 | `src/host/render/types.ts` (with RD5's build-view API), the build behavior registry `src/host/sim/builds/index.ts` and the scene build-view folder convention |
| Always | The public APIs of `@pcg/controller-kit` and `@pcg/game-kit` |

Later milestones add to a frozen contract only additively, and log it (`contract+`) in
`REDESIGN_BUILD_PLAN.md` §8. Append-only registries: `src/content/index.ts`,
`src/host/sim/registry.ts`, the `SimEvent` members, `src/host/audio/cues.ts`,
`src/host/sim/builds/index.ts`, `src/host/sim/autopilot/builds.ts`, `assets/LICENSES.json`. Tuning
values in `src/content/balance.ts` are never frozen.

Rows #1–#57 are the tower-defense build's decisions, kept as history: where the redesign changed one,
a later row says so, and the TD wording (old class names, crates, structures, lanes, themes) is left as it was.
Rows #58 onward are the redesign: one per REDESIGN group, then the build plan's decisions this spec now
states, then RD0's own.

| # | Date | Decision | Choice | Why |
|---|---|---|---|---|
| 1 | 2026-10-27 | Shared packages | Extract `@pcg/controller-kit` and `@pcg/game-kit` now; migrate Sunny Side in the same milestone | The second game shows what's common; one copy, not two drifting ones |
| 2 | 2026-10-27 | Reusable game systems | Extraction-ready folders (`systems/`, `party/`) enforced by lint, not packages yet | Dungeon Crew doesn't exist yet; packages need two consumers |
| 3 | 2026-10-27 | Entity model | ECS-lite: typed arrays per kind, pure systems in a fixed order | Explicit types, trivial serialization; ~300 entities need no ECS library |
| 4 | 2026-10-27 | Physics | None: kinematic movement, circles, spatial hash | Nothing needs rigid bodies; cheaper and deterministic |
| 5 | 2026-10-27 | Determinism | Whole sim deterministic: steps, seeded streams, no wall clock; dev-only replays | Makes §9.3 reproduction, tests and resume exact; cheap only if designed in |
| 6 | 2026-10-27 | Rendering | Phaser 4; one y-sorted world layer; threshold bloom on the composite; projection in the camera | Matches Sunny Side; §2.5's projection needs one sort; per-object glow is too slow |
| 7 | 2026-10-27 | Art pipeline | SVG parts → build-time resvg atlases, glow filters stripped; rig JSON + clips in code | Fewer requests, consistent rasterizing, no double glow |
| 8 | 2026-10-27 | Map | 48 px tiles, 36 × 24 grid, base top-center; top HUD + Citadel headroom, bottom band for the boss bar; all inside the 96 px TV-safe margin | Fits §2.5's squash on 1080p; the bottom-edge boss bar (§2.6) needs its own band (was 38 × 28 with the boss bar at the top) |
| 9 | 2026-10-27 | Config | TS data modules with `satisfies` + a validation test | Typos are compile errors; comments; hot reload in playtests |
| 10 | 2026-10-27 | Pathing | Dijkstra flow fields: ground, breaker, per hunted player | Breaker makes walls vs Brutes a real fight; rebuilds are sub-millisecond |
| 11 | 2026-10-27 | Input | 12-field JSON tuple, phone-resolved gestures, counters, fixed 30 Hz while touched | Taps never lost; fire and aim arrive together; satisfies §11.4 |
| 12 | 2026-10-27 | Phone state | `team` broadcast + per-phone `me` full snapshots on change, with `rev` | Self-healing after reconnect; small enough that diffs aren't worth it |
| 13 | 2026-10-27 | Menu actions | Intents with `seq` + `ack` | Failure feedback; movement stays pure input state |
| 14 | 2026-10-27 | Resume | `localStorage`, saved on every build-phase change; device ID for new rooms | Survives crashes; tokens and keys die with the room code |
| 15 | 2026-10-27 | Testing | Headless sim, replays, autopilot soak, unit and e2e suites | Catches desyncs and late-wave crashes without manual play |
| 16 | 2026-10-27 | Assets | Build-time atlases (gitignored), `.mp3` SFX, `LICENSES.json` checked by a test | No binary churn; every asset commercially cleared (§2.3) |
| 17 | 2026-10-27 | TV UI split | HUD and full-screen TV screens as a DOM overlay; world UI in Phaser | Brand CSS and the same SVG badges as phones, crisp text; world UI needs interpolation and y-sort |
| 18 | 2026-10-27 | Art location | All theme art under `art/<theme>/`, icons included; deliveries elsewhere are moved there | Later themes sit beside neon knights without renames |
| 19 | 2026-10-27 | Rig contract | Every part in every view and pose; optional poses (`ranger/<view>/<pose>/<part>`) | §2.4 full-size parts and the Ranger's stand/ready poses |
| 20 | 2026-10-27 | Art layout | Category folders, `rigs/<id>.json`, `sprites.json`; a frame's name is its path under its category; whole-folder drops | One naming rule and no mapping tables in the atlas script |
| 21 | 2026-10-27 | Knight glow | Per-part `<host>-glow` pieces drawn right after their host (was one emissive layer drawn last, §2.4) | One layer can't follow a swinging limb, and drawn last it shows through what covers it |
| 22 | 2026-10-27 | Ground frames | Flat pieces (plates, rails, pads, nets, flag ring, ghosts) are separate `ground` frames | A frame can't be in two layers; players on a pad were drawn behind it |
| 23 | 2026-10-27 | Tower frames | Turret: plate + pedestal + bands + head per aim; mortar is a rig with the tube clamped to ±75° | Bands sit on the fixed pedestal; the tube's inner end must never show |
| 24 | 2026-10-27 | Rig attach points | `{ part, at }` instead of a fixed point; rigs carry one shared `viewBox` | Muzzles, tips and nametags must follow moving parts |
| 25 | 2026-10-27 | Autotiles | Walls and nets: one frame per 4-bit neighbor mask (N1 E2 S4 W8), with per-mask rail, charged and damage frames; shared posts drawn once | A frame lookup per tile, no runtime composition; overlays always line up |
| 26 | 2026-10-27 | Sprite layers | `sprites.json` `layer` is `ground`, `world` or `effects` | Flashes and sparks belong on layer 4, above the y-sorted world |
| 27 | 2026-10-28 | Lane entries | Sealed until the lane's opening wave, drawn as an amber hard-light gate; open lanes show violet chevrons | Players see where enemies will come from before it happens |
| 28 | 2026-10-28 | Status looks | Burn flames, nanite corrosion, a white flash per tick, stun goes dark with orbiting chevrons, shield icon by the HP bar, shield pips on towers (§6.1) | Keeps the color rule: nothing red or green |
| 29 | 2026-10-28 | Carried cells | Pips at every player's feet, one per point of carry cap; the Artificer also keeps the gauge (§2.4) | Carrying is visible for every class; the gauge stays as class flavor (Foster) |
| 30 | 2026-10-28 | Card and lobby marks | One category mark per upgrade card (17 marks); a `leader` mark in the lobby | Cards read at a glance without 64 illustrations |
| 31 | 2026-10-28 | Unlit frames | The atlas script packs a `@unlit` variant of every frame with baked-in glow | Enemy glow is inside each part, so stun and destruction need a dark version without new art |
| 32 | 2026-10-29 | Emergency kit | Bought in the build phase, one held at a time by the Quartermaster, used with the action button in the repair zone (new §10.1 row 3) in either phase; `MeView.action` gains `'kit'` and `kits` | §3.4 asked for a mid-combat kit, but combat has no menus (Foster) |
| 33 | 2026-10-29 | Build-phase action button | The Build and Shop tabs keep an action button for pick up, deliver, kit and Armory buy (§10.2) | §6 lets players carry, deliver and buy cells in both phases, and the build tabs had no way to do it (Foster) |
| 34 | 2026-10-29 | Sound effects | Kenney CC0 packs supplied in `audio/kenney/`, picked and converted to `.mp3` in `audio/neon-knights/` (§14 #4) | Commercially clear, already downloaded (Foster) |
| 35 | 2026-11-02 | Down and death | A downed knight dims, then falls apart into a pile of armor with scrap that stays for the down timer (was a kneel); every enemy and the Colossus gets a hit and a death (collapse into a pile, `scrap-theirs`, fade) | C1 gallery notes (Foster) |
| 36 | 2026-11-02 | Stunned units | Always idle, never walking (a render rule) | A stunned enemy that walks reads as not stunned (Foster, C1) |
| 37 | 2026-11-02 | Knight legs, front and back | The renderer draws the one-piece `legs` frame twice, cropped into left and right halves, so each leg steps on its own | The art has one legs part per view; a split keeps the art as is (Foster, C1) |
| 38 | 2026-11-03 | Super ready on the TV | The player's ring pulses with amber light (an amber ring just outside the colored ring, at the phone ring's 1.2 Hz and 1.0→1.12 scale); the badge over the head is gone | C2 note (Foster); the ring already marks the player, and amber reads as ours and blooms |
| 39 | 2026-11-03 | Ranger shot | The main shot draws, holds and releases; the TV holds the bolt on the bow until the clip's release (100 ms, or 30 ms when already at full draw while aiming or in Steady Aim), then launches it from the rig's `bolt` point at bow height and eases it onto the sim's path. Render only: the sim still fires from the feet at once | The shot read as a twitch and the bolt left from the feet (Foster, C2); the sim's timing and hit geometry stay as tested |
| 40 | 2026-11-03 | Commander passive and super on the TV | Lead from the Front: pooled nanite-mote frames drift (1.4 s, eased, seeded sway) from his chest to each soldier under the sim's aura, one per 520 ms per soldier, at most 3 in flight, dropped when the soldier leaves it; the link lines are gone. Morale: every unit carrying the buff flashes its emissive parts (glow 2, the rig's full boost, so the bloom stays capped) and its aura circle (alpha 0.55) on and off every 250 ms from the buff's ticks left, the faded aura showing between flashes | C3 notes (Foster); motes reuse the Artificer's nanite look; sim-timed so the flash ends exactly with the buff |
| 41 | 2026-11-03 | Aim previews | While aiming, the TV draws the attack's real hit area from the sim's effective stats (one `hitShape` for both): a dashed amber line for a single bolt, a transparent amber-filled ground cone for arcs, cones and spread volleys, a filled amber 0.6 ellipse for circles; dim, under the bloom; supers only when charged (§10.1) | C3 note (Foster): the aim bar should match the attack's shape (the Warden's cone, the Artificer's shot); one source keeps tuning and cards in step |
| 42 | 2026-11-03 | Warden and Ranger reach | Warden slam 1.5 → 1.75 tiles, 120° → 102°; stomp 3.2 → 3.7 tiles, 100° → 85°; Ranger super radius 3 → 3.5 tiles (content) | C3 notes (Foster): the Warden's spread slightly narrower and range slightly longer, main and super; the Ranger's super slightly bigger |
| 43 | 2026-11-03 | Arena floor | The floor draws lighter than its art: neon knights lifts the #262b33 stone to #62676f at render time (`ThemeHost.map.floorLift`); player rings and red danger markers get an ink edge, and the Stalker thread is pale violet at 0.5 | Enemies sat at the floor's luminance and vanished, the small ones worst (Foster, C3); measured: outlines 1.35 → 3.4:1, hull colors 1.0–1.2 → 1.5–2.6:1, glows stay brighter than the floor, nothing new blooms |
| 44 | 2026-11-03 | Wasp jitter | Ground points lerp on the ground at both ends (the Wasp's was lerped from the sim's flyer `z` = 1 toward the drawn 0, so its height swung with the frame's phase) | The Wasp jumped back and forth like a glitch (Foster, C3); its sim motion was already smooth |
| 45 | 2026-11-03 | Hunter | Paths round tower and sentry range when it can (its field adds 4 per covering attacker); retargets on down, daze or a player 2 tiles closer; the eye thread is replaced by a ~2 s flash of the quarry's color at its feet on each new quarry. v2 behavior recorded in §9 and §13 | The Hunter should be smarter than other units, and a permanent thread was noise (Foster, C3) |
| 46 | 2026-11-03 | Flow-field shape | 8-neighbor octile fields with no corner cutting, and steering at the farthest tile down the chain a body-wide corridor reaches without a costlier tile | Enemies went straight up the field and then along the back; they should head for the Citadel on a direct diagonal (Foster, C3) |
| 47 | 2026-11-03 | Aimed melee mains | The Warden's slam and the Commander's slash are aimed buttons (§10.1): a quick tap (≤ 150 ms in the dead zone) still fires at once, auto-aimed at the nearest enemy in range or straight ahead; a drag aims and the release lands the same arc (slam 1.75 tiles, 102°; slash 1.4 tiles, 110°) toward the aim; back in the dead zone cancels. While aiming the TV draws each arc as the filled amber ground cone from the shared `hitShape` | C3 follow-up (Foster): "the warden's attack should be aimed, as well as the commander's slash", with the slash's arc shown while aiming; tap buttons held nothing, so they had no preview |
| 48 | 2026-11-04 | Balance sheet | Every number that affects balance (HP, damage, ranges, areas, timers, speeds, costs, wave budgets, AI and card tuning) lives in one file, `src/content/balance.ts` (was eight domain files plus constants inside the sim: AI, squad, card offers, damage-over-time, shell flights, projectile radius); card and passive modules read every param from it with no code fallbacks, and content.test checks it is complete; the map stays in `map.ts` (§15.4) | One place to tune for balance (Foster) |
| 49 | 2026-11-05 | Resume details | A resume restores the saved build phase with a full build timer, knights at the base, cooldowns reset; the snapshot adds the structures' `owner` and the run time `runMs`; phones re-send `hello` when the TV comes back; any slot no phone has matched is claimable in the same or a new room; Return to home kicks every phone and drops the host token (§4, §15.8) | The snapshot's frozen shape holds no positions or timers; a reloaded TV has no party until phones say hello; the claim screen covers a phone that lost its storage either way (FF14) |
| 50 | 2026-11-05 | Wasp height and body hitboxes | The Wasp flies at half its height (its hull 1.37 tiles over its shadow, was 2.74); our attacks hit an enemy's drawn body (torso, head and legs, a ground capsule up the screen from its feet; arms, tails, rotors and barrels left out; the Wasp at its flight height), the Colossus kept low (its legs, radius 1.0, up to 0.8 tiles); enemy attacks, walking and ground effects keep feet circles | Early C4 notes (Foster): the Wasp flew too high, and aiming at an enemy's head missed because only its feet counted |
| 51 | 2026-11-05 | Aim line on cancel | Once a held aimed main or super is back in the dead zone (a release would cancel), the TV hides its aim line at once and keeps it hidden until the button is let go, even if the thumb drags out again; when a release fires or cancels is unchanged (§10.1, §15.7) | Early C4 note (Foster): "it still shows the aim line until the player releases the button" |
| 52 | 2026-11-06 | Ranger aim bar | The Ranger's single-bolt aim preview is a transparent amber bar on the ground, the bolt's range long and its hitbox wide (2 × `rules.projectileRadius`), with the cones' fill and edge; the dashed world-UI line is gone (§10.1, §15.2; revises #41) | C4 note (Foster): "The Ranger's aim line should match the style of the other players: it should be a transparent amber bar that is the width of the bolt's hitbox." |
| 53 | 2026-11-06 | Aimed cancel and re-aim | Reverses #51's latch: a held aimed main or super cancels only on a release inside the center dead zone, now 25% of the drag radius (17.5 px, was 12%) as a thumb's grace window; the TV hides the aim line only while the aim is in it, and dragging out again, still held, re-arms the attack and shows the line again; a release outside fires along the shown aim (§10.1, §15.7) | C4 note (Foster): "Aimed attacks should only cancel if the player moves the stick to the middle of the button area and releases it … have a small grace window … If they continue to hold down the button and drag their finger again, it should re-initialize the aimed attack" |
| 54 | 2026-11-06 | Team pause | Reverses "No pausing in v1" (§11.3): a pause button in the phone's top bar during a run; any player pauses the whole run for everyone and the TV, any player resumes; the TV and every phone show who paused; presses made while paused never fire, and resume is immediate (§10.5, §15.6) | C4 note (Foster): "Add a pause button on the controller on the top bar. When one player pauses, it should pause for all players and the host." |
| 55 | 2026-11-07 | Colossus stun resistance and Warden charge | For `stunImmuneMs` (4 s) after a stagger ends, stuns don't count into the Colossus's meter (damage still does); the Warden's super charges at 0.0054 per damage (~185 damage fills it, was 160); the stomp's 25 damage / 1.8 s stun on other enemies is unchanged (§9.2, content) | C4 note (Foster): "Stun resistance works great, or charge the warden's super a little more slowly. Maybe a little of both." A Warden-only team staggers it about 30% of the time (was ~35%), with at least 4 s between staggers |
| 56 | 2026-11-10 | Catalog entry | `game.meta.ts` holds the title, player range (2–6), catalog descriptions and card and link-share art (`catalog/card.jpg`, `catalog/share.webp`); `MAX_PARTY`, the party's min, `RELAY_MAX_PLAYERS` (= cap + 2), the TV home tagline and the phone titles read it; the "Game full" note says "holds 6 players" (was "six") | One source for the gallery and the game (`PLATFORM.md` #9). Foster approved the digit. |
| 57 | 2026-11-11 | Feedback link | Summary screen only: a 360 px QR (`host/ui/feedback.ts`, error level L, 8 px modules) top right, where the lobby's join QR sits; **Give feedback** on every phone's summary, a new-tab link | PLATFORM decision #11. The run's last screen, so it never interrupts play; the leader's end options are on the phone and unchanged. |
| 58 | 2026-11-16 | Redesign A: core loop and flow | Players-only wave defense: knights are the only defense besides the sentries; builds are temporary tactics (one per knight, HP or charges, persist between waves); 6 portals all live from wave 1 with an unannounced hot side; `players + 1` active portals; a player-count lookup table; the base keeps its sentries and is repaired only from the shop; card pop-up → shop with a 20 s cap; 15 waves in about 20–24 min; delayed regen; 1–6 players with solo (§2–§5, §7, §9.3, §9.4, §11.1) | The tower-defense version let one class's towers solo most waves (breaking "roles amplify, never gate") and sat between tower defense and action (REDESIGN §0, A1–A6) |
| 59 | 2026-11-16 | Redesign B: economy | Team coins are the only currency, with income lowered; no crates, power cells, carrying or personal shop; per-knight hybrid build meter (passive + actions; build damage charges the super only; starts full, carries over, no fill in the build phase); per-wave class growth; a thin team-only shop (§6, §7.2) | The crate logistics existed to feed structures; with builds charged by play, a currency per player adds nothing in v1 (REDESIGN B1–B5) |
| 60 | 2026-11-17 | Redesign C: classes and knights | Classes (tank, marksman, support, control: HP tier, damage band, growth) are separate from knights (attacks, super, build, passive card); v1 knights Warden, Ranger, Artificer, Commander; builds use the attack input grammar; HP builds are targeted like knights, nearest first; no walls in v1 (static ground field); passives become cards; the Commander's squad starts at 2 and grows only from Reinforcements (§2, §7, §8) | Class = playstyle, knight = method, so more knights per class is content; the balance rule needs every knight able to hold a side (REDESIGN C1–C5) |
| 61 | 2026-11-17 | Redesign D: enemies and boss | Brute hunts targetable builds; Siege targets players > builds > base and stops only with something in range; Flyer range up; Hunter senses hidden builds, avoids damage-dealing builds and sprints once locked on; Flyers spawn only for teams with a `hitsFlyers` knight; Colossus Mk I slam + boulder, Mk II adds Charge (replacing Wall Breaker), Mk III adds Runners and the final-phase shockwave; boulders target players (§9) | Anything that targeted towers needed a new target, and builds needed enemies that interact with them (REDESIGN D1–D3) |
| 62 | 2026-11-17 | Redesign E: cards and shop | Cards upgrade the knight (attacks, super, build, squad, passive), the shop only the base; one rare unique passive card per knight, two build cards each, Tinkerer as the 9th common; the knight card lists of §6.1; team shop: repair, three sentry items, base max HP and base armor tiers, about 10 purchases a run (§6.1, §6.2) | With structures gone, personal power is cards and growth and team power is the base (REDESIGN E1–E4) |
| 63 | 2026-11-17 | Redesign F: controls and UI | The action button becomes the build button (60 px, per-build gesture, a steady amber meter ring; the Commander's recall); card pop-up then shop with the stick on the left third; a 20 s build phase; status strip HP and base HP; enemy (violet) and build (amber) HP bars shown once damaged; the portal flare; new art for portals, builds, the Commander's shield, the Warden's jump, the Charge tell (§2.6, §10) | The priority table and the structure arc served crates and structures; one build per knight needs one button (REDESIGN F1–F5) |
| 64 | 2026-11-17 | Redesign G: name, themes, difficulty, tuning | The name stays Fort Frenzy; the theme layer is removed (one look; code ids `ranger` and `artificer` replace `engineer` and `quartermaster`; Normal is the default difficulty); difficulty also scales respawn time, applied as difficulty × player-count table × wave multiplier; every number lives in `balance.ts` (§2.1, §2.2, §14) | The second theme will never ship, so the layer only cost indirection (REDESIGN G1–G4) |
| 65 | 2026-11-18 | Redesign art | No placeholders: the redesign art (portals, builds, effects, the Commander's shield, the Warden's slam group, icons) was finished on `art/redesign` before the build; each feature milestone wires its own art (§14 #5) | REDESIGN §0.4 assumed placeholders; the art was done first (plan §8) |
| 66 | 2026-11-18 | Retired art | RD12 deletes exactly `obsolete.md`'s "Removed outright" files and their `sprites.json` entries; "kept on file" art stays on disk and in the atlas, unused; §2.6 lists icons in use, on file and removed (§2.6, §15.10) | User, 2026-11-18; the kept art is the build idea pool's (plan §8) |
| 67 | 2026-11-18 | Art folder | Keep `art/neon-knights/` and `audio/neon-knights/`; no flatten (§15.1) | `build-atlases.ts` treats `art/<set>` as the root, clips import rig JSON by path, the README and review sheets cite it, and the art agent owns the folder (plan §8) |
| 68 | 2026-11-18 | Presentation layer | `src/themes/` becomes `src/presentation/` (`PresentationShared`, `PresentationHost`, rigs, clips), still a boundary the sim can't import; the ESLint `themes` pattern moves with it; the asset manifest keys by art set (§15.1, §15.4) | The boundary still earns its keep without theme selection (plan §8) |
| 69 | 2026-11-18 | Contracts | Settled in §15 by RD0, implemented once in RD2, frozen after RD2 for the parallel milestones; RD6 freezes the render build-view API (§15.11 table) | Code can't hold the new contract types without compiling against them (plan §8) |
| 70 | 2026-11-18 | Versions | `PROTOCOL_VERSION` 1 → 2 in RD1, then 2 for the whole redesign; the snapshot `v` bumps whenever its shape changes (now 2), old saves discarded, never migrated (§15.6, §15.8) | Phones and TV always ship from one commit, so only the production change matters (plan §8) |
| 71 | 2026-11-18 | Shared code | No shared-code change: `layoutCombat`, `ChargeRing`, `RoundButton` are Fort Frenzy's; the build button reuses the kit's `aimedGesture`/`tapGesture`; `radialGesture` stays exported, unused; the catalog already accepts `minPlayers: 1`; the relay needs no change (§15.1) | Keeps the redesign inside the app and the relay undeployed (plan §8) |
| 72 | 2026-11-18 | Balance harness | A report, not a gate: each knight solo against `balance.harness` (12 Grunts, 4 Runners, 1 Swarm group, 1 Brute from `bottom-w`, solo, Normal, 5 seeds, no cards, meter full), flagging ±20% / ±25% of the mean (§15.9) | Turns A1's balance rule into a number until the user sets values at RC2 (plan §8) |
| 73 | 2026-11-18 | REDESIGN stale lines | 20 s build phase everywhere (F2's "A5 said 30 s"); the code ids are `ranger`/`artificer` (G2 over E3's "Code IDs" line); C5's Reinforcements "(as the old super)" is F1's aimed throw of one soldier; the Migration impact table covers A–G; no placeholders (§0.4) | Plan §8 reading of lines REDESIGN left behind |
| 74 | 2026-11-18 | Portal positions | `bottom-w` cols 9–10 row 23, `bottom-e` cols 25–26 row 23, `left-n`/`right-n` rows 11–12 and `left-s`/`right-s` rows 18–19 on cols 0/35; sides left, bottom, right (§3.1, §15.2) | Side portals in the lower two-thirds (A2); a starting layout to tune in `map.ts` (plan §8) |
| 75 | 2026-11-18 | Active portals | Chosen per spawn pulse: `min(players + 1, 6)` portals, always at least one hot-side portal while a side is hot; the hot share (start 0.55) goes to its portals, the rest spread over the others; solo: one hot-side and one other (§9.3) | A3 said "per spawn group"; a pulse is the unit the generator spreads (plan §8) |
| 76 | 2026-11-18 | Hot-side shifts | One shift at 1/2 of the wave, two at 1/3 and 2/3, always to a different side, seeded (`waves:<n>`); the boss spawns at a seeded hot-side portal (§9.4) | A2 gave the count, not the timing (plan §8) |
| 77 | 2026-11-18 | Class multipliers | The damage band multiplies the knight's main and super damage (tank 0.9, marksman 1.15, support 0.8, control 0.95); the HP tier multiplies a baseline knight HP (1.6, 0.8, 0.9, 1.0) (§8.1, §15.3) | C1's "about −10%" etc. as numbers (plan §8) |
| 78 | 2026-11-18 | Wave multiplier | `WaveDef.enemyMult?: { hp?, damage? }` (default 1), applied as difficulty × player-count table × wave multiplier, baked in at spawn (§2.2, §9.3) | G3's order with C's balance-watch multiplier (plan §8) |
| 79 | 2026-11-18 | Respawn | Respawn = table(players) × difficulty (Easy 0.8, Normal 1, Hard 1.2 to start); Quick Recovery −2 s per stack, floored at 4 s solo / 5 s otherwise, and the floor never raises a shorter respawn (§5) | G3 and E2 together (plan §8) |
| 80 | 2026-11-18 | Build timing rules | Build effects (shield field, beacon healing) run in combat only; builds don't regen; the meter doesn't fill while the knight is down or dazed; a dead knight's builds stay on the map (§5, §7.1, §7.2) | Gaps in A5/B2 (plan §8) |
| 81 | 2026-11-18 | Shield generator reduction | A status effect (`guard`, strongest of overlapping generators), applied after card damage reduction and outside its +40% cap (§7.4, §15.3) | Keeps cards' cap meaningful and the generator worth throwing (plan §8) |
| 82 | 2026-11-18 | Beacon charge | Beacon healing charges the Artificer's super (like build damage), never the meter; super healing charges neither; Field Medic healing charges the super as before (§7.2, §8.3) | B2's build rule applied to healing (plan §8) |
| 83 | 2026-11-18 | Quick taps and recall | v1 has no offensive thrown build, so every quick-tapped thrown build lands at the knight's feet; the Commander's tap with the meter not full and a flag out recalls, and recall never uses the meter; the flag's aim preview uses the squad's flag ring (§7.3, §7.4, §10.1) | C2/F1 left the v1 cases open (plan §8) |
| 84 | 2026-11-18 | Brute pathing | A Brute reaches its build on a per-target ground field keyed by the build's tile (§15.5) | "Straight for the build" keeps working with v2 terrain (plan §8) |
| 85 | 2026-11-18 | Hunter | The player-color flash moves to the lock-on moment (quarry within ~5 tiles); its field prices the sentries, damage-dealing builds and hidden trigger radii (§9, §9.6, §15.5) | D1's two phases need a visible switch; the tower-range pricing is reused (plan §8; revises #45's flash moment) |
| 86 | 2026-11-18 | Colossus Charge | Destroys HP builds it crosses, triggers mines like any ground enemy, leaves the rally flag alone (§9.2) | The flag is untargetable (plan §8) |
| 87 | 2026-11-18 | Card prerequisites | `CardDef.requires` is a list of 1 or 2 ids, so a passive card can gate the cards that improve it with the combo rule's check (§6.1, §15.4) | E1 (plan §8) |
| 88 | 2026-11-18 | Card marks | `card-build`: Shrapnel Charge, Minefield, Wide Field, Reinforced Generator, Booster Beacon, Strong Arm; `card-tinkerer`: Tinkerer; `card-passive`: Steady Aim, Challenger, Field Medic, Morale, Deadeye, Wide Aura; `card-squad`: Forced March, Veterans, Last Stand, Drillmaster, Reinforced Ranks; `card-attack`: Heavy Bash and the kept attack cards; `card-super`: Blast Radius, Earthshaker, Rally Cry; the rest keep their TD marks; `card-supply` on file, unused (§6.1) | The new art's marks for the new cards (plan §8) |
| 89 | 2026-11-18 | Morale and Warcry | Morale reaches allied knights and soldiers inside either area (flag or Commander), one effect; Warcry gives nearby knights the morale effect briefly and reuses its flash (§6.1) | E3 merged Lead from the Front into Morale (plan §8) |
| 90 | 2026-11-18 | Card selection | Selection is phone-local; Confirm sends the existing `card` intent; at the 20 s deadline the host picks from `cardPick:<wave>:<slot>`; `MeView.screen` stays `build` and the phone shows the pop-up until `cards.picked` is set, then the shop (§10.2, §15.6) | No new intent or screen for a two-step pick (plan §8) |
| 91 | 2026-11-18 | Late joiners | Start with a full meter (a Commander with his 2 starting soldiers); two Commanders each keep their own squad and flag (§8.4, §11.2) | Matches the run's own start (plan §8) |
| 92 | 2026-11-18 | Enemy ids and names | Enemy code ids stay (`grunt`, `runner`, …); G2 renames only the knights. Display names live in one table in `src/presentation/shared.ts` (§2.1) | Fewer renames; one place for names (plan §8) |
| 93 | 2026-11-18 | Run stats | `RunStats` drops the crate and structure counts and adds `buildsPlaced` (healing done stays); the award cards follow (RD2 shape, RD13 copy) (§4, §15.6) | Stats for the redesign's verbs (plan §8) |
| 94 | 2026-11-18 | Knight and class ids | `KnightId` (`ranger warden artificer commander`) is the knight; `ClassId` stays as its alias, because the wire (`classId` fields, the `class` intent) and the code already use it; the REDESIGN "class" is `RoleId` (`tank marksman support control`), and `ClassDef` is keyed by `RoleId` (§15.4) | The plan names both `ClassId` and `RoleId`; an alias avoids renaming every `classId` field for no player benefit (RD0) |
| 95 | 2026-11-18 | Shop ids | The sentry upgrades keep their `archer_*` code ids (display "Sentry …"); `base_hp` is new; a base max HP tier raises the Citadel's current HP by the same amount; every item is always visible (§6.2, §15.4) | G2 renames only the knights; raising max HP without current HP would read as no change (RD0) |
| 96 | 2026-11-18 | Ack reasons | `crates` is removed; `cap` now means the shop item is at its max tier (§15.6) | Nothing is carried any more (RD0) |
| 97 | 2026-11-18 | Input tuple v2 | 12 fields: move, main aim, super aim, **build aim**, flags (1 main, 2 super, 4 build aiming), and the main, super and **build** fire counters; the radial fields are gone. The sim resolves a build press from the state at the step it lands: meter full → place or throw; else a Commander with a flag out → recall; else nothing (§15.3, §15.6) | The build button uses the attack grammar (C2), so it needs the same aim, flag and counter; a phone/host race on the Commander's icon at worst throws a flag at his feet (RD0) |
| 98 | 2026-11-18 | Regen | Regen isn't a heal: it sets HP directly with no hooks (no Overflow, no Triage), charges nothing and counts in no stat; it doesn't run while down or dazed (§5, §15.3) | A6 heals the knight itself; counting it would charge the Artificer's super from everyone's regen (RD0) |
| 99 | 2026-11-18 | Late joiner growth | A late joiner starts with no class growth, as with no cards (§11.2) | Simplest; growth counts waves the player cleared (RD0) |
| 100 | 2026-11-18 | Solo start | The party leader can force-start once at least one player is Ready (was two) (§11.1) | A's "the party leader can start alone" (RD0) |
| 101 | 2026-11-18 | Build placement | Builds don't snap to tiles: at-feet builds at the knight's foot point, thrown builds at the landing point clamped to the playfield and outside the Citadel footprint; placing (or throwing) removes the knight's old build at once, so the one in flight counts (§7.1) | Builds are thrown to a point and nothing blocks pathing, so the grid adds nothing (RD0) |
| 102 | 2026-11-18 | Effects v2 | `guard` (shield generator) and `taunt` (Challenger) added; `morale` carries damage, attack speed and move speed (the separate `haste` is gone); `tower_defense`, `aura_mason`, `aura_bodyguard` and `aura_lead_from_the_front` removed (§15.3, §15.4) | One effect per mechanic the redesign keeps (RD0) |
| 103 | 2026-11-18 | Squad details | The squad cap starts at 4 (Reinforced Ranks +1); soldiers keep their HP between waves (no regen); the snapshot keeps each soldier's HP and Veterans gains, and the flag as a build (§8.4, §15.8) | C5 said "about 4–5"; regen is for knights (A6) (RD0) |
| 104 | 2026-11-18 | Portal flare on the TV | `TvView.laneWarnings` is removed; the flare is drawn by the World scene from the spawn plan and `portalFlare` events (§15.6) | The flare is portal art in the world, not a DOM edge band (RD0) |
| 105 | 2026-11-18 | Build button layout | **Revised by #115:** the build button is 60 px at (−134, +24); the first RD0 reading (68 px at (−118, +20)) overlapped its own and the super's caption on a real phone | F1 asked for a re-layout "to fit" (RD0); RC1 showed it did not |
| 106 | 2026-11-18 | Reinforcements quick tap | A quick tap throws the soldier toward the flag, or straight ahead (his facing) with no flag out (§8.2, §10.1) | F1 covered only the flag-out case (RD0) |
| 107 | 2026-11-20 | Change Knight | The end-of-run option and its copy say **Change Knight**, and the screen is **knight select**: players choose a knight (who belongs to a class), not a class. Display copy only: the `class` intent, `classId` and the `'classes'` leader option keep their ids (#94) (§4, §10, §11, §15) | Players choose a knight, who belongs to a class (user, RC0, 2026-11-20) |
| 108 | 2026-11-20 | Bombard priority | Siege (Bombard) target priority is **base > players > builds**, nearest within each; it retargets the moment a higher-priority target enters range (revises #61's order) (§3.3, §9, §9.1, §15.5) | RC0 checkpoint note (user, RC0, 2026-11-20) |
| 109 | 2026-11-20 | Respawn at 5–6 players | Base respawn is **15 s** for 5 and 6 players (6 s solo, 10 s for 2–4); the difficulty multiplier and Quick Recovery's floor are unchanged (§5, §9.4) | RC0 checkpoint note (user, RC0, 2026-11-20) |
| 110 | 2026-11-20 | Stats banners (v2) | v2 note: the end-of-run screen shows every stat for each player in per-player banners, like a fighting-game results screen; v1's summary and award cards are unchanged (§13) | v2 polish; v1 scope stays (user, RC0, 2026-11-20) |
| 111 | 2026-11-21 | RD2 contract fixes | `SNAPSHOT_VERSION` 3 (RD1 used 2); `Content` keeps arrays and nullable singletons; transitional Commander and passive fields until their kit milestones; the Colossus's Citadel multiplier is a boss param (§15.4, §15.8) | The code's catalog already looks content up by id; the old Commander super and passives keep working until they're replaced (RD2) |
| 112 | 2026-11-21 | RD3 sim slice | A spawn pulse is up to `players + 1` groups at one time, and "per spawn group" hot sides roll per pulse; the hot/other split is chosen over the whole wave (share closest to 0.55, never under half, a group elsewhere per pulse where the costs allow); the boss spawns on the first pulse's hot side; a thrown build lands at aim × throw range; a card not confirmed when the build phase ends (deadline or everyone Ready) is picked at random; super damage charges the meter (§7.2), never the super; a build without a behavior can't be placed yet; the harness runs every knight (§7.3, §9.3, §9.4, §10.2, §15.3, §15.9) | Simplest readings that meet §9.3's share and cap together; the plan's "super damage charges neither" contradicts §7.2, §8.3 and REDESIGN B2 (RD3) |
| 113 | 2026-11-21 | TV slice (RD5) | A clip switches optional groups with `Keyframe.groups` (the Warden's `slam` swap); the build-view API and `EffectSpawner.mark` are additive (§15.2); HP bars (violet enemies, amber builds) are two pre-made images moved and scaled, never drawn per frame; the jump slam keeps the clip name `super` and the impact `JUMP_IMPACT_MS` (= `STOMP_IMPACT_MS`, content `warden.super.windupMs`); the thrown-build preview draws the sim's `buildPreview` (§7.3) (§2.4, §2.6, §7.5, §10.1, §15.2) | RD5 plan: new art, no per-frame rebuilds (FF7-fix-1, FF8, FF9 lessons); SPEC and REDESIGN agree otherwise |
| 114 | 2026-11-21 | Slice wiring (RD6) | Debug commands: `meter` takes an optional `target` slot (none = every knight); `hot` forces the hot side: the spawn groups not yet flared that sit on their pulse's hot side move to the forced side's portals in turn (the others stay), every pulse is tagged with it, and every later wave's plan is forced at its combat start until `side: null` clears it; the forced side lives outside `World` (`Sim.debugHot`). The pop-up's growth header is the class's growth list for the wave just cleared (a boss wave's `boss` list) once the knight has a bump, null otherwise; the bumps and lists are RD11's. The e2e smoke is the solo Warden slice (§9.5, §10.2, §15.3, §15.9) | Simplest debug tools that keep replays exact (logged commands); a flared portal keeps its group because its flare was already shown (RD6) |
| 115 | 2026-11-23 | Phone layout fixes (RC1) | The build button is **60 px** (pre-RD4 56, RD4 68) at offset (−134, +24); captions sit centered under their buttons clear of the 11 px aim/meter ring reach, and `layoutCombat`'s tests prove no caption meets a button or another caption. The shop is one column in the right two-thirds: a one-line header (title + short hint, hint dropped on short screens), then the scrolling rows; each row keeps icon, full name, tier, price (never below 96 px, no wrapping) and Request (§10.1, §10.3) | RC1: the shop rendered its header, rows and hint as three side-by-side columns, and the 68 px button covered captions |
| 116 | 2026-11-23 | Jump slam timing | The wind-up is 1.8 s and the clip 2.2 s, with damage, stun, `landing-dust` and `slam-cracks-wide` together at the impact. From press to landing he is rooted with his aim and facing locked, main and build presses are lost, and he stays a target. Down, dazed or a phase end cancels the slam (`windupCancelled`) and the charge stays spent (§2.4, §8.2, §15.3) | User, RC1: "much slower (~2 seconds long)"; the simplest rule that keeps a long wind-up readable (RD3-fix-1) |
| 117 | 2026-11-23 | Warden main | The hammer smash leaves no ground cracks (only the super does) and doesn't knock back a target that was already stunned; unstunned targets are knocked back as before (§2.4, §8.2) | User, RC1 (RD3-fix-1) |
| 118 | 2026-11-23 | Aftershock | Moves from the main to the super: every enemy the jump slam hits is slowed for 5 s (`slowMs`), at the card's strength; the old slam zone is gone. RD11 keeps this behavior (§6.1) | User, RC1: "add it to his super ... ~5 seconds"; a hit-applied slow shows on the enemy (`shock-crawl`), and Fault Line stays the ground fissure (RD3-fix-1) |
| 119 | 2026-11-23 | Shield generator throw | Throw speed 12 → 6 tiles/s: 1 s at full range (was 0.5 s). `minFlightMs` stays 300, so a quick tap at his feet is still quick; the beacon and flag keep their own values (§7.4) | User, RC1: "throw animation/flight time should be longer" (RD3-fix-1) |
| 120 | 2026-11-23 | Regen wait | 5 s (was 4 s), restarted by damage taken and by every main attack or super, for every knight; placing a build doesn't restart it (§5) | User, RC1 (RD3-fix-1) |
| 121 | 2026-11-23 | Mine delay at a wave's end | A mine whose trigger delay is cut off by the end of the wave doesn't burst: it re-arms with its charge. Shrapnel Charge's shorter delay stops at `minTriggerMs` (120 ms) (§7.4) | Build effects run in combat only (§7.1); a burst in an empty build phase would waste the charge (RD7) |
| 122 | 2026-11-23 | One-card prerequisites | A card with one prerequisite (Deadeye, Wide Aura) is gated by it but stacks like any other card unless marked unique; only two-card combos are implicitly unique (§6.1) | §6.1 marks only combos and named cards unique; the picker treated every `requires` as a combo (RD7) |
| 123 | 2026-11-23 | Ranger kit on the TV | The `shockwave` frame replaces the Ranger's code-drawn ring and rolls out to his effective hit radius; the mine uses the shared life cycle with `liveAlpha` 0.4 and a `trigger` frame, its shadow fading with it; his Steady Aim pose shows only with the card (§2.4, §7.5, §15.2) | RD7 |
| 124 | 2026-11-24 | Warden main reach (RC2) | The hammer smash reaches 1.65× as far (1.75 → 2.89 tiles; its aim preview with it, one `hitShape`) and knocks nothing back, stunned or not; #117's "already stunned" check is gone, its no-cracks rule stays. The jump slam never knocked back. The stun is unchanged (§8.2) | User, RC2: "Increase the range of the warden's main attack by 60-70% and remove the knockback" (RD3-fix-2) |
| 125 | 2026-11-24 | Jump slam timing (RC2) | Revises #116's timing (RC1's "~2 s"): the wind-up is 1.1 s (was 1.8 s) and the clip 1.35 s (was 2.2 s), about 60%. Every clip beat (crouch, lift, hang, landing hold, hammer swap) is scaled by the same ~0.61, so no pose is cut. Damage, stun, `landing-dust` and `slam-cracks-wide` still land together at the impact, and #116's commit rules stand (§2.4, §8.2) | User, RC2: "Warden super animation is much too slow now. Make it 1/2 - 2/3 the length" (RD3-fix-2) |
| 126 | 2026-11-24 | One throw speed | Every throw flies at `THROW_SPEED` 5 tiles/s (`balance.ts` builds section): the shield generator (was 6, #119), the beacon (was 12), the rally flag (was 14) and the Reinforcements soldier (was 10). Each keeps its `minFlightMs`; Strong Arm still multiplies build throws (§7.3, §7.4) | User, RC2: the generator's throw "slightly slower", and "all throws should be the same speed" (RD3-fix-2) |
| 127 | 2026-11-24 | Warden main cone (RC2) | The hammer smash's arc is a third narrower, 102° → 68°, at the same 2.89 tiles; its aim preview and the TV shockwave read the same content (one `hitShape`), and Heavy Slam's +20% widens the new base (81.6°). The jump slam keeps 102°, so it is now wider than the main as well as longer; this revises §8.2's "as wide as the main's" (REDESIGN.md's knight table still says it; the user decides at the next checkpoint) | User, RC2: "Warden main range is good, but make the cone narrower" (RD3-fix-3) |
| 130 | 2026-11-23 | Nanite blast | 5 nanites, evenly over 0.8 s from the press, each to a random spot in the cone at 60–100% of the range (`combat:<wave>` stream), along the aim he released with. Each nanite restarts regen; going down, dazed or a phase end drops the rest. The cooldown never goes under `burstMs`, whatever his attack speed (§8.2) | One burst per release, and RC1's regen rule on the blast's own firing path (RD8) |
| 131 | 2026-11-23 | Artificer healing | Field Medic and beacon healing charge the super at `superCharge.perHeal`, through Focus (Field Medic's own `chargeRate` is gone); only Field Medic charges the meter. The beacon pulses at once when it switches on, then every `heal.everyMs`, and keeps working while he is down; Booster Beacon raises heal per pulse (`buildPower`) and HP (§7.4, §8.3) | One charge rule for both heals; `buildPower` is the contract's heal-per-pulse stat (RD8) |
| 132 | 2026-11-23 | Build HP on resume | A restored build's max HP is recomputed from its owner's cards before its saved HP is applied (§15.8) | Otherwise a resume clips a Booster Beacon back to base HP (RD8) |
| 140 | 2026-11-23 | Commander main and super (RD9) | The shield bash is an arc with knockback and no wind-up (the hit lands on the press, the sparks on the clip's impact). Reinforcements is an aimed throw: the stick's length sets the distance like a thrown build, a quick tap goes toward the flag (stopping at it) or straight ahead. Both go through `fire()`, so both restart regen; placing or recalling the flag doesn't (#120) | RD9 entry settles §8.2 vs the old tap content; no wind-up keeps a short melee hit responsive |
| 141 | 2026-11-23 | Rally flag as a build (RD9) | The flag is a `BuildEnt` (saved and drawn like any build; `PlayerEnt.flag` holds where it stands or will land, set at the throw, so the squad moves at once and the banner leaves his back). `BuildBehavior.placed` is the new optional hook. Its view takes the owner's color from `BuildViewState.ownerTint` | Replaces RD2's "until RD9" flag on the player; one pipeline for every build |
| 142 | 2026-11-23 | Squad (RD9) | `start` soldiers once per run (`PlayerEnt.squadSeeded`), no respawn; a resume restores exactly the survivors around him or at his flag. Forced March, Drillmaster and Reinforced Ranks are the Commander's `squadSpeed`, `squadHp` + `squadDamage` and `squadCap` stats (Forced March capped at +40% like movement). Last Stand counts soldiers short of the cap, since the squad no longer has a fixed size. Squad damage counts in his `damageDealt` | §8.4; the stats were reserved in RD2; the cap is the only stable "full size" without respawn |
| 143 | 2026-11-23 | Morale and Warcry (RD9) | Morale: `morale` re-applied from him and from the flag's build behavior, so the flag keeps working while he's down (§7.1), one effect through `refresh`. Warcry applies the same effect and sends `warcry` so the TV flashes only the knights it reached; the Morale card itself shows nothing. The Lead from the Front module, motes and aura are gone | §6.1 "no visual of its own" needs a signal apart from the effect |
| 150 | 2026-11-23 | Brute targeting | The Brute rechecks the nearest targetable build every step, so a build landing nearer pulls it off course and flashes a new lock-on (§9) | "Nearest" plus "builds are Brute bait" reads as live; a sticky target would ignore the bait (RD10) |
| 151 | 2026-11-23 | Flyer and builds | "Ignores ground builds" means trap builds: a Flyer never sets off mines, and still shoots knights and HP builds in its aggro radius (§9) | REDESIGN D1's list is "mines, nets, traps", and §7.3 and §9's aggro rule include Flyers (RD10) |
| 152 | 2026-11-23 | Charge rules | Tell 1.6 s with the lane up, then a run at 8 tiles/s to 3 tiles past the knight, stopping short of the map edge and Citadel; the lane's half-width (1.2) is exactly what it hits; knights and soldiers take one 35 hit and are thrown 3 tiles aside; a stagger calls it off and the cooldown stands (§9.2) | Starting values; what the marker shows is what it hits, so it stays dodgeable (RD10) |
| 153 | 2026-11-23 | Mk III Runner calls | Runner calls run for the whole Mk III fight, the first after half a cooldown; the final phase only shortens them (§9.2) | REDESIGN D2: Mk III adds calling Runners "and, in the final phase, the shockwave" (RD10) |
| 154 | 2026-11-23 | Hunter pace | Stalk speed is §9.1's 1.3 (the code still had the tower-defense 1.5), × 1.4 once locked on; the lock holds until the quarry changes; the flash is at the quarry's feet (§9, §9.1, §9.6) | The two phases need a real speed change; §9.6 names the quarry's feet (RD10) |
| 155 | 2026-11-23 | Boss damage scaling | The boulder, shockwave rings and Charge take the same difficulty × wave multiplier as the slam, read from its baked damage (§9.3) | The multiplier "applies to every type"; these three used difficulty only (RD10) |
| 156 | 2026-11-24 | Commander RC2 notes (RD9-fix-1) | The shield bash is a solid rectangle (`AttackDef.shape 'rect'`, `width`, stat `width`) from his feet along the aim: 2.25 tiles long, 2 wide, every enemy body overlapping it hit, knockback 0.96 (×0.8), still pushed away from him; Heavy Bash widens it (+20% `width`) instead of the arc. Soldiers walk at 3.9 tiles/s, about 90% of his 4.3; the hurry (×1.3 past 3 tiles) still lets them regroup. The TV's aim preview draws the rectangle (§8.2, §8.4, §10.1, §15.4) | RC2 notes (Foster): "make the commander's squad slower"; "a wide solid rectangle instead of a cone", "+range", "−20% knockback" |
| 157 | 2026-11-24 | Leash resume | An aggro-leash enemy that loses its target (past the leash, or the target goes down, dazed or away) goes on toward the base from where it stands on the ground field (a Flyer straight at the Citadel), not back to the point it left; a target let go at the leash is ignored until it leaves the aggro radius (`EnemyEnt.dropped`), so the leash still ends a chase (§9, §15.5) | User, RC2 (RD10-fix-1): enemies walked back to their old path first |
| 158 | 2026-11-24 | Soldiers as targets | The Commander's soldiers are aggro targets like knights (same radius, leash, nearest wins; a knight on an exact tie); Siege ranks them with the players; a soldier in the air isn't a target until it lands. The Brute's build hunt, the Hunter's quarry and the Colossus's boulder and Charge lock-ons stay knight (or build) only (§9, §8.4) | User, RC2 (RD10-fix-1); the lock-ons are each enemy's own rule in §9 and §9.2, and the slam and Charge already hit soldiers |
| 159 | 2026-11-24 | Burn size | The burn and corrosion looks are 0.45 of the body's height, capped at 1.1× the frame, with their bottom at the top of the legs (§15.2) | User, RC2 (RD10-fix-1): the flames were the body's full height, huge on the Colossus |
| 160 | 2026-11-24 | Commander RC2 notes (RD9-fix-2) | Soldiers walk at 3.45 tiles/s, about 80% of his 4.3 (was 3.9); the hurry past 3 tiles goes from ×1.3 to ×1.45 (about 5 tiles/s, the old regroup pace) so they still catch him. The bash rectangle is 1.5 tiles wide (was 2, −25%), reach kept at 2.25; knockback 0.864 (×0.9); Heavy Bash still widens it by 20% from the new base (§8.2, §8.4) | RC2 notes (Foster): "Commander squad members should be even slower"; "Narrow the commander bash hit by about 25%, and decrease the knockback by about 10%" |
| 161 | 2026-11-24 | Burn size, again | The burn and corrosion looks are 0.7 of the body's height, capped at 4× the frame (only the Colossus reaches it), bottom still at the top of the legs; flame height in sprite units, old / #159 / now: Grunt 80 / 36 / 56, Flyer 50 / 22.5 / 35, Brute 125 / 44 / 87.5, Colossus 280 / 44 / 160, each within 4% of halfway; corrosion keeps the same rule (§15.2; reverses #159's numbers) | User, RC2 (RD10-fix-2): "Flames are now too small. Find a happy medium." |
