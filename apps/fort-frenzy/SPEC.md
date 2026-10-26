# Fort Frenzy — Spec (working draft)

Working title: **Fort Frenzy** (formerly "Hold the Line", then "Stronghold"). The name must be cleared
before any public release (§14).

Co-op wave defense for 2–6 players. Phones are controllers; the shared screen (TV/laptop) runs the game.
This file records **decisions made so far**. Items deferred past v1 are in §13. Items still open are in
§14.

**Status:** v1 game design is complete. Technical sections (repo layout, engine, protocol, game loop,
module boundaries) are not written yet; they are to be added in the repo, where the existing monorepo
can inform them. Internal names in this spec (Engineer, Grunt, and so on) are code IDs; player-facing
names come from the theme (§2.1).

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
- **Players and player structures glow amber,** matching the fostercurtis.dev brand amber. Take the exact
  hex from the site's design tokens.
- **The Iron Tide glows cold cyan.** Amber against cyan is the classic orange/blue pairing: maximum
  contrast, and it stays distinguishable for the most common forms of color blindness.
- **Red is reserved for danger:** ground markers for incoming attacks and low-HP warnings. Neither side
  uses red as its main glow.
- Per-player colors (assigned on join, §11.1) appear on nametags and rings, and must stay distinct from
  enemy cyan and danger red. Display names and visuals:

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
| Barricade | Barricade | Low energy barrier |
| Fortify | Fortify | Shield emitter attached to a tower |
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

## 3. Map, base and camera

### 3.1 Map
- The base sits on the **bottom edge** of the map.
- Enemies arrive through lanes from the top and sides. More lanes open as waves progress.
- v1 has one map with 3 lanes.

### 3.2 Camera
- **v1: fixed camera showing the whole map.** Every player is always on screen, and there is no camera
  logic.
- Because nothing scrolls, the map must stay readable on a TV from across the room. This limits map
  size.
- A dynamic camera is planned for v2 (§13).

### 3.3 Base HP and damage
- The base has a **single HP pool**, shown as a bar at the top of the TV.
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
- **Shop upgrades, buyable by anyone, in three tiers:**
  1. Damage
  2. Range
  3. A third archer

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
- Nothing is lost on death: upgrade cards and team purchases persist.
- On death, a player drops any supply crates they were carrying. The crates stay on the ground, where
  any player can pick them up. (Coins are never carried; they go straight to the team pool.)

## 6. Economy

- Kills add **coins** directly to a **shared team pool**. Players never carry coins.
- **Coins** buy things: supply crates and team shop items (§6.2).
- **Supply crates** are what structures cost. Every structure (towers, walls, barricades and Fortify)
  costs crates; the rally flag is free. Crates are also used to repair the base (§3.4).
  - The **supply depot** is a pad beside the base. It sells crates to any player at full price, during
    both phases. The depot pad and the base's repair zone are separate areas, so the action button is
    never ambiguous (§10.1).
  - Non-Quartermasters carry one crate at a time and move more slowly while carrying it.
- **Quartermaster supply perks:**
  - Buys crates at a discount.
  - Carries 2–3 crates at once with no slowdown.
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
| Pack Mule | Common | +1 crate carried |
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
| Supply crates | Same price as the depot (§6), so crates can be bought from the phone during the build phase |
| Base repair | Price rises with each purchase (§3.4) |
| Base archer upgrades | 3 tiers: damage, range, a third archer (§3.5) |
| Commander squad stats | After regular waves. Squad size grows after waves 5 and 10 (§8) |
| Arrow towers: fire rate | 3 tiers |
| Bomb towers: blast radius | 3 tiers |
| Tower HP (all towers) | 3 tiers |
| Wall and barricade HP | 3 tiers |
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
  structure is placed or destroyed.
- **Walls have a high path cost instead of being impassable.** Enemies route around walls when they can.
  If no route exists, they stop and break through.
- **Build phase:** the player opens the build menu on their phone. A ghost preview appears at their feet
  on the TV. They confirm or cancel. The ghost turns red on invalid tiles, for example occupied tiles.
