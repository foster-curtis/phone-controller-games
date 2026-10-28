# Fort Frenzy — Spec (working draft)

Working title: **Fort Frenzy** (formerly "Hold the Line", then "Stronghold"). The name must be cleared
before any public release (§14).

Co-op wave defense for 2–6 players. Phones are controllers; the shared screen (TV/laptop) runs the game.
This file records **decisions made so far**. Items deferred past v1 are in §13. Items still open are in
§14.

**Status:** v1 game design and technical design are complete. §1–§14 are the game design; §15 is the
technical design (repo, engine, simulation, data, pathfinding, protocol, controller, resume, testing,
hosting) and its decision log. Next step: a build plan (`BUILD_PLAN.md`) made from this spec. Internal
names in this spec (Engineer, Grunt, and so on) are code IDs; player-facing names come from the theme
(§2.1).

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

- **Action-first with light strategy.** Every player controls a fighter avatar (twin-stick action).
  Each class also has a build or role kit that carries the tower-defense strategy.
- **Your character is the cursor.** Structures are placed at the player's feet. There is no separate
  on-screen cursor.
- **Design principle: roles amplify, never gate.** Any team composition must be able to play a full run.
  Every enemy type must be answerable by at least two classes or by a baseline that every team has.
- Classes are picks, not required slots. Duplicate classes are allowed.

### 2.1 Themes

The game is built **theme-agnostic**. A theme is a skin and never changes gameplay. Game code refers only
to internal IDs (`engineer`, `arrow_tower`, `colossus`, and so on). A **theme pack** maps each ID to how
it looks and sounds.

| A theme pack can change | Every theme must keep the same |
|---|---|
| Sprites and animations | Hitbox sizes and attack shapes |
| Sound effects and music | Attack wind-up timing (a 1.5 s slam lands at 1.5 s in every theme) |
| Display names for classes, structures, enemies and the boss | Stats, costs and wave data |
| UI colors and fonts, flavor text | What colors mean: red ground markers mean danger, and player and enemy colors stay distinct |
| The map's look | Map layout, lanes and tile grid |

- The spec and code use the internal class names (Engineer, Warden, Quartermaster, Commander). Each theme
  supplies its own display names.
- Players pick the theme on the TV home screen, before the lobby.
- **v1 ships one theme: tech-medieval.** The second theme, Pillow Fort, ships in v2 (§13).
- v1 is built directly with tech-medieval art. There is no placeholder greybox phase.

**Tech-medieval (v1), neon knights style.** Classic fantasy shapes, but every ability comes from
technology, not magic: powered armor, rail-bows and nanites. The look is clean sci-fi armor with glowing
lines: dark backgrounds, bold silhouettes and emissive accents, which give strong contrast on a TV.
- **Players and player structures glow amber,** matching the fostercurtis.dev brand amber (`--amber`,
  `#e8a33d`, in the brand kit, §2.3). Every knight's armor glows amber, as do towers, walls and the
  citadel core.
- **The Iron Tide glows violet** (`--hostile`, `#8f6bff`). Amber against violet sits on the yellow–blue
  axis, which the common red–green forms of color blindness preserve, and the two also differ strongly in
  lightness. (Changed from cyan on 2026-10-26: violet keeps the enemy glow clear of the blue and green
  player colors.)
- **Red is reserved for danger:** ground markers for incoming attacks and low-HP warnings. Neither side
  uses red as its main glow.
- **Player identity** (every knight glows amber, so identity never rides on the glow). Three layers,
  from most to least important:
  1. **Ring (primary):** a thin outline ellipse under the feet in the player's color (at the 0.6 ground
     ratio, §2.5), never a filled disc, so it never reads as a red ground danger marker. A small notch
     on the ring points in the aim or facing direction. The ring also marks where structures are placed
     (§7).
  2. **Color part on the helmet (secondary):** each class carries the player's color on its helmet,
     each in its own shape: the Warden's crest, the Ranger's feather and the Commander's horsehair plume,
     and the Artificer's painted crown cap and lens bezel. The color part is drawn as a separate
     grayscale layer tinted at runtime, so one sprite sheet serves every color.
  3. **Name and HP bar, above the sprite:** white Geist 600 with a thin ink outline, HP bar directly
     under the name. Above, because the feet already carry the ring, the build ghost and danger markers.
     Near the top edge of the map (by the Citadel) the label flips below the sprite.
- Player colors (assigned on join, §11.1) must stay distinct from amber, enemy violet and danger red
  (palette in §2.3).

Display names and visuals:

| Internal ID | Display name | Visual |
|---|---|---|
| Base | Citadel | A citadel with a glowing power core |
| Engineer | Ranger | Ranger with a rail-bow |
| Warden | Warden | Heavy knight with a gravity hammer |
| Quartermaster | Artificer | Artificer with a nanite projector |
| Commander | Commander | Knight-captain leading a squad of automaton footmen |
| Arrow tower | Pulse turret | Auto-turret |
| Bomb tower | Mortar tower | Mortar emplacement |
| Wall | Wall | Hard-light barrier |
| Snare | Shock Net | Electrified net on the ground that zaps enemies crossing it |
| Fortify | Fortify | Shield emitter attached to a tower |
| Spiked walls (shop item) | Charged walls | Coils and crackling bolts on the wall |
| Supply crate | Power cell | Glowing cell |
| Supply depot | Armory | |
| Base archers | Sentry guns | Wall-mounted sentry turrets |
| Grunt | Drone | Drone soldier |
| Runner | Skitter | Scuttler bot |
| Brute | Brute | Heavy siege mech |
| Siege | Bombard | Long-range artillery walker |
| Flyer | Wasp drone | Hover drone |
| Swarm | Scrap mites | Swarm of small bots |
| Hunter | Stalker | Stalker bot |
| Colossus | Colossus | A giant walker mech with a glowing core in its chest |
| Enemy faction | The Iron Tide | The machine army |

### 2.2 Difficulty

- Difficulty is a **separate setting**, chosen on the TV home screen: **Easy, Normal or Hard.** All three
  are in v1.
- Difficulty is independent of theme. Each theme has a default difficulty (tech-medieval: Normal), which
  players can change.
- Difficulty applies multipliers to existing config values:
  - wave budget
  - enemy HP and damage
  - base HP
  - coin income
- The difficulty multiplier stacks with player-count scaling (§9.4). Starting values are set in
  playtesting.
- The resume snapshot (§11.5) stores the run's theme and difficulty.

### 2.3 Branding (settled)

Domain: `fort-frenzy.fostercurtis.dev`. Branding is in v1, from the brand kit:
`src/styles/brand.css` (every visual token as a CSS custom property), `brand/` (SVG marks and the
`<head>` snippet) and `public/` (favicon, PWA icons, manifest). Same layout as Sunny Side's kit; when
code exists, mirror `brand.css` in a typed `src/shared/theme.ts` for the renderer, with a parity test.

- **Family core, unchanged:** ink `#14161a`, paper, amber `#e8a33d`, gray, and the shared dark surface,
  border and muted values, identical to fostercurtis.dev, Sunny Side and World Conquest. Body text is
  Geist; room codes are JetBrains Mono.
- **Mark ("the keep"):** a white crenellated tower on the ink rounded tile with a lit amber gate whose
  light spills onto the ground. Same grammar as the family marks: ink tile, white object, one amber point.
  A pixel-snapped 16 px version (`mark-small.svg`) feeds the `.ico`.
- **Signature treatment:** chamfered (cut) corners and amber glow. No tilt and no hard offset shadow
  (Sunny Side's move). Glow is applied with `filter: drop-shadow`, since chamfers use `clip-path`.
- **Color rule:** amber glow means ours (player armor, friendly structures; in the UI, ready, selected
  and active states). Violet glow means the Iron Tide. Red means danger only.
- **Display face:** Chakra Petch 700, uppercase, slight tracking. Its chamfered terminals match the UI
  shape.
- **World tokens:** `stone` `#262b33` for panels and map ground, `stone-edge` `#3a404b` for walls,
  `ember` `#ffd08a` for glow cores, `hostile-core` `#c7b4ff` for enemy glow cores.
- **Player colors (6):** cobalt, jade, sky, bone, rose and forest, from the shared family palette.
  Crimson (too close to danger red) and berry (too close to violet) are left out. Because every knight
  glows amber, player identity shows on nametags, rings and armor accents (for example plumes), never on
  the glow itself.
- **Themes are skins on this brand.** The color rule carries into Pillow Fort: amber becomes fairy lights
  and flashlights, violet becomes glowing eyes under the bed.
- All assets must be commercially licensed. Chakra Petch, Geist and JetBrains Mono are OFL.

### 2.4 Character art (settled)

Applies to every theme pack. Theme packs change the drawings, not these rules.

- **View:** oblique three-quarter top-down, defined exactly in §2.5. Every part shows its top face
  above its front face.
- **Facing (4 directions):** each knight and each footman has three body views: side (mirrored for left
  and right), front (facing the camera) and back. A unit faces where it's aiming while attacking, and
  otherwise where it's moving; it picks the view from the stronger axis, with a small dead zone so it
  doesn't flicker on diagonals. Attack arcs, the aim line and the ring notch still rotate a full 360°.
  Enemies use the side view only (mirrored) in v1; back views for common walkers are a v2 candidate.
  The Artificer's backpack gauge only needs to read in the side and back views.
- **Method:** vector cut-out rigs. Each character is a set of separate SVG parts (legs, torso, helm,
  color part, weapon, emissive layer) that code moves, rotates and scales to animate. The color part is
  tinted per player; the emissive (amber) layer is drawn last with a bloom and can brighten or pulse
  during attacks.
- **Readability:** every part has a dark ink outline; armor is cool gunmetal steel lit by amber seams.
  Each class has a distinct silhouette, helmet and color-part shape, so classes are recognizable at TV
  size before color is read.
- **Alignment and layering:** every attached part (spikes, horns, studs, plumes, ears, fins, emissive
  seams) sits on the edge or surface it belongs to; glows never cross onto a different part. Limbs
  attach under the body: far-side parts are drawn behind it, and near legs tuck under the body rather
  than overlapping it from above. Groups (Scrap mites, squads) draw back-to-front by depth.
- **Full-size parts:** every part is drawn complete and at full size in every view, then layered, even
  where another part hides most of it (a bow behind the body, a draw arm behind a cloak, the hand that
  isn't holding anything). Animation can then move any part into view without it looking cut off or
  disconnected. Straps and belts run edge to edge across the body so they read as wrapping around it.
  In the back view the backpack (the Artificer's) is the top layer, since it's nearest the camera.
- **State on the body:** class mechanics show on the sprite, not only in a HUD (Ranger's bolt brightens
  with Steady Aim, Commander's banner leaves his back when planted, Artificer's backpack gauge shows
  crates carried).
- **Shared animations:** hit (white flash, small lean), down (kneel, emissive dims to gray, respawn
  countdown where the name was) and respawn (assemble in a column of amber light at the base) are the
  same for every class.
- **Healing visuals:** all healing is amber (it's ours), marked with small white "+" glints. Never
  green, since jade and forest are player colors.

**Warden (neon knights):** widest and squattest silhouette; closed great helm with a glowing amber
T-visor; front-to-back crest plume (crest shape is Warden-only); gravity hammer with the head centered
on the haft and an amber gravity coil at the center of the head, which brightens during the slam
wind-up. Amber seams: chest chevron, power core, belt, pauldron trim, knee.
Animations: idle, walk, main (ground slam), super (stomp with shockwave), build (kneel and tap),
Mason passive sparks to nearby walls.

**Ranger (neon knights):** tall, narrow silhouette with a dark cloak behind and the bow in front;
sallet helm with a narrow amber goggle slit; one long swept-back feather plume (feather shape is
Ranger-only); recurve rail-bow with amber rails on both limbs, an amber string and a glowing bolt.
The bolt and rails brighten in steps while Steady Aim builds, so the passive is visible. A dark leather
quiver strap runs shoulder to hip with amber studs (the bowstring is the only amber line on him);
amber knee; quiver bolts glow at the tips.
**Two poses in every facing:** standing (idle and walk: bow lowered in the bow hand, string relaxed and
straight, draw arm at his side) and ready (Steady Aim and firing: string drawn to the hand, bolt nocked;
from the front the bow is aimed at the camera, from the back the draw elbow rises past the cloak).
Animations: idle, walk (quicker, lighter cadence than the Warden), Steady Aim (blends from standing to
ready), main (longbow shot with an amber tracer), super (pulse ring sized exactly to the hit circle),
build (kneel and place a deploy beacon; turrets unfold).

**Commander (neon knights):** medium build; armet helm with an amber circlet across the brow (the only
helm with a "crown"); horsehair plume that arcs up and back, then falls behind the helm (Commander-only
shape); wedge-bladed sword with a chisel tip, set on the grip's center line, whose amber edge is a right
triangle along the cutting edge, thickest at the base by the guard and thinning to the tip; amber
diamond rank badge on the chest. The rally flag rides on his back as a banner; planting it moves it
into the world, so "following" vs "holding" is visible at a glance.
Animations: idle, walk, main (sword slash; the amber edge flares and leaves a trail tracing the exact
hit arc), super (morale: amber pulse, and an amber aura on him and his squad that fades as the buff
runs out, doubling as its timer), plant flag / recall, Lead from the Front link lines to nearby
footmen.

**Automaton footmen:** about half the Commander's height; amber eye; mini plume swept back in their
Commander's player color; straight blade, fully amber, with a dark crossguard. No ring and no name.
Animations: march, short stab, collapse into scrap and fade.

**Rally flag:** the flag cloth is in the Commander's player color (a second tinted part), so two
Commanders' flags and squads are never confused; a planted flag has an amber ring at its base.

**Artificer (neon knights):** medium build with a boxy power-cell backpack, the only knight wider at the
back than the front; rounded helm with a single round amber lens; no plume: his color is a painted
crown cap and a bezel ring around the lens (the bezel deliberately breaks the helm's outline); arm-
mounted nanite projector with an amber lens and a drifting cloud of amber nanites; amber hexagon
(nanite cell) emblem on the chest, never a cross; tool pouches on the belt; amber knee.
**Backpack gauge:** three cells that fill bottom-up. Each cell is 2 crates; an odd count lights only the
bottom half of the next cell; 6 or more crates shows all three full (the cap is 8).
Animations: idle, walk, main (nanite bolts fanning in a narrow cone, stopped by walls and towers),
super (wide amber nanite cone drawn over walls, since it passes through them; healed players and
buffed towers get white "+" glints), Field Medic (faint dotted amber ground circle, never filled),
carry and throw (gauge steps up or down a half cell per crate; a thrown cell lobs in an arc).

### 2.5 Perspective and projection (settled)

Every sprite, structure, effect and UI element drawn in the world follows one projection: oblique
three-quarter top-down (as in Zelda or Stardew Valley). Nothing is drawn straight from above, and
nothing is drawn as a flat front view with no top. Applies to every theme pack.

**The rule**
- **Ground is squashed vertically by 0.6.** Everything lying on the ground is drawn at width × 0.6
  depth: tiles, shock nets, structure footprints, player rings, red danger markers, area-of-effect
  rings, shockwaves, auras, blast rings and shadows.
- **Uprights keep full height and show a top face.** On chamfered shapes, the angled band above the
  front face is the top face: shade it lighter and draw a thin crease where it meets the front. Boxes
  get a top rectangle; cylinders and rings get an elliptical top at 0.6; domes and spheres sit in a 0.6
  base ellipse or socket.
- **Shading:** tops lightest, fronts mid, left side darkest, light from above and slightly right.
  Knights and structures: tops #7d8798 or #5c6676, fronts #4a5362, shade #3c4452. Iron Tide: tops
  #6a5f8f or #4a4068, fronts #3a3150, shade #2a2340.
- **Shadows:** a 0.6 ellipse sized to the footprint and centered on it (not on the bottom edge of the
  feet). Knight about 22 × 13 in sprite units; Colossus about 60 × 36.
- **Height:** anything off the ground keeps its shadow on the ground directly beneath it; the gap
  between object and shadow shows its height (Wasp drones, mortar shells, boulders, thrown power
  cells, launched Skitters).
- **Draw order:** sort by foot point (lower on screen is drawn in front). Flyers and arcing
  projectiles sort by their shadow. Groups draw back-to-front.

**Grid and scale:** a tile is W wide and 0.6 W deep on screen. On the 1920 × 1080 logical canvas,
W = 48 px (48 × 28.8). Characters are about 1.6 W tall (about 77 px). Art is authored with a tile of
80 × 48 sprite units.

**Implementation:** the sim stays in square tile coordinates with circular hitboxes. Only the renderer
projects: screen y = world y × 0.6 − height. Hitboxes, ranges and AoE are drawn as 0.6 ellipses of the
same circles the sim uses, so what players see always matches what hits.

**Walls and nets in both directions:** a wall running across the screen shows its full light panel; a
wall running into the screen is seen edge-on and shows as a glowing top strip between stacked posts.
Walls and shock nets use autotile sets (across, into, corner, T-junction, cross, end) chosen from
neighboring tiles.

### 2.6 UI art (neon knights)

- **Icons: lit badge.** A solid bone glyph (24-unit grid) with ink cut-ins and amber parts that glow,
  set inside a chamfered gunmetal tile. The tile carries the state: rest (gunmetal edge), active,
  selected or ready (amber edge with glow), dimmed (glyph at 35%, e.g. the action button with nothing
  to do). Where space is tight (TV announcements, wishlist rows, inline text) the glyph is used without
  the tile. Class badges are the class helms, so a class looks the same everywhere.
- **Icon files:** `art/<theme>/icons/<id>.svg` with `.glyph` and `.glow` groups, plus `badge-tile.svg`
  and `badge-tile-active.svg`. Theme packs replace them under the same names. The action button swaps
  between the `act-*` icons per §10.1. Icon ids:
  - classes: `class-warden`, `class-ranger`, `class-commander`, `class-artificer`
  - main attacks and supers: `main-<class>` and `super-<class>` for each class
  - structures: `cell`, `turret`, `mortar`, `wall`, `net`, `fortify`
  - action button: `act-pickup`, `act-deliver`, `act-buy`, `act-place`, `act-throw`, `act-flag`,
    `act-recall`, `act-give`, `act-drop` (dimmed to 35% when nothing applies)
  - shop and HUD: `coins`, `ready`, `request`, `repair`, `emergency-kit`, `base-armor`, `sentry-damage`,
    `sentry-range`, `sentry-third`, `squad`, `turret-rate`, `mortar-radius`, `tower-hp`, `wall-hp`,
    `charged-walls`, `net-charges`
  - Still to come: `act-give`, `act-drop` and `net-charges` (§14). Until they land, those slots show
    text.
- **TV HUD layout (combat):** a thin top band split three ways: wave and phase top-left, base HP bar
  centered directly above the Citadel, team coins top-right. The boss bar runs along the bottom edge,
  where enemies enter. Purchase announcements stack bottom-left (glyph + text, a bar in the buyer's
  color). During the build phase the wishlist shows on the right. Everything stays inside the 96 px
  TV-safe margin.
- **Phone buttons:** round, at the §10.1 sizes, gunmetal fill with a gunmetal edge, the action icon
  inside; the super's charge is a ring that fills clockwise and lights amber when full. The stick
  is round.
- **Phone screens:** join (code prefilled from the QR, name, one button); class select (swipeable cards:
  the knight's front view in the player's color, role, main and super with tap/aim, passive, build kit);
  lobby (big Ready, lineup with color, class helm and ready state; the party leader also sees difficulty
  and Start); combat controller with a status strip (HP, cells carried up to the carry cap, base HP);
  build tab (stick stays; kit tiles with cell costs, Place, Cancel, Give, Ready; classes with no
  structures see a "No buildings to build" note in place of the kit tiles, §10.2); shop tab (full
  screen, the stick returns on the Build tab: team coins, the private pick-1-of-3 card with rarity on
  the frame, team shop rows with price, hold-to-confirm fill on big buys, Request and "Requested by"
  tags); down (respawn countdown only); reconnecting overlay; end of run (party leader's three options).
- **Upgrade cards:** chamfered portrait cards; common has a gunmetal frame, rare a double amber frame.
- **TV screens:** home (keyboard and gamepad: the focused row is lit amber, ◂ ▸ change theme and
  difficulty, "Resume wave N" only when a snapshot exists); lobby (URL, large mono room code, QR, six
  slots showing each knight's front view in the player's color with a name band, class and ready state;
  open slots dashed); combat HUD (see above; the Stalker's target thread and the super-ready badge over a
  knight are world UI); low-HP alarm (red vignette and "Citadel under attack" under the base bar);
  build-phase HUD (the phase timer replaces COMBAT; the next-wave preview takes the boss bar's place at
  the bottom with enemy portraits and counts, a newly introduced type framed in violet; ready status and
  wishlist on the right; build ghosts dashed amber when valid, red with an X when blocked); victory and
  defeat summary (banner over the keep, run stats, one award card per player in their color).
- **Lane warnings:** the spawn-warning glow (§9.4) is a violet gradient band on the screen edge where
  the lane enters.

## 3. Map, base and camera

### 3.1 Map
- The base sits on the **top edge** of the map, centered, with its gate facing down-field. In the §2.5
  view, tall sprites hide what's drawn behind them (above them on screen). At the top, the Citadel only
  hides off-map space, and players see its gate rather than its back.
- Enemies arrive through lanes from the bottom and sides and march up the screen. More lanes open as
  waves progress.
- v1 has one map with 3 lanes.

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
  - **Siege** enemies shell the base from range.
- **Feedback:**
  - The HP bar flashes on every hit, and the screen shakes slightly on big hits.
  - At 25% HP, an alarm sounds and a red tint appears around the TV edges.
  - Base HP is also shown in each phone's status strip.

### 3.4 Repair
There is no passive regeneration. Damage is permanent unless someone acts.

| Source | Who | When |
|---|---|---|
| Crate delivery: drop a crate at the base to repair a chunk of HP | Anyone (the Quartermaster is best at it) | Any time |
| Shop repair, with a price that rises each purchase | Anyone, paid from team coins | Build phase |
| Emergency repair kit | Quartermaster-only shop item | Instant, usable mid-combat |

Crates therefore have two uses: building or repairing.

### 3.5 Base archers
- **2 archers** are always present. They are part of the base and can't be killed separately.
- They target the nearest enemy in range, **including Flyers**.
- **Shop upgrades, buyable by anyone:** three independent one-time purchases, in any order:
  - Damage
  - Range
  - A third archer

### 3.6 Citadel art (neon knights, settled)

- **The brand keep, built:** the Citadel is the favicon in 3D: a crenellated keep with a lit amber gate,
  flanked by curtain walls and two corner towers. Footprint 4 × 2 tiles centered on the top edge, gate
  facing down-field. Stone-gunmetal fronts, lighter tops, amber glow seams; drawn per §2.5.
- **Layering:** the core and tower sentries stand on the roof top faces and are drawn before the front
  ramparts (merlons), so the ramparts overlap their bases.
- **Power core:** a glowing amber sphere in a three-prong cradle on the keep's roof, the brightest point
  on our side. It flickers on every hit and dims at the lowest damage stage.
- **Repair zone:** a dashed amber pad with chevrons pointing into the lit gate, on the ground in front of
  it. Cells are carried into the gate.
- **Sentry guns (base archers, §3.5):** one swivelling unit per tower: a drum head on a fixed pedestal,
  with the barrel coming out of an amber-ringed collar. The head is modeled in 3D and projected per §2.5
  so the drum, collar and barrel always line up (pre-rendered frames, not a separately rotated barrel).
  Five aim frames: left, down-left, at camera, down-right, right (the window sentry uses at camera). A
  sentry snaps to the frame nearest its target. Damage swaps in twin barrels; Range adds a laser scope on
  top of the collar with a fading amber sight line; both can stack (4 loadouts × 5 aims). The third
  sentry leans out of a window above the gate, so it never blocks the core. Sentries fire amber tracers,
  including at Wasp drones.
- **Damage stages (§3.3), cumulative:** 66% cracks (each crack drawn individually, with its own length,
  angle and branches, never one shape repeated; broken glow seams, a fallen merlon, rubble at the wall
  base); 33% adds fire (flames on the keep and walls); 10% adds heavy smoke (tall plumes, dimmed core and
  gate). Stages reverse as HP is repaired back over each threshold.
- **Animations:** hit (core flickers, keep shakes, HP bar flashes); siege shells (red landing marker on
  the footprint first); repair delivery (amber pulse climbs the keep to the core); shop repair and the
  emergency kit (an amber wave over the whole Citadel, brighter and faster for the kit); low HP at 25%
  (core pulses with the alarm); destroyed (core implodes, glow cuts out, keep collapses into its
  footprint).
- **Armory pad (supply depot):** a kiosk racked with glowing power cells under an amber hex sign with a
  cell icon, on a solid-outlined 1 × 1 tile pad with the same icon on the ground. Drawn per §2.5 (pad
  top face plus front lip, kiosk with a top face). It reads as "get cells here", while the repair zone
  (dashed, chevrons, at the gate) reads as "bring cells here".

## 4. Run structure

- **Fixed run of 15 waves.** Bosses at waves 5, 10 and 15. Target length is about 22–27 minutes,
  including build phases (§9.4).
- **Loss:** the team loses when the base reaches 0 HP. The base plays a collapse animation, then the
  summary screen appears.
- **Win:** the run is won when the wave 15 boss is defeated. A victory screen appears, then the summary
  screen.
- **Summary screen:** shows waves survived and fun per-player stats, such as most damage dealt and most
  crates delivered.
- **End-of-run options** (chosen by the party leader's phone, §11.1):
  1. **Play again** (default): every player keeps their class and goes straight to Ready.
  2. **Change classes:** players return to class select.
  3. **Return to home:** the TV goes back to the pre-lobby home page. The room closes, and players
     rejoin through a new room code.
- The resume snapshot (§11.5) is cleared when the run ends.
- Each wave has two phases:
  - **Build/shop phase:** no enemies. Players build, shop and pick upgrades.
  - **Combat phase:** pure action. No menus.
- The upcoming wave's composition is shown during the build phase.
- Enemy count scales with player count (§9.4) and difficulty (§2.2).

## 5. Death and respawn

- Players have HP. When they die, they respawn at the base after 10 seconds.
- **HP carries over between waves;** the build phase doesn't reset it. Healing and mending auras
  (Field Medic, Mason) are off during the build phase (§8).
- Players who are dead when combat ends respawn at once, at the start of the build phase.
- Nothing is lost on death: upgrade cards and team purchases persist.
- On death, a player drops any supply crates they were carrying. The crates stay on the ground, where
  any player can pick them up. (Coins are never carried; they go straight to the team pool.)

## 6. Economy

- Kills add **coins** directly to a **shared team pool**. Players never carry coins.
- **Coins** buy things: supply crates and team shop items (§6.2).
- **Supply crates** are what structures cost. Every structure (towers, walls, snares and Fortify)
  costs crates; the rally flag is free. Crates are also used to repair the base (§3.4).
  - The **supply depot** is a pad beside the base. It sells crates to any player at full price, during
    both phases. The depot pad and the base's repair zone are separate areas, so the action button is
    never ambiguous (§10.1).
  - **Crates are personal inventory.** Coins stay in the team pool, but each player carries their own
    crates. Crates bought from the phone shop go straight into the buyer's inventory.
  - **Carry cap:** non-Quartermasters carry up to the crate cost of the most expensive structure
    (starting value: 4), so any builder can afford any structure alone.
  - **Carry slowdown:** non-Quartermasters move more slowly the more crates they carry. The penalty
    grows faster than linearly: 1 crate is barely noticeable and a full load is a significant slowdown.
    This keeps the Quartermaster busy as the team's crate runner.
  - **Any player can hand over or drop crates,** in either phase (§10.1, §10.2), so crates are never
    stuck with a player who can't use them.
- **Quartermaster supply perks:**
  - Buys crates at a discount.
  - Carries up to 8 crates with no slowdown.
  - Can throw crates.
  - Has access to Quartermaster-only shop items, for example base armor and an emergency repair kit.
- **Between waves:**
  - Each player privately picks 1 of 3 upgrade cards for their own character (§6.1). Cards are free.
  - The team shop spends from the shared pool (§6.2).

### 6.1 Upgrade cards

**Rules**
- Cards are **specific to each character**. Each card upgrades only the player's own character: its
  attacks, super, passive or personal role. Cards never raise raw stats for structures or the Commander's
  squad; those upgrades come from the shop.
- **Offer:** 3 cards per build phase, with no duplicates within one offer.
- **Rarity:** common and rare.
  - About 15% of offers include one rare (never more than one).
  - Every offer after a boss wave includes a guaranteed rare.
- **Stacking:** cards can be picked more than once unless marked unique. A stack shows as "×N."
- **Stat math:** stacks add percentages of the base value (three +10% cards give +30%), never
  multiplicatively. Range, movement speed and damage reduction have caps (starting value: +40% total).
- **Combo cards** appear only once the player owns both of the combo's prerequisite cards. Combo cards
  are unique.
- **The card picker excludes:**
  - unique cards the player already owns
  - combo cards whose prerequisites the player doesn't own
  - favored-enemy cards whose enemy can't spawn for this team, for example Skyhunter when Flyers are
    replaced (§9)
  - any card that depends on a class not on the team (none in v1, but the rule applies to future cards)
- **Status effects:** burn and poison use the same timed-effect system as stun, slow, morale and the
  tower defense bonus.

**Shared commons (every character, with numbers tuned per character)**

| Card | Effect |
|---|---|
| Vitality | +max HP |
| Might | +damage |
| Haste | +attack speed |
| Reach | +range (capped) |
| Swiftness | +movement speed (capped) |
| Focus | +super charge rate |
| Toughness | Take less damage (capped) |
| Quick Recovery | −2 s respawn time (minimum 5 s) |

**Character cards** (2 commons, 5 rares and 1 combo each)

*Engineer*

| Card | Tier | Effect |
|---|---|---|
| Quick Draw | Common | Faster arrows |
| Blast Radius | Common | Larger super radius |
| Fire Arrows | Rare | Arrows apply burn |
| Piercing Shot | Rare | Arrows pass through the first enemy |
| Skyhunter | Rare | +50% damage vs Flyers |
| Deadeye | Rare | Steady Aim activates faster |
| Volley | Rare | Every 4th shot fires 3 arrows in a spread |
| Wildfire (Fire Arrows + Piercing Shot) | Combo | Burning enemies burst into flames when they die, igniting enemies nearby |

*Warden*

| Card | Tier | Effect |
|---|---|---|
| Heavy Slam | Common | Wider slam arc |
| Earthshaker | Common | Longer super stun. Doesn't add stagger on the boss |
| Aftershock | Rare | Slam leaves a brief slowing zone |
| Giant Slayer | Rare | +50% damage vs Brutes and the Colossus |
| Master Mason | Rare | Mason repairs faster and over a larger area |
| Bodyguard | Rare | Allies near the Warden take 20% less damage |
| Unshakable | Rare | Immune to slows and knockback |
| Fault Line (Aftershock + Master Mason) | Combo | Super stomp sends a shockwave through every wall on the map: every enemy touching any wall takes stomp damage and is briefly slowed, and every wall flashes on the TV |

*Quartermaster*

| Card | Tier | Effect |
|---|---|---|
| Light Load | Common | Allies inside the Field Medic aura suffer half the crate carry slowdown (§6). Unique |
| Strong Arm | Common | Longer, faster crate throws |
| Venom Bolts | Rare | Bolts apply poison |
| Overflow | Rare | Healing beyond full HP becomes a temporary shield |
| Bulk Buyer | Rare | Larger crate discount |
| Wide Aura | Rare | Larger Field Medic radius |
| Triage | Rare | Double healing on players below 30% HP |
| Plague (Venom Bolts + Wide Aura) | Combo | Poisoned enemies spread poison when they die |

*Commander*

| Card | Tier | Effect |
|---|---|---|
| Bladework | Common | Wider sword arc |
| Forced March | Common | Squad moves faster, both when following and when moving to the rally flag |
| Rally Cry | Rare | Longer super duration |
| Siege Breakers | Rare | Squad deals +50% damage vs Siege |
| Veterans | Rare | Soldiers who survive a wave permanently gain stats |
| Last Stand | Rare | Squad deals more damage the fewer soldiers are left |
| Vanguard | Rare | The Commander takes less damage while his squad is nearby |
| Warcry (Rally Cry + Vanguard) | Combo | Super also briefly buffs nearby players |

That is 16 cards per character (64 in total). Exact numbers are set during playtesting.

### 6.2 Team shop

Coins belong to the team, not to individual players. Personal power comes only from upgrade cards, so
every coin purchase is a choice between team purchases.

**What's sold**

| Item | Details |
|---|---|
| Supply crates | Same price as the depot (§6), including the Quartermaster discount, so crates can be bought from the phone during the build phase. They go into the buyer's inventory, up to their carry cap |
| Base repair | Price rises with each purchase (§3.4) |
| Base archer upgrades | 3 independent upgrades, bought in any order: damage, range, a third archer (§3.5) |
| Commander squad stats | After regular waves. Squad size grows after waves 5 and 10 (§8) |
| Arrow towers: fire rate | 3 tiers |
| Bomb towers: blast radius | 3 tiers |
| Tower HP (all towers) | 3 tiers |
| Wall HP | 3 tiers |
| Snare charges | 3 tiers. More discharges per snare (§7.1) |
| Spiked walls | 1 tier. Enemies that attack walls take damage |
| Quartermaster-only items | For example base armor and the emergency repair kit |

- Building upgrades apply to every structure of that type, including structures built later.
- Prices rise with each tier.
- **Items are shown only when the team can use them.** For example, tower upgrades are hidden if no
  Engineer is on the team, and squad upgrades are hidden if there's no Commander.

**Purchasing rules**
- **Any player can buy any team item.** There is no approval step.
- **Every purchase is announced on the TV,** with the buyer's name and color, for example "Foster bought
  Arrow Towers II."
- Items above a price threshold need a **press-and-hold to confirm** (about 0.6 s), to prevent accidental
  purchases.
- **Request button:** any player can tap "Request" on a shop item. The item appears on a wishlist on the
  TV, tagged with the player's color, until someone buys it or the wave starts. This lets quieter players
  join the negotiation without shouting.

## 7. Building and pathing

- Structures snap to a **tile grid** and are 1×1 tiles. Player movement is free and does not snap.
- **Pathfinding uses a flow field.** The game runs one breadth-first search outward from the base over the
  grid. Every enemy follows the resulting "next step" arrows. The flow field is rebuilt only when a
  structure that affects pathing is placed or destroyed. Snares don't affect pathing (§7.1).
- **Walls have a high path cost instead of being impassable.** Enemies route around walls when they can.
  If no route exists, they stop and break through. **Towers block enemies the same way,** with the same
  high path cost.
- **Brutes and the Colossus prefer to smash through walls** rather than route around them: they follow
  their own flow field in which walls are cheap (§15.5).
- **Build phase:** the player opens the build menu on their phone. A ghost preview appears at their feet
  on the TV. They confirm or cancel. The ghost turns red on invalid tiles, for example occupied tiles.
- **Combat phase:** no phone menus. A tap on the action button places the last-used structure; holding
  it opens the build arc on the TV to pick another (§10.1).
- **Placement validity:** a tile must be on the map, buildable (not a lane entry, the Citadel, the repair
  zone or the Armory pad) and free of other structures. Walls and towers also can't be placed on a tile
  with an enemy or player on it; snares can.

### 7.1 Snares

The Warden's snare is a trap, not a barrier. Walls decide where enemies go; snares decide how fast they
get there. In neon knights it is the **Shock Net** (§2.1).

- **Pathing:** a snare costs the same as an empty tile in the flow field, so enemies walk straight
  across it. Placing a snare or having one expire does not rebuild the flow field.
- **Discharges, not HP:** a snare has no HP and can't be attacked or damaged, including by the
  Colossus's slam. Instead it holds a number of **discharges** (starting value: 5).
  - When a ground enemy steps onto an armed snare, it discharges: every ground enemy on the tile is
    slowed, and one discharge is used. A single discharge catches a whole Swarm group on the tile.
  - After a discharge, the snare **rearms** after a short delay (starting value: 0.5 s).
  - When its last discharge is used, the snare fizzles out and frees the tile.
  - The TV shows the remaining discharges on the tile (pips or a dimming glow), and each discharge
    flashes.
- **Slow:** a timed effect (§6.1) of about 40% for about 2 s, so it lasts after the enemy leaves the
  tile. Slows don't stack; the strongest active slow applies. Brutes and the Colossus take the slow at
  half strength, so snares can't stall a boss.
- **Who it affects:** every ground enemy, including Runners. Flyers pass over it. Players are never
  affected.
- **No damage in v1.** The snare's only job is the slow.
- **Cost:** 1 crate, the cheapest structure.
- **Lifetime:** a snare stays across waves until its discharges run out.
- **Wall rules don't apply:** Mason and Master Mason repair, spiked walls, Fault Line and the Brute and
  Colossus bonus damage to walls are wall-only.
- **Placement** follows the rules above: 1×1 tile, build-menu ghost in the build phase, and the action
  button (tap or build arc) in combat (§10.1).
- **Shop:** "Snare charges" (3 tiers) adds discharges to every snare, including ones already placed
  (§6.2).

### 7.2 Structure art (neon knights)

- Every structure is ours: knight gunmetal with amber glow, never violet. Each sits on a dark base plate
  filling its 1×1 tile footprint, drawn per the perspective rules (§2.5).
- **Tiers grow in visual interest**, like the Colossus: each tier keeps the earlier parts and adds new
  ones, plus one amber band per tier (one, two or three) as the quick read. An unupgraded tower shows
  the base parts with no band; each shop tier (§6.2: fire rate for pulse turrets, blast radius for
  mortar towers) adds a band, and tiers II and III also add the parts listed for them. Tower HP tiers
  don't change the look.
  - **Pulse turret:** the base is a round pedestal, a box head with a centered amber sensor eye, and one
    barrel. II adds twin barrels, full-depth side armor on the head and a collar flange. III adds a
    finned barrel shroud, a centered sensor mast with a dish, and buttress struts on the plate. The head
    tracks with pre-rendered aim frames (8 directions, built like the Citadel sentries in §3.6), never
    by rotating a flat sprite; muzzles flash amber at the barrel tips.
  - **Mortar tower:** a ring emplacement with a small dome rising out of its opening; a short tube
    inserts into the dome like a ball-and-socket joint and pivots around the dome's center as it aims,
    so the motion reads as controlled and the tube's end never shows. II adds tube hoops and armor
    blocks set around the rim, each angled to follow the rim's curve; III adds a slotted muzzle brake,
    rim spikes and an ammo rack behind the ring. Shells arc with their own ground shadow and burst in an
    amber ground ring sized to the blast radius.
- **Wall:** two emitter posts with a see-through amber hard-light panel and a ground rail. Neighbors
  share posts and join into one barrier; autotile pieces per §2.5.
- **Charged walls** (the wall upgrade; display name for the "Spiked walls" shop item, same effect:
  enemies that attack walls take damage). Walls are light, so the upgrade electrifies them instead of
  adding spikes: twin coil rings on each post, white-hot forked bolts crackling up the panel on a
  quick, irregular flicker, and sparks at the post tips. When an enemy attacks the wall, a forked bolt
  strikes it and it recoils.
- **Shock net** (the Warden's snare, §7.1): a flat 1-tile mesh on the ground with four low anchor pegs
  and amber charges zigzagging across it on a slow loop. Adjacent nets join into one field (visually
  only; each tile keeps its own discharges). When a discharge slows an enemy, arcs crawl up its legs
  and it moves sluggishly. Remaining discharges and the discharge flash show on the net per §7.1.
- **Telling them apart:** shock nets are flat and amber and slow; charged walls are upright and
  white-hot and damage.
- **Fortify:** a small emitter on the tower's plate projecting an amber dome shield over the whole tower;
  the dome ripples when it absorbs a hit.
- **Power cell (crate):** a small canister with a glowing amber core, the same design as the Artificer's
  backpack cells.
- **Build ghost:** a see-through structure over its ground footprint: dashed amber when valid, red with an
  X when blocked.
- **States:** build (amber outline sketches the shape, then fills from the plate up); upgrade (every
  structure of that type flashes and the new parts bolt on); damaged (below half HP the glow flickers
  and cracks appear); destroyed (glow cuts out, collapses into scrap, fades; the flow field updates
  immediately); Mason repair (amber sparks from the Warden, cracks seal). Our attacks never use red.

## 8. Characters (v1: one per class)

All supers charge by dealing damage, and each character has its own charge rate.

### Engineer (marksman)
- **Main:** Longbow shot. This is the longest range in the game.
- **Super:** A wide circle around the Engineer that deals light area damage and knocks enemies back.
- **Passive — Steady Aim:** standing still (movement stick released) for a short time boosts damage and
  range.
- **Build kit:**
  - Arrow tower: long range, single target, can hit Flyers.
  - Bomb tower: short range, area damage.
- **Strongest against:** Flyers, Runners, and Siege (the longbow outranges them).

### Warden (tank)
- **Main:** Ground slam in a short arc in front of the Warden. Hits multiple enemies.
- **Super:** A longer-range stomp with an arc area of effect. Deals damage and stuns briefly.
- **Passive — Mason:** walls near the Warden slowly repair themselves. Off during the build phase.
- **Build kit:**
  - Walls: reroute enemies.
  - Snares: cheap, single-tile traps that slow enemies crossing them, and expire after a set number of
    discharges (§7.1).
  - Fortify: attaches to a tower and gives it a defense bonus.
- **Strongest against:** Brutes, Swarms and Hunters. The stun also stops Runners.

### Quartermaster (support)
- **Main:** 3–4 energy bolts in a narrow cone at medium-long range. Walls and towers block them.
- **Super:** A very wide, long-range cone. It heals players it hits by a fixed amount and gives towers it
  hits a temporary defense bonus. It passes through walls and towers.
- **Passive — Field Medic:** a small regeneration aura for nearby players. Off during the build phase.
- **Super charging:** damage dealt charges the super. Field Medic healing also charges it, more slowly.
  Healing from the super itself does not charge the super.
- **Role kit:** the supply perks in §6.
- **Strongest against:** Swarms and Flyers. Its main value is keeping the team alive.

### Commander (squad leader)
- **Main:** Sword slash in a short arc in front of him.
- **Super (morale):** For a short duration, his squad gets more attack speed and attack damage. The
  Commander gets the same boosts plus extra movement speed.
- **Passive — Lead from the Front:** the squad deals more damage while near the Commander.
- **Squad:**
  - Starts with 3 soldiers. Grows to 4 after the wave 5 boss and to 5 after the wave 10 boss.
  - Squad stat upgrades are sold in the team shop after regular waves. Commander cards change how the
    squad behaves but never raise its raw stats (§6.1).
  - Dead soldiers respawn at the base between waves.
- **Build kit:** a rally flag. The squad holds the flag's position when it isn't following the Commander.
- **Strongest against:** Siege and Grunts. Can take on Brutes while the super is active.

### Passive implementation
- Each passive is a self-contained module with hooks (for example `onTick`, `onDamageDealt`, `onHeal`),
  attached to a character by config.
- **v2:** each class offers 3 passives, and players choose one at class select. The candidates are:
  - Engineer: Spotter, Steady Aim, Tower Sync
  - Warden: Bulwark, Stonefoot, Mason
  - Quartermaster: Field Medic, Resupply, Salvage
  - Commander: Lead from the Front, Reinforcements, Inspire

## 9. Enemies

Each enemy type is designed as a problem that specific classes solve.

| Enemy | Behavior | Answered by |
|---|---|---|
| Grunt | Walks to the base and attacks whatever blocks it | Anyone |
| Runner | Fast and fragile, ignores players | Towers, walls, snares, Warden stun, Engineer |
| Brute | Huge HP, smashes walls | Warden, focused damage, Commander's super |
| Siege | Stops at range and shells the base or towers | Engineer (outranges it), Commander and squad dive |
| Flyer | Ignores walls | Engineer, arrow towers, Quartermaster, base archers |
| Swarm | Many weak units | Area damage: Warden, bomb towers, Quartermaster, Engineer's super |
| Hunter | Targets players instead of the base | Warden stun, Commander's squad, Quartermaster healing |
| Boss (Colossus, §9.2) | Appears at waves 5, 10 and 15 | Everyone |

- **Melee attacks cannot hit Flyers.**
- **Who attacks players (aggro leash):** Grunts, Brutes, Swarms and Flyers attack a player who comes
  within a short aggro radius, chase up to a leash distance, then return to their path. Runners never
  attack players, Siege always shells the base or towers, and Hunters always hunt players. Radii live in
  config.
- **Flyers spawn only if the team has a ranged class** (Engineer or Quartermaster). Otherwise their spawn
  slots are filled with additional ground units.
- The team's class composition is checked at the **start of every wave**, counting only players
  connected at that moment, so a ranged player dropping mid-run can't strand the team against Flyers.
- The Commander's squad has no bonus archers in v1.

### 9.1 Starting stats

These are starting values for playtesting, relative to the Grunt baseline. All of them live in one
config file.

| Enemy | HP | Speed | Damage | Budget cost | Notes |
|---|---|---|---|---|---|
| Grunt | 100 | 1.0 | 10/hit | 1 | Baseline |
| Runner | 40 | 2.0 | 40 burst | 1 | Hits the base once, then dies |
| Swarm | 8 × 25 | 1.2 | 4/hit each | 3 per group | Spawns as a group of 8 |
| Brute | 600 | 0.6 | 40/hit, 2× to walls | 5 | |
| Flyer | 80 | 1.2 | 12/hit | 2 | Ignores walls |
| Siege | 150 | 0.8 | 25/shell | 4 | Long range |
| Hunter | 200 | 1.3 | 15/hit | 3 | Targets players |

- **Coins per kill** equal the enemy's budget cost. A Swarm group pays its 3 coins when its last unit
  dies. Difficulty applies a coin-income multiplier (§2.2).
- v1 has no elite variants (§13).

### 9.2 Boss: the Colossus

The Colossus is a huge, slow walker that comes up one lane toward the base. In the neon knights theme
it is a giant walker mech with a glowing core in its chest (§2.1); its art is settled in §9.6.

**Design rules**
- Every big attack has a clear wind-up and a red ground marker showing where it will land, so players can
  dodge by watching the TV.
- Every class has a useful job in the fight, and no class is required.
- It paths toward the base like a Brute. Walls slow it down but can't stop it.

**Attacks by boss wave**

| Wave | Attacks and changes |
|---|---|
| 5 (base form) | **Slam:** a red circle appears in front of it, and the slam lands 1.5 s later, damaging players and structures. **Wall breaker:** deals 3× damage to walls. Only a light stream of Grunts spawns alongside it. |
| 10 | Everything from wave 5, plus **Boulder throw:** targets a tower or the largest group of players, with a marker showing where it will land. Grunt and Swarm escorts walk with it. |
| 15 | Everything from wave 10. **Below 50% HP, final phase:** it moves and attacks faster, each slam sends out a shockwave ring that players must dodge, and it calls in Runners periodically. |

**Stagger meter**
- The Colossus can't be stunned directly. It has a hidden stagger meter.
- All damage fills the meter a little. Warden stuns fill it more, but not so much that the Warden can
  lock the boss down.
- When the meter is full, the Colossus is staggered for about 3 seconds and takes bonus damage. Then the
  meter resets.

**Boss wave rules**
- A large boss HP bar runs along the bottom edge of the TV, where enemies enter (§2.6).
- If the Colossus reaches the base, it attacks the base with heavy hits. This threatens a loss but isn't
  instant.
- **The boss's death ends the wave.** Any remaining enemies collapse.
- **Reward:** every player gets a guaranteed rare upgrade card. The Commander also gets his squad size
  upgrade after waves 5 and 10 (§8).
- Boss HP scales with the player-count multiplier (§9.4).

### 9.3 Wave generation

- **Budget plus pool.** Each wave has hand-authored data:
  - a threat budget
  - the enemy types allowed
  - the lanes open
  - guaranteed spawns, for example the enemy type being introduced that wave, or the boss
- A generator spends the budget on allowed enemy types, using their budget costs, and spreads the groups
  across the open lanes and across the wave's duration.
- **Seeded:** each run has a random seed, so runs vary but any run can be reproduced exactly for
  debugging: the seed reproduces the waves and card offers, and the seed plus a recorded input log
  replays the whole run (§15.3, §15.9).
- Flyers are replaced with ground units when the team has no ranged class (§9).
- The generator should be reusable: Dungeon Crew will use the same system for its rooms.

### 9.4 Wave layout and pacing

| Wave | Introduces | Lanes open |
|---|---|---|
| 1 | Grunts | 1 |
| 2 | Runners | 1 |
| 3 | Swarms | 2 |
| 4 | Brutes | 2 |
| 5 | **Boss**, base form | 2 |
| 6 | Flyers | 2 |
| 7 | Siege | 2 |
| 8 | Hunters | 3 |
| 9 | Mixed | 3 |
| 10 | **Boss**, second attack and escorts | 3 |
| 11–14 | Mixed, rising budget; heavier waves at 12 and 14 | 3 |
| 15 | **Boss**, final phase | 3 |

- **Combat length:** about 60–90 seconds per wave. A wave ends when every enemy is dead, except boss
  waves, which end when the boss dies (§9.2).
- **Spawn warning:** a lane glows on the TV about 3 seconds before a group spawns from it.
- **Target run length:** about 22–27 minutes, including build phases.
- **Player-count scaling:** wave budget and boss HP are multiplied by `0.5 + 0.25 × players`, where
  players counts those connected at the start of the wave (§11.3). That is
  1.0× with 2 players, 1.5× with 4 and 2.0× with 6. Scaling the number of enemies, not their HP, keeps
  each enemy type feeling the same. Difficulty multipliers (§2.2) apply on top.

### 9.5 Debug panel (developer only)

Enabled on the TV build with a URL flag and never shown to players. It can:
- jump to any wave
- spawn any enemy type in any lane
- make players invincible
- add coins
- run the simulation at 2× speed
- show and set the run seed
- show hitboxes, ranges and flow-field arrows
- download a replay of the current run (§15.9)

### 9.6 Enemy art (neon knights, settled)

**Faction rules:**
- Hulls are dark violet-iron, so the whole body reads as enemy before the glow is found. Knights are
  cool gunmetal.
- Emissive is violet only (eyes, cores, seams). Never amber, never red.
- Machine posture: hunched forward, with spikes. Knights stand upright.
- No player colors, rings or names on enemies. Size signals toughness.
- Same production rules as the characters (§2.4) and the perspective rules (§2.5): three-quarter view
  with top faces, mirrored left/right, vector cut-out rigs, ink outline, emissive layer drawn last,
  alignment and layering.
- Every attack has a visible wind-up tell (listed per enemy). Every ground marker is a 0.6 ellipse.

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
Heavy stomp. Wall-hit tell: the furnace flares and the fist rears back before each hit (the Warden's
stun window).

**Bombard (Siege):** a four-legged artillery walker, noticeably bigger than a knight, on thick splayed
legs with wide foot pads; a long mortar barrel angled up and a rack of glowing shells on its back.
Plods to range, plants its legs and lifts the barrel; the muzzle charges violet before each shot, and a
red landing marker shows where the shell will hit.

**Wasp drone (Flyer):** no legs. Hovers above a knight's head, out of hammer reach, with two violet
rotor discs each spinning on its own mast, a stinger cannon and a down-thruster glow under the rear of
the body; its shadow stays on the ground far below. Bobs at a fixed height and never drops toward the
ground, so it always reads as out of melee reach.

**Scrap mites (Swarm):** tiny beetle bugs, about a fifth of a knight's height: a round split shell, a
small head with antennae, six short legs and one violet eye, in packs of 8. Packs are scattered and
uneven (mixed sizes, positions and tilts), never in rows, but every mite faces the same general
direction; none ever faces backward. Animation: each mite skitters on its own jittery path at its own
speed, with small random stops and heading wobble; the pack spreads and bunches as it moves. Never
in step. Randomize each mite's offset, speed and wobble.

**Stalker (Hunter):** a lean machine hound: deep chest, tucked waist, two pointed ears on the back of the
head, a low head thrust forward with twin violet eye slits (the only enemy with two eyes), fins forward
on the back that sweep well back, and a short spiked tail. Fast loping run toward its target player;
wind-up tell: it crouches low, then lunges.
**Target thread:** a faint violet line runs from the Stalker's eyes to the player it's hunting, so the
whole room can see who's targeted and step in.

**Colossus (boss):** about 2.6× a knight's height; tall and top-heavy (the only enemy taller than it is
wide): a wide shoulder yoke, a small sunk head with one violet eye bar, two slab fists hanging low,
thick legs, and a big violet core in an armored chest ring.
**It upgrades each time it returns, at the same size.** Built as one rig with stacking optional parts:
- **Mk I (wave 5):** the bare frame. Plain yoke, smooth slabs, few seams, no spires or spikes.
- **Mk II (wave 10):** adds three exhaust spires on its back, spikes on the yoke and near pauldron,
  knuckle spikes on the ram fist (the boulder-throwing hand), and more lit seams on legs and far fist.
- **Mk III (wave 15):** adds two taller spires (five total; they launch its Runners), horns on the head,
  rear spikes, armored shin and far-fist plates, a studded core ring, and glow seams across the yoke.
- **Final phase (wave 15, below 50% HP):** the chest armor cracks open around a larger exposed core, and
  violet plumes pour from the spires.
**Stagger meter:** the core shows the hidden meter, brightening and pulsing faster as it fills. At full,
the Colossus drops to one knee for about 3 s and the core flares white-violet during the bonus-damage
window.
**Tells:** slam (both fists raise, fist seams flare, red circle, lands 1.5 s later); wall breaker (same
motion, the targeted wall flashes); boulder throw (tears up scrap with the near fist and winds back,
red landing marker); shockwave (violet outline ring rolling out from each final-phase slam); call
Runners (spire plumes surge, then Skitters launch from the spires).
**Walk:** slow, heavy steps with a slight ground shake. The legs trade places every step: the stepping
leg swings forward and is drawn in front, the planted leg drops behind, so the front leg alternates
sides. Swap the legs' draw order at mid-stride, with a slight scale-up on the leg in front.
**Head tracking:** the head turns side to side toward where it's walking or aiming, sliding slightly
toward that side with the eye bar following; before a slam or boulder throw it snaps to face the
target.

## 10. Controls

General rules:
- Phones are held in landscape.
- The controller follows the platform requirements: `touch-action: none`, locked viewport, Wake Lock,
  fullscreen on tap where the browser supports it, reconnect handling, and no vibration
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
- **Action button:** 56 px diameter, centered at offset (−118 px, +20 px) from the main button's center
  (to the left).
- **Spacing rules:**
  - Gap between any two buttons is at least 24 px.
  - No button edge is closer than 64 px to the right edge or 64 px to the bottom edge, so the thumb
    never has to scrunch up to reach a button.
  - All buttons must be at least 56 px in diameter.
- **Hit areas:** each button's touch target extends 8 px beyond its drawn edge. Where targets overlap,
  the nearest button center wins.

**Aimable sticks** (a main attack or super configured as aimed):
- **Tap** (released within 150 ms and inside the dead zone): auto-aims at the nearest valid enemy in
  range.
- **Drag:** aims. The aim line is drawn **on the TV**, not the phone. Maximum drag radius 70 px.
- **Release outside the dead zone:** fires in the aimed direction.
- **Slide back into the dead zone, then release:** cancels.

**Firing:** every attack fires **on release**, once per release.
- Holding an aimed button only shows the aim line on the TV until release.
- Holding a tap-type button does nothing; it fires when released.
- Holding never repeats. A release during the attack's cooldown fires as soon as the cooldown ends.

**Super charge indicator**
- A ring around the super button fills clockwise as the super charges.
- **When full:**
  - The button flashes once, brightening for 150 ms.
  - It then pulses continuously: the ring scales 1.0→1.12 and back at 1.2 Hz until the super is used.
  - The same full state is also shown above the player's character on the TV.

**Status strip** (top center, small): HP and crates carried. Players watch the TV, so the phone shows
only glanceable information.

**Input type per character**

| Character | Main | Super |
|---|---|---|
| Engineer | Aimed | Tap |
| Warden | Tap | Aimed |
| Quartermaster | Aimed | Aimed |
| Commander | Tap | Tap |

**Action button** (context-sensitive). When several situations apply, the first matching row wins:

| Priority | Situation | Action |
|---|---|---|
| 1 | Next to a crate on the ground, with room to carry it | Pick it up |
| 2 | In the base's repair zone, holding a crate | Deliver it to repair the base |
| 3 | On the depot pad, with room to carry another crate | Buy a crate |
| 4 | Engineer or Warden holding a crate | Place last-used structure at feet (before any placement: the class's first structure) |
| 5 | Quartermaster holding crates | Throw one, auto-targeting the nearest Engineer or Warden |
| 6 | Commander (default) | Plant rally flag; tap again to recall the squad |

The button's icon changes to show what it will do. If nothing applies, the button is dimmed.

**Build arc** (Engineer and Warden, holding a crate). Same gesture as the aimed sticks:
- **Tap** the action button: its normal action from the table above (priority 4 places the last-used
  structure).
- **Press and hold** (about 0.4 s) or start dragging: an arc appears above the player's head on the TV,
  with one icon per structure the class can build (left, up and right) and **Give crate** (down).
  Structures that cost more crates than the player carries are dimmed and can't be picked.
- **Drag toward an icon and release:** builds that structure at your feet (and makes it the last-used
  structure), or gives a crate.
- **Release in the dead zone:** cancels.
- **Keep holding on Give:** repeats it, one crate every ~0.3 s.

**Hand over / drop** (Give crate):
- Gives one crate to the nearest teammate in reach who has room. If no one qualifies, drops it at your
  feet.
- Engineer and Warden give through the build arc. Quartermaster and Commander have no structures, so
  for them Give is the only option: holding the action button (about 0.4 s) while carrying a crate gives
  directly, repeating every ~0.3 s while held.
- While giving, the icon switches to show "give" or "drop", and the TV draws a line to the receiver.
- A crate you drop can't be picked back up by you for about 1 s, so a following tap still does its
  normal action instead of grabbing the crate again.
- Works for every class, including the Quartermaster (for example, handing crates to a Commander to
  repair the base).

### 10.2 Build phase
- The movement stick stays the same.
- The right side becomes the **Build tab**: the class's structures, their crate costs, and crates
  carried. Every player has a Build tab and a Shop tab (§10.3). Classes with no structures to build
  (Quartermaster, Commander) see a "No buildings to build" note in place of the structures, and keep the
  stick, crate count, Give crate and Ready, so they can still move and run crates.
- A **Give crate** button next to the crate count follows the same rule as Give in combat
  (§10.1): one crate to the nearest teammate in reach with room, otherwise dropped at your feet. It's on
  both the build menu and the shop tab.
- Tap a structure to show its ghost at your feet on the TV, then tap **Place** or **Cancel**. The ghost
  is red on invalid tiles.
- **Ready-up:** the next wave starts when every player has tapped Ready, or when the 45-second cap runs
  out.

### 10.3 Shop tab (build phase)
The shop shows:
- the team's coin pool
- your private pick-1-of-3 upgrade card
- the team shop (§6.2), with a Request button on every item
- Quartermaster-only items (Quartermaster players only)

### 10.4 Dead
- The phone shows only a respawn countdown.
- The build menu and shop are unavailable until the player respawns.

## 11. Lobby, join and reconnect

Room codes, join flow and reconnect tokens belong to the shared relay and `net-client`, and are reused
from Sunny Side Slam. Everything else in this section is Fort Frenzy game logic running on the host.

### 11.1 Lobby
1. **TV creates a room** and shows the room code plus a QR code linking to the join URL with the code
   filled in.
2. **A phone joins,** enters a name and is assigned a color.
3. **Class select on the phone:** swipeable character cards, each showing name, role, and one line each
   for the main attack and the super. The TV shows the lineup live. Duplicate classes are allowed.
4. **Start:**
   - When every player is Ready, a 3-second countdown starts the run.
   - The first player to join is the **party leader**. They can force-start once at least 2 players are
     Ready.
- Players: 2–6. A seventh phone sees a "Game full" screen.
- **Removing players:** in the lobby, the party leader's phone or the TV can remove any other player
  (as in Sunny Side Slam). Once a run starts, nobody can leave or be removed; a player whose phone drops
  stays in the run, dazed (§11.3).
- **Leader handoff:** if the leader disconnects, leadership passes to the next-earliest joined
  connected player, and doesn't snap back when the original leader returns (as in Sunny Side Slam).
- **TV menus never need a mouse.** The home screen (theme, difficulty, create room) works with keyboard
  or gamepad, with no hover-only interactions. Once a room exists, the party leader's phone drives the
  TV menus: changing theme and difficulty in the lobby, and the end-of-run options (§4).

### 11.2 Mid-run joins and class changes
- **Late joins** are accepted only during the build phase. The new player spawns at the base. A phone
  that joins during combat sees "Joining at the next build phase" until then.
- Enemy scaling and the Flyer composition check are recalculated at the next wave start, from the
  players connected at that moment.
- Players **cannot change class** mid-run.

### 11.3 Player disconnect
- **Identity:** on join, the relay issues a reconnect token, stored on the phone. Reconnecting with the
  token restores the same player slot, and the host keeps that player's full state while they're gone.
  After the relay's token window (30 s), the host still matches a returning phone to its slot by player
  key (§15.6).
- **Dazed state:** while disconnected, the character stops and turns translucent. Enemies can't target
  it. Any crates it was carrying drop on the ground.
- **The slot is held for the whole run.** A disconnected player is never removed mid-run; they stay
  dazed until they reconnect, at any time. Player-count scaling and the Flyer check count only players
  connected at the start of each wave (§9, §9.4).
- **What players see:**
  - On the phone: a "Reconnecting…" overlay.
  - On the TV: a reconnecting icon on that player's nametag.
- **No pausing in v1.** The game auto-pauses only if every player is disconnected at once, or while the
  TV's browser tab is hidden (browsers stop animation frames there anyway).
- **iOS backgrounding:** when the page becomes visible again (`visibilitychange`), the phone reconnects
  immediately with its token.

### 11.4 Input freshness
- **Phones send at a fixed rate,** not only when input changes:
  - 20–30 Hz while any control is touched.
  - A 5 Hz heartbeat while idle.
- **The host treats input older than 250 ms as neutral:** sticks zeroed, buttons released. A dropped
  phone must never leave its character running in the last direction.

### 11.5 Host refresh or crash: resume
- **Snapshot:** the host saves a run snapshot to its browser storage (`localStorage`, so it survives a
  browser crash) at the start of every build phase, and again on every change during the build phase
  (builds, purchases, card picks, crates moved). The snapshot contains:
  - theme, difficulty and run seed
  - wave number
  - base HP and repair purchase count
  - team coins
  - structures and their HP (snares: remaining discharges)
  - every team shop purchase and tier (archers, buildings, squad)
  - each player slot's name, color, class, upgrade cards, current card offer, crates carried and
    reconnect identity (player key and device ID, §15.8), plus the party leader
  - Commander squad size, each soldier's Veterans gains, and the rally flag's position
  - crates on the ground
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

- 4 characters (one per class), each with one passive.
- 64 upgrade cards (§6.1) and the team shop (§6.2).
- 1 map with 3 lanes.
- 1 theme: neon knights (§2.1).
- 3 difficulty levels (§2.2).
- 2–6 players.
- All 7 enemy types plus 1 boss that returns at waves 5, 10 and 15.
- The developer debug panel (§9.5).
- Audio: a small set of sound effects (for example the base alarm, hits, boss wind-ups and purchases).
  No music.
- Everything in §13 is out of scope for v1.

## 13. Later (v2+)

Ideas deferred from v1. Build v1 so these can be added without rewrites.

| Item | Notes | v1 prep |
|---|---|---|
| Pillow Fort theme | Second theme pack: a kid's bedroom at lights-out, where toys invade the pillow fort. Lanes are the closet, under the bed and the hallway door. Default difficulty: Easy. Draft mapping: base = pillow fort; Engineer = foam-dart kid (dart turret, water-balloon launcher); Warden = pillow-smash kid (couch-cushion walls, scattered toy bricks as snares); Quartermaster = big sibling with a bubble wand (snack-pack crates); Commander = kid general with toy soldiers; enemies are wind-up soldiers, RC cars, possessed teddy bears, toy catapults, paper airplanes, dust bunnies and jack-in-the-boxes; the Colossus is a giant wind-up robot | Theme-agnostic build (§2.1): no gameplay changes needed |
| Selectable passives | 3 options per class, chosen at class select (list in §8) | Passives are pluggable modules |
| Dynamic camera | Zooms and pans to keep all players in view (Smash Bros. style) | Render through a camera abstraction, even though v1 keeps it fixed |
| More characters per class | 2–3 per class | Characters are defined by config: attacks, super, passive, build kit |
| Endless mode | Survive as long as possible, high score | None needed |
| More maps, each with its own boss | New maps, each with its own boss. The first candidates are the Warlord (stays back behind a shield and summons enemies; killing the summoners drops the shield) and the Burrower (tunnels and resurfaces in a different lane) | Map layout and boss are defined by config, and boss behavior is its own module rather than hard-coded to the Colossus |
| Card reroll | Reroll your 3 offered cards, paid from team coins | Offers are generated by one seeded function, so a reroll just calls it again |
| Critical hits | Crit chance and crit damage cards | Damage goes through one function, so crit is one extra step there |
| Solo mode (likely v3 or v4) | One character of each class. The player switches "focus" between them, controlling the focused character with its full actions and abilities; bots control the other three. The build phase is longer, because one player makes decisions for all four characters | Characters read input through an input-source interface (phone controller now, bot later), never directly from the network |
| Elite enemy variants | Modifiers such as armored or fast | Enemy stats come from config, so a variant is a stat override |
| Music | v1 ships sound effects only (§12) | Theme packs carry an audio map (§15.4), so music is more entries plus a player |
| Enemy back views | Back views for the common walkers (§2.4) | Rig views are looked up per rig from data, so a new view is data, not code (§15.2) |

## 14. Open / under discussion

1. **Final name:** "Fort Frenzy" is the working title. Before any public or Steam release, check it
   against Steam, itch.io and the USPTO trademark database. (The subdomain is set in §2.3.)
   ("Stronghold" was dropped because of Firefly Studios' *Stronghold* series.)
2. **Numbers to set in playtesting:** player HP, character damage and super charge rates, structure costs
   and HP, snare discharges and slow strength (no structure may cost more than the non-Quartermaster
   carry cap, §6), crate prices, the per-crate slowdown curve, base HP and the repair amount per crate,
   aggro and leash radii (§9), and the breaker field's wall cost (§15.5). These go in config, and the
   starting values are picked during implementation.
   - **Main-attack cooldowns start at 0.4 s or more.** Attacks fire once per release (§10.1), so Haste
     only matters while the cooldown is longer than a fast tap.
3. **Passive regeneration (balance watch):** HP carries over between waves and nothing heals players
   except Field Medic and the Quartermaster's super (§5, §8). If playtests show players dying too often,
   add a slow passive regeneration during combat, boosted inside the Field Medic aura.
4. **Sound effects:** source the v1 set (§12). Candidates: Kenney.nl (CC0 packs: Sci-fi Sounds, Impact
   Sounds, Interface Sounds), jsfxr/sfxr.me (generated, owned outright), Sonniss GDC bundles
   (royalty-free) and freesound.org (CC0 filter only). Every file gets a license entry (§15.10).
5. **Art still to come:** the character, enemy and structure SVG parts with their rig JSON, the pulse
   turret aim frames (§7.2), and three icons: `act-give`, `act-drop` and `net-charges` (§2.6). The rest
   of the icon set has landed (`fort-frenzy-icons.zip`, §15.10). Until the art lands, the build uses
   the dev-only fallback shapes (§15.2) and text labels for missing icons.
6. **Map layout:** the v1 map (§15.2: 36 × 24 tiles, lane entries bottom-center, left and right) is a
   starting layout to tune in playtesting. The map shrank from 38 × 28 to give the bottom-edge boss bar
   (§2.6) its own band inside the TV-safe margin; revisit if it plays cramped.

---

## 15. Technical design

Decisions and contracts for building §1–§14. Type sketches are TypeScript and indicative: the build
freezes the exact shapes in the contract files named in §15.11. Repo-wide rules are in `PLATFORM.md`;
the relay protocol is in `apps/relay/SPEC.md`. Where this section says "as in Sunny Side", the pattern is
in `apps/sunny-side` (its `SPEC.md` and `BUILD_PLAN.md` §8).

### 15.1 Repo and packages

- **App:** `apps/fort-frenzy`, package `@pcg/fort-frenzy`, game ID `fort-frenzy`, domain
  `fort-frenzy.fostercurtis.dev` (§2.3). Same layout as Sunny Side: `index.html` (TV, `data-entry="host"`)
  and `play.html` (phone, `data-entry="controller"`) as separate Vite entries.
- **Relay and `@pcg/net-client`:** reused unchanged. No protocol change is needed (§15.6).
- **New shared packages, extracted now** (this is the second game, `PLATFORM.md` §4). Sunny Side moves
  onto both in the same milestone, behavior-preserving, gated by its existing `check:sunny-side` and
  `e2e:sunny-side`. Both ship as TS source like `net-client` and import nothing from `apps/**`.
  - **`@pcg/controller-kit`** (DOM only, never Phaser):
    - platform: Wake Lock, **`fullscreenOnTap()`** (every tap requests fullscreen while not fullscreen,
      so it also re-enters after an exit; a silent no-op where unsupported, e.g. iPhone Safari),
      landscape lock and the rotate overlay, `touch-action`/viewport setup, safe-area helpers
    - an app shell that wires the platform pieces on by default, the overlays (reconnecting, host away,
      rotate) and a screen router that reuses DOM between screens in the same group
    - input widgets: the floating joystick (radius, dead zone, idle opacity and ease-back as
      parameters), the hold button, the nearest-center router with hit slop, hold-to-confirm, the
      **aimed-button gesture** and the **radial-drag gesture** (§15.7)
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
- **App layout:**

```
apps/fort-frenzy/
  index.html  play.html  vite.config.ts  vercel.json  playwright.config.ts
  SPEC.md  BUILD_PLAN.md
  art/<theme>/          SVG part sources, rigs/<rig>.json (§15.2), icons/ (§2.6), e.g. art/neon-knights/
  audio/<theme>/        .mp3 sources
  assets/LICENSES.json  one entry per asset or pack (§15.10)
  scripts/              build-atlases.ts, replay.ts (Node)
  src/
    shared/       messages.ts (protocol), ids.ts, theme.ts (brand.css mirror), relayUrl
    content/      gameplay config as TS data (§15.4) + types.ts
    themes/<id>/  shared.ts (phones + TV), host.ts (TV only)
    host/
      sim/        deterministic run simulation: world, systems, step order, run phases, economy
      systems/    extraction-ready systems (above)
      party/      extraction-ready lobby/party (above)
      net/        relay wiring, input sources, phone state sync, intent routing
      render/     Phaser scenes, camera, layers, rigs, bloom, effects
      audio/      SFX player
      debug/      debug panel (§9.5), replay recorder
    controller/   phone app (DOM)
    styles/       brand.css (brand kit)
```

- **Rule: all theme art lives under `art/<theme>/`** (neon knights: `art/neon-knights/`), icons included,
  so later themes sit beside it. Art delivered anywhere else (for example the icon set at `art/icons/`)
  is moved there by the build, and nothing reads art from outside `art/<theme>/`.
- **Lint boundaries** (root `eslint.config.js`; a shared-config change, so it runs the full gate):
  - `src/host/{sim,systems,party}/**`: no `phaser`, no `@pcg/net-client`, no `src/themes/**`, no DOM.
  - `src/host/{sim,systems}/**`: no `Math.random`, `Date.now`, `performance.now` or `new Date()`
    (determinism, §15.3).
  - `src/host/{systems,party}/**`: no imports from `src/content`, `src/host/sim` or other app folders.
  - `src/controller/**`: the existing rule (no Phaser, nothing under `host/`).

### 15.2 Engine and rendering

- **Phaser 4.2.x** renders only; it never owns game state (as in Sunny Side). **No physics engine:** the
  sim moves bodies kinematically, with circle hitboxes, a uniform spatial hash for "who's near me"
  queries and soft separation, collision against blocking structure tiles, and knockback as a velocity
  impulse with damping.
- **Canvas:** 1920 × 1080 logical, `Scale.FIT`.
- **Screen layout** (W = 48 px tile width, depth 28.8 px per §2.5):

Everything sits inside the brand's 96 px TV-safe margin (`--space-tv-safe`) on all four sides.

| Band | Screen y | Holds (§2.6) |
|---|---|---|
| Top margin | 0–96 | nothing (TV-safe) |
| Top HUD | 96–136 | wave and phase (left), base HP bar centered directly above the Citadel, team coins (right); "Citadel under attack" under the bar at low HP |
| Headroom | 136–216 | the Citadel's keep, core and smoke plumes rise into it (§3.6) |
| Playfield | 216–907 | 36 × 24 sim tiles, x 96–1824; during the build phase, ready status and the wishlist overlay its right side |
| Bottom HUD | 907–984 | boss bar (boss waves) or the next-wave preview (build phase); purchase announcements stack bottom-left |
| Bottom margin | 984–1080 | nothing (TV-safe) |

- **Map v1** (config, §15.4): 36 × 24 tiles. Citadel footprint cols 16–19, rows 0–1; repair zone cols
  17–18, row 2 (in front of the gate); Armory pad col 22, row 1. Lane entries: bottom-center (cols
  17–18, row 23; open from wave 1), left (col 0, rows 11–12; wave 3) and right (col 35, rows 11–12;
  wave 8). Enemies spawn just outside the edge and walk in; the lane-warning band (§2.6) glows on that
  screen edge. A starting layout to tune (§14).
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

- **Layers**, bottom to top:
  1. ground: map tiles, Armory pad, repair zone
  2. ground overlays: red danger markers, shock nets, structure base plates, player rings, Field Medic
     circle, range previews, AoE rings (all 0.6 ellipses of sim circles)
  3. **world**, one y-sorted layer: structures, the Citadel, the Armory kiosk, units, flyers and arcing
     projectiles. Sort key = foot point; flyers and arcing projectiles sort by their shadow; multi-tile
     structures by their footprint's front edge.
  4. effects: hit sparks, tracers, muzzle flashes, plumes
  5. world UI: nametags and HP bars (flipping below near the top edge, §2.1), aim lines, the build arc,
     the super-ready badge, the Stalker target thread
  6. HUD (screen space)
- **What's Phaser and what's DOM:** layers 1–5 are Phaser, since world UI moves with entities every
  frame and needs interpolation and y-sorting. The **HUD and the full-screen TV screens** (home, lobby,
  summary) are a **DOM overlay** over the canvas, scaled with it to the 1920 × 1080 logical size. They
  reuse `brand.css` (chamfers, `drop-shadow` glow, fonts) and the same SVG icon badges as the phones,
  with crisp text; the bloom doesn't touch them.
- **Bloom:** one threshold bloom on the composited world (layers 1–4) at half resolution. The threshold
  catches amber `#e8a33d` and violet `#8f6bff` and never the gunmetal and violet-iron shades (§2.5). SVG
  glow filters are stripped at rasterize time (§15.10), so nothing double-glows.
- **Rigs** (§2.4): each character, enemy and animated structure is a rig. Its parts are atlas frames.
  Animation clips live in code as keyframe tracks per part; the rig JSON says where parts are.

```ts
type ViewId = 'side' | 'front' | 'back';
interface RigDef {
  id: string;                                // 'warden', 'colossus', 'mortar_tower'
  views: Partial<Record<ViewId, RigView | RigPoses>>; // enemies: side only in v1; lookup per rig (§13)
  optional?: Record<string, string[]>;       // e.g. { mk2: [...parts], mk3: [...parts] }
}
/** A view with several part sets (the Ranger: 'stand' and 'ready', §2.4); others have one. */
interface RigPoses { poses: Record<string, RigView>; defaultPose: string }
interface RigView {
  foot: [number, number];                    // anchor, sprite units
  parts: Record<string, {
    frame: string;                           // '<rig>/<view>/<part>'
    pivot: [number, number];
    parent?: string; at: [number, number];   // attach point on the parent
    tint?: 'player';                         // color part, flag cloth, footman plume
    emissive?: boolean;                      // drawn last; code can pulse/brighten it
  }>;
  order: string[];                           // back-to-front for this view (and pose)
  attach?: Record<string, [number, number]>; // muzzle, flag, weapon tip, nametag
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
- **Frame names:** rig parts `<rig>/<view>/<part>`, or `<rig>/<view>/<pose>/<part>` for posed rigs
  (`ranger/front/ready/bow`); aim-framed structures `<id>/<loadout-or-tier>/<aim>`
  (sentry aims `l dl c dr r`, loadouts `base dmg rng max`; pulse turret 8 aims × base/II/III, plus band
  overlays); Citadel damage overlays `citadel/dmg-cracks`, `citadel/dmg-fire`, `citadel/dmg-smoke`
  (atlas frames, since every crack is hand-drawn).
- **Facing and aim snapping:** side views mirror for left. Knights and footmen take the view from the
  stronger axis of aim (while attacking) or movement, and switch axis only when the other axis is 15%
  stronger. Aim frames switch only once the target angle is 8° past a sector boundary. The mortar tube
  rotates in code about its dome center; projectiles rotate to their projected screen direction; Wasp
  drones mirror only.
- **Pooling:** render-side only. Phaser objects for projectiles, effects, damage numbers and Swarm units
  come from per-kind pools; sim entities are plain objects, not pooled.
- **Interpolation:** the renderer draws positions lerped between the last two sim steps (as in Sunny
  Side), keyed by entity id; spawned entities draw at their current position, removed ones disappear.
- **Missing frames:** a dev-only fallback draws a labeled shape for the ID (sized from its hitbox), so a
  missing asset never breaks a build. Production builds fail the atlas check instead (§15.10).
- **Performance budget**, measured by an early performance test at peak load (6 knights, 30 footmen,
  150 enemies, 100 projectiles, 60 structures; about 1,300 rig parts in one atlas) on an integrated GPU
  laptop (Intel Iris Xe class) at 1080p: whole frame ≤ 16.7 ms, one sim step ≤ 2 ms, bloom ≤ 2 ms.

### 15.3 Simulation

- **Loop:** fixed 60 Hz steps with an accumulator, a catch-up cap and render interpolation, from
  `@pcg/game-kit` (as in Sunny Side). The debug 2× speed runs two steps per frame slot.
- **One deterministic sim owns the whole run** from the countdown to the summary: phases and timers,
  combat, economy, shop, cards, building and scaling. The lobby is outside it (`party/`); a run starts
  from `RunStart { seed, settings, slots }`. Everything that changes run state enters as either an
  **input sample** or a **command** at the start of a step, which is what makes replays exact.
- **Entity model: ECS-lite.** Plain typed arrays per entity kind, and pure system functions run in a
  fixed order. No ECS library, no class hierarchy.

```ts
type EntityId = number;                      // incrementing counter, never reused
interface Body { id: EntityId; x: number; y: number; vx: number; vy: number; r: number; z?: number }
interface Unit extends Body {
  hp: number; maxHp: number; facing: number;
  mods: Modifier[];                          // cards, passives (attach order)
  effects: StatusEffect[];
  stats: StatBlock;                          // recomputed when mods/effects change
}
interface World {
  tick: number; phase: Phase; wave: number;
  players: PlayerEnt[]; soldiers: SoldierEnt[]; enemies: EnemyEnt[];
  structures: StructureEnt[]; projectiles: ProjectileEnt[]; cratePiles: CratePile[];
  markers: DangerMarker[];                   // telegraphs: shape, position, landsAtTick, payload
  grid: TileGrid; fields: FlowFields; spatial: SpatialHash;
  base: BaseState; team: TeamState;          // coins, shop tiers, wishlist, scaling
  events: SimEvent[];                        // cleared each step; render, audio and phones read them
}
type Phase = 'countdown' | 'build' | 'combat' | 'victory' | 'defeat' | 'summary';
```

- **Step order:**
  1. apply this step's commands (logged order)
  2. sample every slot's `InputSource`; diff press counters into fire/tap/commit events
  3. players: movement (carry slowdown), attacks and supers, action button, build arc, crates
  4. AI: enemies (path, aggro leash, siege, hunter, flyer, runner), soldiers, the boss module
  5. integrate movement, soft separation, structure collision
  6. projectiles and area attacks → `applyDamage`
  7. status effects, `onTick` hooks, auras (combat only)
  8. deaths: hooks, coins, crate drops; destroyed blockers rebuild the flow fields
  9. wave spawner (spawn warnings 3 s ahead)
  10. phase checks: wave cleared, boss dead, base destroyed, build timer
- **Determinism rules:** timers are whole steps; all randomness comes from seeded streams; no wall clock
  in the sim (lint, §15.1); arrays iterate in id order and every sort tie-breaks by id. Replays are
  exact on the same JS engine (`Math.sin` and similar may differ between browsers). A **state hash**
  (FNV-1a over a canonical serialization of `World`) checks determinism in tests and replays.
- **RNG** (`@pcg/game-kit`): a small seeded PRNG plus named streams derived from (seed, label), so one
  stream's use never shifts another's. Streams: `waves:<n>`, `cards:<wave>:<slot>`, `combat:<wave>` (all
  in-combat randomness, including Scrap-mite jitter, which runs in the sim so hitboxes match the art).

```ts
interface Rng { next(): number; int(lo: number, hi: number): number; pick<T>(xs: readonly T[]): T }
function rngStream(seed: number, label: string): Rng; // hash(seed, label) → sfc32-style generator
```

- **Input sources** (§13 solo mode): characters only ever read an `InputSource`.

```ts
interface PlayerInput {
  move: Vec2; mainAim: Vec2; superAim: Vec2;     // −1..1; aim 0,0 on a fire = auto-aim
  mainAiming: boolean; superAiming: boolean; radialOpen: boolean;
  radialSlot: -1 | 0 | 1 | 2 | 3;                 // left, up, right, down (Give)
  mainFires: number; superFires: number; actionTaps: number; radialCommits: number; // counters
}
interface InputSource { sample(tick: number): PlayerInput }
// PhoneInputSource (§15.6 staleness), AutopilotInputSource (§15.9), ReplayInputSource (§15.9)
```

  The first sample after a (re)connect only baselines the counters; a counter going backwards (phone
  reload) re-baselines without firing (as in Sunny Side).
- **Modifiers and hooks:** one interface for passives, cards, status effects, auras and boss behaviors.
  Hooks run per entity in attach order, then status effects in application order.

```ts
interface Modifier {
  id: string;                                    // 'card:fire_arrows', 'passive:mason', 'effect:burn'
  stats?: StatMod[];
  hooks?: Partial<Hooks>;
}
interface Hooks {
  onTick(ctx: SimCtx, self: Unit): void;
  onAttack(ctx: SimCtx, self: Unit, atk: AttackEvent): void;          // Volley, Piercing Shot
  modifyOutgoing(ctx: SimCtx, self: Unit, d: DamageCalc): void;       // pipeline stage 2
  modifyIncoming(ctx: SimCtx, self: Unit, d: DamageCalc): void;       // pipeline stage 4
  beforeEffect(ctx: SimCtx, self: Unit, e: EffectApply): boolean;     // false = immune (Unshakable)
  onDamageDealt(ctx: SimCtx, self: Unit, r: DamageResult): void;
  onDamageTaken(ctx: SimCtx, self: Unit, r: DamageResult): void;
  onHeal(ctx: SimCtx, self: Unit, h: HealResult): void;               // Overflow, super charge
  onKill(ctx: SimCtx, self: Unit, victim: Unit): void;
  onDeath(ctx: SimCtx, self: Unit, killer: Unit | null): void;        // Wildfire, Plague (on the effect)
  onPhase(ctx: SimCtx, self: Unit, phase: Phase): void;               // Veterans
}
// Modules are registered by id and built from config params:
function defineModule<P>(id: string, make: (params: P) => Modifier): ModuleDef<P>;
```

- **Stats:** `value = base × (1 + clamp(Σ addPct, min, cap)) + Σ add` (§6.1: stacks add, never multiply).
  Caps come from config (range, movement speed and damage reduction: +40%).
- **Status effects:** one timed-effect system (§6.1). Each effect carries a source, a strength, a
  duration in steps and a stacking policy. **Auras** (Field Medic, Bodyguard, Lead from the Front,
  Vanguard, morale) are short effects re-applied each step to units in range, with `refresh`.

```ts
interface EffectDef { id: EffectId; stacking: 'refresh' | 'strongest' | 'stack'; maxStacks?: number;
  tickEveryMs?: number; modifier: (strength: number) => Modifier }
interface StatusEffect { def: EffectId; strength: number; remaining: number; stacks: number;
  source: EntityId | null }
// v1 effects: burn, poison, stun, slow (strongest), morale, tower_defense, shield, aura_* (refresh)
```

- **Damage pipeline:** every hit goes through one function (§13 crits).

```ts
interface DamageCalc { source: EntityId | null; target: EntityId; amount: number;
  kind: 'melee' | 'ranged' | 'area' | 'dot' | 'contact' | 'shell'; tags: readonly string[] }
function applyDamage(ctx: SimCtx, calc: DamageCalc): DamageResult;
// 1 base → 2 attacker modifyOutgoing (Might, Giant Slayer, Skyhunter, Steady Aim, morale, vs-wall
// multipliers) → 3 crit (no-op in v1) → 4 target modifyIncoming (Toughness, Bodyguard, Vanguard,
// tower defense, base armor) → 5 shields (Overflow) → 6 HP → 7 events: super charge, boss stagger,
// run stats, onDamageDealt/Taken, death hooks, coins
```

  Difficulty and player-count multipliers are baked into stats at spawn, not applied per hit.
- **Boss behaviors** are modules, so new bosses (§13) don't touch the Colossus.

```ts
interface BossBehavior {
  id: string;                                    // 'colossus'
  init(ctx: SimCtx, boss: EnemyEnt, variant: { wave: number; mk: 1 | 2 | 3 }): void;
  tick(ctx: SimCtx, boss: EnemyEnt): void;       // picks attacks, emits DangerMarkers with wind-ups
  onDamage?(ctx: SimCtx, boss: EnemyEnt, r: DamageResult): void;  // stagger meter
}
```

### 15.4 Data and config

- **Format: TS data modules** in `src/content/`, one file per domain, typed with `satisfies` against
  `src/content/types.ts`. All tuning numbers live here (§14). Units: distances in tiles, speeds in
  tiles/s, times in ms (converted to steps at load), damage and HP as numbers.
- **Validation test** (Vitest): every referenced id exists (cards, combo prerequisites, favored enemies,
  wave pools, guaranteed spawns, shop targets, modules); no structure costs more than the
  non-Quartermaster carry cap (§6); every class's build list has at most 3 entries (the build arc);
  each wave's budget covers its guaranteed spawns.

```ts
interface CharacterDef {
  id: ClassId; hp: number; moveSpeed: number; radius: number;
  main: AttackDef; super: AttackDef & { effects?: EffectApply[]; heal?: number };
  input: { main: 'aimed' | 'tap'; super: 'aimed' | 'tap' };          // §10.1 table
  superChargeRate: number; passive: ModuleRef;
  build: StructureId[];                                               // arc order: left, up, right
  carryCap: number; carrySlowdown: number[];                          // slowdown per crate count
  squad?: { size: number[]; soldier: UnitStats; followRadius: number };
}
interface AttackDef { shape: 'projectile' | 'arc' | 'cone' | 'circle'; damage: number; range: number;
  cooldownMs: number; windupMs?: number; arcDeg?: number; count?: number; spreadDeg?: number;
  speed?: number; hitsFlyers: boolean; blockedBy?: ('wall' | 'tower')[]; knockback?: number }
interface EnemyDef { id: EnemyId; hp: number; speed: number; radius: number; flying: boolean;
  budget: number; groupSize?: number; ai: 'path' | 'runner' | 'siege' | 'hunter' | 'flyer' | 'boss';
  field: 'ground' | 'breaker' | 'none'; attack: AttackDef;
  vsStructure?: Partial<Record<StructureId | 'base', number>>;        // Brute 2× walls, Colossus 3×
  aggro?: { radius: number; leash: number }; slowResist?: number; boss?: ModuleRef }
interface StructureDef { id: StructureId; cost: number; hp: number | null; pathCost: number;
  blocksProjectiles: boolean; attack?: AttackDef; attachesTo?: StructureId[];
  discharges?: number; rearmMs?: number; slow?: EffectApply }         // snare
interface CardDef { id: CardId; owner: ClassId | 'common'; tier: 'common' | 'rare' | 'combo';
  unique?: boolean; requires?: [CardId, CardId]; favoredEnemy?: EnemyId; requiresClass?: ClassId;
  stats?: StatMod[]; module?: ModuleRef; perClass?: Partial<Record<ClassId, StatMod[]>> }
interface ShopItemDef { id: ShopItemId; tiers: { price: number; effect: UpgradeEffect }[];
  visibleIf?: Condition; qmOnly?: boolean; afterRegularWaveOnly?: boolean; holdToConfirm?: boolean;
  repeatable?: boolean }                                              // crates, repair
interface WaveDef { n: number; budget: number; allowed: EnemyId[]; lanes: LaneId[];
  guaranteed: { enemy: EnemyId; count: number; lane?: LaneId }[]; durationMs: number;
  boss?: { id: EnemyId; mk: 1 | 2 | 3 } }
interface DifficultyDef { id: 'easy' | 'normal' | 'hard'; budget: number; enemyHp: number;
  enemyDamage: number; baseHp: number; coinIncome: number }
interface ScalingDef { base: 0.5; perPlayer: 0.25 }                   // §9.4
interface MapDef { id: string; cols: number; rows: number; tiles: string[];  // ASCII rows
  legend: Record<string, TileKind>; lanes: Record<LaneId, { entry: Tile[]; spawn: Vec2 }> }
type ModuleRef = { module: string; params?: Record<string, number | string | boolean> };
```

- **Generic system signatures** (extraction-ready, §15.1; Fort Frenzy passes its content in):

```ts
// systems/waves: spends a budget on a pool and spreads groups over lanes and time (§9.3)
function generateWave<E extends string>(input: {
  budget: number; pool: { id: E; cost: number; groupSize?: number }[];
  guaranteed: { id: E; count: number; lane?: string }[]; lanes: string[]; durationMs: number;
  substitute?: Partial<Record<E, E[]>>; rng: Rng }): { atMs: number; lane: string; id: E; count: number }[];
// systems/cards: one pure function, so a v2 reroll is just another call (§13)
function pickOffer<C extends { id: string }>(input: {
  pool: readonly C[]; eligible: (c: C) => boolean; isRare: (c: C) => boolean;
  rareChance: number; guaranteedRare: boolean; size: number; rng: Rng }): C[];
```

- **Theme packs** (§2.1) hold presentation only. The sim can't import `src/themes/**` (lint), and the
  types carry no gameplay fields; a test fails if a theme object has keys outside its type.

```ts
interface ThemeShared {                          // phones and TV
  id: ThemeId; defaultDifficulty: DifficultyId;
  names: Record<ClassId | EnemyId | StructureId | ShopItemId | CardId | 'base' | 'faction', string>;
  flavor?: Partial<Record<string, string>>;      // class card lines, card text
  icons: IconSprite;                             // art/<theme>/icons/*.svg as one inline SVG sprite
  portraits: Record<ClassId, { body: string; color: string }>; // front-view images (class select)
}
interface ThemeHost {                            // TV only
  atlases: AtlasRef[]; rigs: Record<string, RigDef>; clips: Record<string, Clip>;
  sfx: Partial<Record<SfxId, string>>;           // music joins this map in v2 (§13)
  map: { ground: string; decor?: string[] };
}
```

- **Icons** (`art/<theme>/icons/`, 24-unit SVG glyphs with `.glyph`, ink and `.glow` layers; usage rules
  in its `README.md`): phones get them as one inline SVG sprite (a `<symbol>` per icon, built at build
  time), so `.glow` takes the CSS `drop-shadow` and badge tiles stay crisp. The TV's DOM HUD (§15.2)
  uses the same sprite; world UI that Phaser draws (the build arc, the super-ready badge) uses the same
  files rasterized into the TV atlas, where the bloom picks up the amber. Theme packs replace the files
  under the same names. A missing icon falls back to a text label.
- **Class portraits:** phones never load the TV atlases, but class select and the lineup show each
  knight's front view in the player's color (§2.6). The atlas script renders, per class, the front-view
  rest pose as two images: the body, and the color part alone as a mask that CSS tints with the
  player's color. They're lazy-loaded images, outside the phone's JS budget (§15.7).

### 15.5 Pathfinding

- **Flow fields** over the 36 × 24 grid, built with Dijkstra (a breadth-first search that weighs tile
  costs) outward from the tiles next to the Citadel. Each tile stores its distance and the neighbor to
  step to next. A rebuild takes well under 1 ms and runs in the same step a blocking structure is
  placed or destroyed.
- **Tile costs:** open 1; snare 1 (no rebuild, §7.1); wall and tower: a high configurable cost (enemies
  detour unless the detour is longer); terrain outside the map or marked blocked: impassable.
  Structures always have a finite cost, so a route always exists, and "break through" (§7) is simply an
  enemy attacking the blocking structure on its next tile.
- **Fields:** `ground` (most walkers); `breaker` (Brutes and the Colossus: walls cheap, so they smash
  through, §7); one per hunted player (Hunters), rebuilt when that player moves to a new tile. Flyers
  ignore fields and steer straight at their target.
- **Steering:** an enemy steers toward its next tile's center, blended with the neighbors' directions
  so movement doesn't zigzag, plus soft separation from nearby units. Units never hard-block each other.
- **Behavior per `ai`:** `path` follows its field and attacks whatever blocks it or the base; `runner`
  bursts on base contact; `siege` stops once the base or a tower is in range and shells it; `hunter`
  follows its target's field; `flyer` flies straight; aggro-leash enemies (§9) leave the path for a
  player in aggro radius and return past the leash.

```ts
interface FlowField { cols: number; rows: number; dist: Float32Array; next: Int16Array } // −1 = goal
function buildField(grid: TileGrid, cost: (tile: number) => number, goals: readonly number[]): FlowField;
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

```ts
export const GAME_ID = 'fort-frenzy';
export const PROTOCOL_VERSION = 1;

/** Phone → host input (§10.1, §11.4). Sticks and aims are ints −100..100, dead zone applied on the phone. */
export type InputTuple = [
  moveX: number, moveY: number,
  mainX: number, mainY: number,       // aim at the last release; 0,0 with a fire = tap = auto-aim
  superX: number, superY: number,
  flags: number,                      // 1 main aiming (TV aim line), 2 super aiming, 4 radial open
  mainFires: number, superFires: number, actionTaps: number, radialCommits: number, // counters
  radialSlot: number,                 // −1 none, 0 left, 1 up, 2 right, 3 down (Give)
];
```

- **Gestures are resolved on the phone** (tap, drag or cancel; radial slot or cancel), which has the
  touch timing and pixel distances. A release goes out at once, so a fire and its aim arrive together.
- **Send rate:** a fixed 30 Hz while any control is touched, 5 Hz while idle, plus every button edge
  immediately. (Sunny Side sends sticks only on change, which a held-still thumb would starve under the
  250 ms rule.)
- **Staleness (§11.4):** the host stamps each input with its receive time. Older than 250 ms, the
  `PhoneInputSource` returns zero sticks and cleared flags; counters still apply when they arrive.
- **Menu actions are intents,** discrete messages with a `seq`, answered by `ack`. Movement and combat
  stay pure input state (`PLATFORM.md` §2's rule covers movement; Sunny Side already sends discrete UI
  messages). Intents that change run state become sim commands (§15.3) and are logged for replays.

```ts
export type ControllerMsg =
  | InputTuple
  | { t: 'hello'; proto: number; deviceId: string }
  | { t: 'intent'; seq: number; intent: Intent };

export type Intent =
  | { k: 'name'; name: string }                       // ≤ 10 chars; color is auto-assigned
  | { k: 'class'; classId: ClassId }
  | { k: 'ready'; ready: boolean }
  | { k: 'leader'; action: 'start' | 'resume' | 'newRun' }
  | { k: 'leader'; action: 'theme'; theme: ThemeId }
  | { k: 'leader'; action: 'difficulty'; difficulty: DifficultyId }
  | { k: 'leader'; action: 'remove'; playerId: string }           // lobby only
  | { k: 'leader'; action: 'end'; option: 'again' | 'classes' | 'home' }
  | { k: 'build'; action: 'select'; structure: StructureId }       // ghost at feet (§10.2)
  | { k: 'build'; action: 'place' | 'cancel' }
  | { k: 'buy'; item: ShopItemId }
  | { k: 'request'; item: ShopItemId; on: boolean }
  | { k: 'card'; card: CardId }
  | { k: 'give' }                                                  // §10.2 Give crate button
  | { k: 'claim'; slot: number };                                  // resume into a new room

export type AckReason = 'coins' | 'crates' | 'cap' | 'phase' | 'invalid' | 'notLeader' | 'taken';

export type HostMsg =
  | { t: 'team'; rev: number; team: TeamView }        // broadcast on change, ≤ 5 Hz
  | { t: 'me'; rev: number; me: MeView }              // per phone on change, ≤ 10 Hz
  | { t: 'ack'; seq: number; ok: boolean; reason?: AckReason }
  | { t: 'outdated'; proto: number };
```

- **State sync:** `team` and `me` are full snapshots with an increasing `rev` (the phone drops older
  ones), never diffs, so one message of each kind fully restores a phone after a reconnect. The host
  sends both on every `hello` and rejoin.

```ts
interface TeamView {
  phase: 'lobby' | 'countdown' | 'build' | 'combat' | 'summary' | 'restoring';
  wave: number; buildEndsInMs: number | null; coins: number; baseHp: number; baseMaxHp: number;
  theme: ThemeId; difficulty: DifficultyId; leaderId: string | null;
  roster: { playerId: string; name: string; color: PlayerColorId; classId: ClassId | null;
    ready: boolean; connected: boolean }[];
  shop: { id: ShopItemId; tier: number; maxTier: number; price: number | null; visible: boolean;
    qmOnly: boolean; holdToConfirm: boolean }[];
  wishlist: { item: ShopItemId; by: string }[];
  nextWave: { enemies: { id: EnemyId; count: number }[]; boss: boolean } | null;  // §4
  summary: RunSummary | null;
}
interface MeView {
  screen: 'name' | 'lobby' | 'waiting' | 'full' | 'combat' | 'build' | 'dead' | 'summary'
    | 'restoring' | 'claim';
  slot: number | null; name: string; color: PlayerColorId | null; classId: ClassId | null;
  isLeader: boolean; ready: boolean;
  hp: number; maxHp: number; crates: number; carryCap: number;
  superCharge: number; superReady: boolean;                     // 0..1 ring; full state (§10.1)
  action: 'pickup' | 'deliver' | 'buy' | 'place' | 'throw' | 'flag' | 'recall' | 'none'; // act-* ids
  give: 'give' | 'drop' | null;                                 // what Give does now (icon swap, §10.1)
  arc: { slots: (StructureId | 'give' | null)[]; enabled: boolean[] } | null;  // left, up, right, down
  buildKit: StructureId[];                                      // empty = "No buildings to build" (§10.2)
  respawnMs: number | null;
  cards: { offer: CardId[] | null; picked: CardId | null; owned: { id: CardId; n: number }[] };
  build: { selected: StructureId | null; valid: boolean | null } | null;
  claim: { slot: number; name: string; classId: ClassId }[] | null;
}
```

- **Lobby and presence** (`party/`): colors auto-assigned in brand order (cobalt, jade, sky, bone, rose,
  forest; §2.3); first joiner leads, with handoff per §11.1. Relay `peer left` → a `presence` command
  makes the character dazed (§11.3); `rejoined` or a key match restores it. A phone joining during combat
  gets `waiting` and becomes a late join at the next build phase.
- **Versioning:** `PROTOCOL_VERSION` bumps on any breaking change to `messages.ts`; additive fields don't
  bump it. `messages.ts` is a frozen contract (§15.11).

### 15.7 Controller app

- **DOM and CSS, no canvas** (as in Sunny Side), built on `@pcg/controller-kit`. The screen comes from
  `me.screen`; reconnecting, host away and rotate are phone-local overlays. Screen groups that share a
  view (so a held thumb survives a switch): `combat` and `dead`; `lobby` and class select; `build` with
  its Build and Shop tabs. Every player gets both tabs; an empty `buildKit` shows the "No buildings to
  build" note in place of the kit tiles (§10.2).
- **Components:** plain TS DOM components, no framework (as in Sunny Side and the kit): `Badge` (icon +
  tile state, §2.6), `RoundButton`, `ChargeRing`, `StatusStrip`, `KitTile`, `UpgradeCard`, `ShopRow`,
  `HoldConfirm`, `Toast`, `LineupRow`, `ClassCard` (portrait, §15.4). Each screen composes them and
  re-renders from the latest `team` and `me`. The mockups in §2.6 fix the look; the markup is the
  build's call.
- **Combat layout (§10.1)** comes from a pure function, `layoutCombat(viewport, safeInsets) → rects`,
  turning the percentage positions and fixed sizes into px rectangles. Unit tests check its rules at
  several viewports (644×300 to 1366×1024 landscape): gaps ≥ 24 px, button edges ≥ 64 px from the right
  and bottom, every button ≥ 56 px. A Playwright test screenshots it on real viewports (as in Sunny
  Side).
- **Gestures** (`controller-kit`, pure state machines with DOM adapters, unit-tested without a DOM):
  - **Aimed button:** down → `pending`; released within 150 ms inside the dead zone → `tap` (fire,
    aim 0,0); dragged out → `aiming` (aim flag set, vector clamped to 70 px); released outside the dead
    zone → `fire` with the aim; released inside it after aiming → `cancel`.
  - **Tap button:** fires on release (§10.1).
  - **Radial button:** a tap within 150 ms → `tap`; held 0.4 s or dragged out → `open` (radial flag,
    slot by drag direction among enabled slots, 8 px hysteresis between slots); released on a slot →
    `commit`; released in the dead zone → `cancel`; held on Give → repeat commits every 300 ms. With a
    single slot (Give only), holding 0.4 s commits Give directly and repeats.
- **Super ring, status strip, action icon:** drawn from `me`; the ring animates between updates. The
  flash and 1.2 Hz pulse on `superReady` are CSS animations. Buttons and menu items use the icon set's
  lit badges; `action: 'none'` shows the glyph at 35% on the plain tile (icons `README.md`).
- **Shop:** hold-to-confirm (0.6 s) on items with `holdToConfirm`; Request toggles; purchase failures
  show the `ack` reason as a toast.
- **Bundle budget:** `play.html` loads ≤ 100 KB gzipped JS, with no Phaser and no atlases, only
  `themes/<id>/shared.ts` (the icon sprite and portrait images load as assets, outside the JS budget).
  `check-bundle` gains a per-app size limit.

### 15.8 Resume snapshot

- **Storage:** `localStorage` key `fort-frenzy:run` (survives a browser crash, unlike Sunny Side's
  `sessionStorage`). Versioned JSON; a version mismatch or a snapshot older than 12 hours is discarded.
- **When:** written at the start of each build phase and on every run-state change during it,
  debounced to 250 ms and flushed on `pagehide`. Cleared when the run ends (§4).
- **Device ID:** a random ID the phone keeps in `localStorage` (`fort-frenzy:deviceId`), not tied to any
  room, sent in `hello`. It's how a resume into a new room matches phones to slots (§11.5), since
  reconnect tokens and player keys belong to a room code.
- **No RNG state:** every stream is derived from (seed, label), so a restored card offer is identical
  and a refresh can't reroll it.

```ts
interface RunSnapshot {
  v: 1; savedAt: number; build: string;              // build = commit hash
  settings: { theme: ThemeId; difficulty: DifficultyId; seed: number };
  wave: number; base: { hp: number; repairs: number }; coins: number;
  shop: Record<ShopItemId, number>;                  // tier owned (archer upgrades: 0 or 1 each)
  structures: { id: StructureId; tile: [number, number]; hp: number | null;
    dischargesUsed?: number; fortified?: boolean }[];
  cratePiles: { x: number; y: number; n: number }[];
  slots: { slot: number; playerKey: string; deviceId: string; name: string; color: PlayerColorId;
    classId: ClassId; hp: number; crates: number; lastBuilt: StructureId | null;
    cards: Record<CardId, number>; offer: CardId[] | null; picked: CardId | null; stats: RunStats;
    squad?: { size: number; veterans: number[]; flag: [number, number] | null } }[];
  leaderKey: string | null;
  wishlist: { item: ShopItemId; slot: number }[];
}
```

- **Resume flow:** on reload, the host reclaims the room (phones stay joined and show "TV is
  restoring…"). The TV offers "Resume wave N (saved X min ago)" or "New run", focused on Resume and
  driven by keyboard or gamepad; the leader's phone can choose too. If the relay hands back a new room
  instead, the TV shows the new code; rejoining phones are matched by device ID, and any others see the
  `claim` screen listing free slots.
- A resume starts a new replay segment that begins from the snapshot (§15.9).

### 15.9 Testing

- **Headless sim:** `src/host/sim` and `src/host/systems` run in Node under Vitest with no Phaser and no
  DOM, driven by input sources and commands.
- **Replays (developer tool, not player-facing):** the host records `RunStart`, every input sample that
  changed, and every command, per step, plus the build commit hash. The debug panel downloads it as
  gzipped JSON (about 1 MB for a full run); an uncaught error offers the download automatically. Node
  `scripts/replay.ts <file>` re-runs it headless and checks the state hash every 60 steps, reporting the
  first divergence. Replays are tied to the exact build.
- **Determinism tests:** the same seed and inputs, run twice, give identical state hashes (scripted runs
  and the soak). Scenario tests assert outcomes, not hashes, so balance changes don't break them.
- **Soak and benchmark:** an `AutopilotInputSource` (walk toward the nearest enemy, fire on cooldown,
  fall back toward the base when hurt) plays waves 1–15 headless with invincible players: no exceptions,
  and the run completes. A benchmark at peak entity counts checks the 2 ms step budget (§15.2); it runs
  on demand, not in the CI gate. The autopilot seeds the solo-mode bots (§13).
- **Unit tests:**
  - wave generator: spends within ±1 of the budget, allowed types only, guaranteed spawns present,
    Flyer substitution, open lanes only, spread across the duration, same seed same wave, scaling
  - card picker: every §6.1 exclusion, no duplicates in an offer, at most one rare, guaranteed rare after
    a boss, about 15% rare offers over 10,000 seeded offers, same (seed, wave, slot) same offer
  - flow field: routes around walls when it can and through when sealed, snares change nothing, the
    breaker field prefers walls, rebuilds on place and destroy, every reachable tile leads downhill
  - damage pipeline order, stat stacking and caps, each effect stacking policy
  - config validation (§15.4), theme key whitelist (§15.4)
  - snapshot round trip: save, restore, same state hash at the build phase
  - protocol guards, the combat layout rules and the gesture state machines
  - asset license coverage (§15.10)
- **E2E (Playwright, as in Sunny Side):** smoke (lobby, class select, start, build, combat), phone
  reconnect, host reload and resume, expired room resumed by device ID, controller layout screenshots.

### 15.10 Hosting, assets and licensing

- **Hosting:** a Vercel project with root `apps/fort-frenzy` and `vercel.json` `{ "cleanUrls": true }`,
  at `fort-frenzy.fostercurtis.dev`, using the shared relay through `VITE_RELAY_URL` (as in Sunny Side).
  Vercel's ignored build step skips a deploy unless `apps/fort-frenzy`, `packages/` or the lockfile
  changed.
- **Root wiring:** the five per-game scripts (`dev:`, `dev:lan:`, `build:`, `e2e:`, `check:fort-frenzy`),
  and Fort Frenzy rows in the `PLATFORM.md` §1, `README.md` and `AGENTS.md` tables.
- **Brand kit:** delivered as `apps/fort-frenzy/fort-frenzy-brand-kit.zip`. The first build milestone
  unpacks it (`brand/`, `public/`, `src/styles/brand.css`, plus its `.prettierignore` lines), adds the
  `head.html` snippet to both HTML entries and mirrors `brand.css` in `src/shared/theme.ts` with a
  parity test (§2.3). `check:routes` then passes as is (icons, manifest, Google Fonts).
- **Icon set:** delivered as `apps/fort-frenzy/fort-frenzy-icons.zip` (or added directly) at
  `art/icons/`; the first build milestone moves it to `art/neon-knights/icons/` (the `art/<theme>/`
  rule, §15.1) and adds it to `LICENSES.json` as `owned`. Later art deliveries follow the same rule.
- **Atlas pipeline:** `scripts/build-atlases.ts` runs before every `build` and in dev (watch mode). It
  rasterizes each SVG part with `@resvg/resvg-js` at 1× and 2×, **strips the review-only glow filters**
  (`#glow`, `#glowU`, `#glowS`), packs Phaser JSON atlases (≤ 4096²) and checks every rig JSON against
  the frames it found (every part present in every view and pose, §15.2). It also builds the phones'
  icon sprite and the class portraits (§15.4). Output is gitignored. The TV picks 2× when the canvas's device-pixel size exceeds
  1.5 × 1080. Atlases and audio get content-hashed names through Vite and are cached forever.
- **Audio:** `.mp3` SFX in `audio/<theme>/`, mapped by `ThemeHost.sfx`. The TV preloads everything
  behind a loading bar on the home screen; the first keypress there unlocks audio (browser autoplay
  rules).
- **Licensing:** `assets/LICENSES.json` has one entry per asset file or pack: path or glob, source URL,
  author, license and whether commercial use is allowed. A unit test fails if any file under `art/`,
  `audio/` or the fonts lacks an entry, or allows no commercial use (§2.3). Foster's own art is
  `owned`; a Kenney pack is one CC0 glob entry.

### 15.11 Contracts and decision log

**Frozen contracts** (additive changes only once the first build milestone lands; headers say
"Frozen", as in Sunny Side): `src/shared/messages.ts`, `src/shared/ids.ts`, `src/content/types.ts`, the
sim's public types (`World`, `Modifier`, `Hooks`, `InputSource`, `DamageCalc`, `BossBehavior`),
`src/themes/types.ts` (`ThemeShared`, `ThemeHost`, `RigDef`), `RunSnapshot`, and the public APIs of
`@pcg/controller-kit` and `@pcg/game-kit`. Tuning values in `src/content/` are never frozen.

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