- **Combat phase:** players can only quickly place their last-used structure. There are no menus during
  combat. This uses the action button (§10.1).

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
- **Passive — Mason:** walls near the Warden slowly repair themselves.
- **Build kit:**
  - Walls: reroute enemies.
  - Barricades: cheaper and weaker than walls, slow enemies.
  - Fortify: attaches to a tower and gives it a defense bonus.
- **Strongest against:** Brutes, Swarms and Hunters. The stun also stops Runners.

### Quartermaster (support)
- **Main:** 3–4 energy bolts in a narrow cone at medium-long range. Walls and towers block them.
- **Super:** A very wide, long-range cone. It heals players it hits by a fixed amount and gives towers it
  hits a temporary defense bonus. It passes through walls and towers.
- **Passive — Field Medic:** a small regeneration aura for nearby players.
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
| Runner | Fast and fragile, ignores players | Towers, walls, Warden stun, Engineer |
| Brute | Huge HP, smashes walls | Warden, focused damage, Commander's super |
| Siege | Stops at range and shells the base or towers | Engineer (outranges it), Commander and squad dive |
| Flyer | Ignores walls | Engineer, arrow towers, Quartermaster, base archers |
| Swarm | Many weak units | Area damage: Warden, bomb towers, Quartermaster, Engineer's super |
| Hunter | Targets players instead of the base | Warden stun, Commander's squad, Quartermaster healing |
| Boss (Colossus, §9.2) | Appears at waves 5, 10 and 15 | Everyone |

- **Melee attacks cannot hit Flyers.**
- **Flyers spawn only if the team has a ranged class** (Engineer or Quartermaster). Otherwise their spawn
  slots are filled with additional ground units.
- The team's class composition is checked at the **start of every wave**, so a ranged player dropping
  mid-run can't strand the team against Flyers.
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

The Colossus is a huge, slow walker that comes down one lane toward the base. In the neon knights theme
it is a giant walker mech with a glowing core in its chest (§2.1); its detailed design is still open
(§14).

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
- A large boss HP bar appears at the top of the TV, below the base HP bar.
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
  debugging.
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
- **Player-count scaling:** wave budget and boss HP are multiplied by `0.5 + 0.25 × players`. That is
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

## 10. Controls

General rules:
- Phones are held in landscape.
- The controller follows the platform requirements: `touch-action: none`, locked viewport, Wake Lock,
  reconnect handling, and no vibration.
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
| 4 | Engineer or Warden holding a crate | Place last-used structure at feet |
| 5 | Quartermaster holding crates | Throw one, auto-targeting the nearest Engineer or Warden |
| 6 | Commander (default) | Plant rally flag; tap again to recall the squad |

The button's icon changes to show what it will do. If nothing applies, the button is dimmed.

### 10.2 Build phase
- The movement stick stays the same.
- The right side becomes the build menu: the class's structures, their crate costs, and crates carried.
  Classes with no structures (Quartermaster) see the shop tab instead.
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
- Players: 2–6.
- **TV menus never need a mouse.** The home screen (theme, difficulty, create room) works with keyboard
  or gamepad, with no hover-only interactions. Once a room exists, the party leader's phone drives the
  TV menus: changing theme and difficulty in the lobby, and the end-of-run options (§4).

### 11.2 Mid-run joins and class changes
- **Late joins** are accepted only during the build phase. The new player spawns at the base.
- Enemy scaling and the Flyer composition check are recalculated at the next wave start.
- Players **cannot change class** mid-run.

### 11.3 Player disconnect
- **Identity:** on join, the relay issues a reconnect token, stored on the phone. Reconnecting with the
  token restores the same player slot, and the host keeps that player's full state while they're gone.
- **Dazed state:** while disconnected, the character stops and turns translucent. Enemies can't target
  it. Any crates it was carrying drop on the ground.
- **Grace period:** the slot is held for 60 seconds. After that the player is removed. If they reconnect
  later, they rejoin as a late join (§11.2). Team upgrades persist either way.
- **What players see:**
  - On the phone: a "Reconnecting…" overlay.
  - On the TV: a reconnecting icon on that player's nametag.
- **No pausing in v1.** The game auto-pauses only if every player is disconnected at once.
- **iOS backgrounding:** when the page becomes visible again (`visibilitychange`), the phone reconnects
  immediately with its token.

### 11.4 Input freshness
- **Phones send at a fixed rate,** not only when input changes:
  - 20–30 Hz while any control is touched.
  - A 5 Hz heartbeat while idle.
- **The host treats input older than 250 ms as neutral:** sticks zeroed, buttons released. A dropped
  phone must never leave its character running in the last direction.

### 11.5 Host refresh or crash: resume
- **Snapshot:** at the start of every build phase, the host saves a run snapshot to its browser storage.
  The snapshot contains:
  - theme, difficulty and run seed
  - wave number
  - base HP and repair purchase count
  - team coins
  - structures and their HP
  - every team shop purchase and tier (archers, buildings, squad)
  - each player slot's class, upgrade cards and reconnect identity
  - Commander squad size
- **Room survives:** the relay keeps the room alive for about 2 minutes after the host disconnects, so a
  reloaded TV reclaims the same room code with its host token. Phones stay joined.
- **Resume:** after a reload, the TV offers "Resume wave N." Resuming restores the snapshot at the start
  of that build phase. Any progress from the interrupted combat phase is lost.
- **Expiry:** if the room has expired, the snapshot can still resume, but phones must rejoin. Players
  are matched back to their slots by reconnect token where possible, and otherwise pick a free slot.
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
- Everything in §13 is out of scope for v1.

## 13. Later (v2+)

Ideas deferred from v1. Build v1 so these can be added without rewrites.

| Item | Notes | v1 prep |
|---|---|---|
| Pillow Fort theme | Second theme pack: a kid's bedroom at lights-out, where toys invade the pillow fort. Lanes are the closet, under the bed and the hallway door. Default difficulty: Easy. Draft mapping: base = pillow fort; Engineer = foam-dart kid (dart turret, water-balloon launcher); Warden = pillow-smash kid (couch-cushion walls, book-stack barricades); Quartermaster = big sibling with a bubble wand (snack-pack crates); Commander = kid general with toy soldiers; enemies are wind-up soldiers, RC cars, possessed teddy bears, toy catapults, paper airplanes, dust bunnies and jack-in-the-boxes; the Colossus is a giant wind-up robot | Theme-agnostic build (§2.1): no gameplay changes needed |
| Selectable passives | 3 options per class, chosen at class select (list in §8) | Passives are pluggable modules |
| Dynamic camera | Zooms and pans to keep all players in view (Smash Bros. style) | Render through a camera abstraction, even though v1 keeps it fixed |
| More characters per class | 2–3 per class | Characters are defined by config: attacks, super, passive, build kit |
| Endless mode | Survive as long as possible, high score | None needed |
| More maps, each with its own boss | New maps, each with its own boss. The first candidates are the Warlord (stays back behind a shield and summons enemies; killing the summoners drops the shield) and the Burrower (tunnels and resurfaces in a different lane) | Map layout and boss are defined by config, and boss behavior is its own module rather than hard-coded to the Colossus |
| Card reroll | Reroll your 3 offered cards, paid from team coins | Offers are generated by one seeded function, so a reroll just calls it again |
| Critical hits | Crit chance and crit damage cards | Damage goes through one function, so crit is one extra step there |
| Solo mode (likely v3 or v4) | One character of each class. The player switches "focus" between them, controlling the focused character with its full actions and abilities; bots control the other three. The build phase is longer, because one player makes decisions for all four characters | Characters read input through an input-source interface (phone controller now, bot later), never directly from the network |
| Elite enemy variants | Modifiers such as armored or fast | Enemy stats come from config, so a variant is a stat override |

## 14. Open / under discussion

1. **Final name:** "Fort Frenzy" is the working title. Before any public or Steam release, check it
   against Steam, itch.io and the USPTO trademark database, and confirm a fostercurtis.dev subdomain.
   ("Stronghold" was dropped because of Firefly Studios' *Stronghold* series.)
2. **Colossus visual design:** the detailed look of the giant walker mech.
3. **Numbers to set in playtesting:** player HP, character damage and super charge rates, structure costs
   and HP, crate prices, base HP and the repair amount per crate. These go in config, and the starting
   values are picked during implementation.
