# Fort Frenzy — Redesign (players-only wave defense)

**Status:** Folded into SPEC.md at RD0 (b1a8a63); kept as the decision record. (Design complete:
groups A–G decided, 2026-11-17.)

Last updated: 2026-11-17

---

## 0. What this doc is

Fort Frenzy was designed and built as co-op tower defense (SPEC.md as of `23ce0ac`). It is being
redesigned as **players-only wave defense**. The objective is the same (defend the Citadel from waves
of the Iron Tide), but the knights are the only defense. Persistent structures (towers, walls, shock
nets, Fortify) are removed. Each knight gets a temporary **build** that controls the arena.

**Why:** two problems with the tower-defense version.
1. The only lasting damage on the map came from one class's towers (the Ranger's), so the Ranger could
   solo most waves. That broke the existing "roles amplify, never gate" principle.
2. The structure systems pulled the game away from both a real tower-defense game and an action game,
   and the result felt off.

**How it lands in the repo:**
1. Tag the current main before any redesign commit: `fort-frenzy-td-final`. The working
   tower-defense build stays recoverable.
2. **This file is the source of truth for the redesign.** Where it and `SPEC.md` disagree, this file
   wins.
3. The redesign build plan (`REDESIGN_BUILD_PLAN.md`) starts by folding these decisions into `SPEC.md`
   (§1–§14 rewritten, §15 technical design updated by the agent), so subagents read one coherent spec.
   After that, any conflict found is fixed in `SPEC.md` in favor of this file.
4. New art is produced separately on an `art/redesign` branch (list in F5); the build plan uses
   placeholders until it merges.
5. This file stays as the decision record. Delete it, or move it to `docs/`, once the redesign ships.

**Design groups:**

| Group | Topic | Status |
|---|---|---|
| A | Core loop and flow | **Decided** (2026-11-16) |
| B | Economy | **Decided** (2026-11-16) |
| C | Classes and knights | **Decided** (2026-11-17) |
| D | Enemies and boss | **Decided** (2026-11-17) |
| E | Progression: cards and shop | **Decided** (2026-11-17) |
| F | Controls and UI | **Decided** (2026-11-17) |
| G | Name, themes, difficulty, tuning | **Decided** (2026-11-17) |

---

## A. Core loop and flow (decided 2026-11-16)

### A1. Pillars and balance → SPEC §2 (Core identity), §8 intro

Replaces the §2 "Core identity" bullets.

- **Players are the defense.** Nothing defends the base except the knights and the Citadel's sentry
  guns.
- **Builds are tactics, not infrastructure.** Everything a knight places is temporary and exists to
  control the arena: slow, stun, pull, block, heal, buff or draw fire.
- **Any knight can hold a side,** including alone in solo play.
- **Balance rule:** every knight's solo clear rate (one knight, alone, against a standard group from one
  portal) is within **±20–25%** of every other knight's. This is checked in playtesting by timing each
  knight alone against the same wave. No knight is the team's damage.
- **Class = playstyle, knight = method.**
  - A **class** is a general focus (for example tank, damage, support). It defines:
    - an **HP tier** (the tank has much more HP than the support), and
    - a **damage band** inside the ±20–25% rule (the support sits toward the low end and makes up for
      it with healing, through its passive or super).
  - A **knight** is one character in a class. It defines everything else: how it attacks (single
    target, area, sustained, and so on), its super, its passive and its build. Two knights in the same
    class do the same job in different ways.
  - v1 ships **one knight per class.** Classes and knights are modeled separately in data now, so more
    knights per class is content, not code (§13).
  - The class list and the v1 knights are decided in group C.
- Kept from the current spec: classes are picks, not required slots; duplicates are allowed; every
  enemy type must be answerable by at least two classes or by a baseline every team has.

### A2. Map and portals → SPEC §3.1, §9.4

- **The Citadel stays where it is:** centered on the top edge, gate facing down-field (§3.1, §3.6
  unchanged).
- **Lanes are replaced by portals.** The v1 map has **6 fixed portals**: 2 on the bottom edge and 2 on
  each side edge. Side portals sit on the **lower two-thirds** of their edge, so no portal spawns
  within a few tiles of the Citadel.
- **Every portal is live from wave 1.** Lane unlocks (left at wave 3, right at wave 8), sealed-lane
  gates and the "lanes open" column of the wave table are removed. New enemy types carry the
  progression instead.
- **Portal flare:** a portal flares for about 1 s just before it spawns a group. This replaces the
  3-second lane glow (§9.4). It shows where something is about to appear, never the wave's pattern.
- **Hot side** (a side is the 2 portals on one edge: left, bottom or right):
  - The hot side receives about 50–60% of the wave's budget while it is hot (starting value; tune in
    playtesting).
  - **It is never announced,** not in the wave preview and not when it shifts. Players read it from the
    enemies coming at them.
  - Schedule (lives in the wave data, so it is tuned there):

| Waves | Hot side |
|---|---|
| 1–3 | One per wave, no shifts |
| 4, 6–8 | One per wave, plus 1 mid-wave shift |
| 9 and 11 | One per wave, plus 2 mid-wave shifts |
| 5 and 10 (boss) | The boss's side is the hot side, no shifts |
| 12–15 (including the wave 15 boss) | **Per spawn group:** each group rolls its own hot side, never the same side twice in a row. Attacks come from every side, each one focused. At wave 15 the boss's escorts follow this rule too |

### A3. Covering the map, and player-count scaling → SPEC §9.3, §9.4

- **Active portal cap:** spawn groups come from at most **`players + 1`** portals at a time (2 in solo,
  7 with 6 players, so a full team sees every portal). The generator picks the active portals per
  spawn group, weighted toward the hot side while one exists.
- **Player count is 1–6.** Solo play is supported in v1.
- **Scaling is a lookup table in the balance sheet,** not a formula. It replaces
  `0.5 + 0.25 × players`:

| Players | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Wave budget and boss HP | 0.6 | 1.0 | 1.25 | 1.5 | 1.75 | 2.0 |
| Respawn time | 6 s | 10 s | 10 s | 10 s | 15 s | 15 s |

  - From 2 players up, this matches the current curve. Solo is lower because one player can't split
    fronts and a death leaves only the sentries defending.
  - Player count is still counted at the start of each wave (§11.3). Difficulty multipliers (§2.2)
    still apply on top.

### A4. The base → SPEC §3.3, §3.4, §3.5

- **Sentry guns stay** (§3.5), including their shop upgrades. They are what slows a front nobody is
  covering.
- **Base damage rules are unchanged:** walkers stop and attack the base, Runners burst on contact.
- **Anything that targeted towers now targets players** (Siege shells, the Colossus's boulder throw).
  See §D.
- **Repair comes only from the team shop,** at a price that rises with each purchase. Crate delivery,
  the repair zone and the emergency repair kit are removed (details in group B). There is still no
  passive base regeneration.

### A5. Wave flow → SPEC §4, §7, §10.2, §10.3

- **Order:** combat ends → **card pop-up** (full screen on each phone; a private pick-1-of-3) →
  **shop** (personal and team items) → Ready → next wave.
- **Shop layout:** the shop fills about the right 2/3 of the phone; the **movement stick** stays on the
  left third, so players can reposition while shopping. The Build tab is removed.
- **No placing builds in the build phase.** The build phase is cards, shopping and moving.
- **Timer:** a **20 s cap** (down from 45 s; set in F2), ending early when every player is Ready. A card not
  picked by the deadline is picked at random.
- **Run length:** 15 waves stays. With shorter build phases the target becomes about **20–24
  minutes** (tune in playtesting).
- **Build rules** (apply to every build unless its entry lists an exception):
  - **One active build per knight.** Placing a new one removes the old one.
  - **Lasting builds use HP or charges,** never a timer. They **stay on the map between waves** while
    they have HP or charges left.
  - **Timed effects are instant** (for example a magnet pull or burning oil). They run out on their own
    and never carry into the next wave.
  - Placement, aiming, costs and how builds charge are decided in groups B and C.

### A6. Death, respawn and regen → SPEC §5, §14.3

- **Delayed regen** for every knight: after about **4 s without taking damage**, heal **8% of max HP
  every 1 s** (in ticks, not a smooth trickle) until full or until the knight takes damage again.
- **Regen runs in the build phase too.** HP still carries over between waves, but the 20 s build phase (about 13 s to refill from 1 HP) is always
  enough to refill, so no separate full-heal rule is needed.
- **Respawn** at the base, per the scaling table (6 s solo, 10 s for 2–4 players, 15 s for 5–6;
  RC0, 2026-11-20). Quick Recovery's floor becomes 4 s in solo and stays 5 s otherwise.
- §14.3 ("passive regeneration, balance watch") is settled by this and removed.
- Balance watch: 8%/s also applies in combat. If support healing feels pointless, lower the percentage
  or lengthen the delay.

### Solo play → SPEC §11.1, §12, §13

- **The lobby minimum is 1.** The party leader can start alone.
- §12 scope: **1–6 players.**
- §13's "Solo mode (likely v3 or v4)" (one player switching focus between four bot-controlled
  classes) is a different idea. Rename it **"Squad solo mode"** so it isn't confused with 1-player
  play.

---

## B. Economy (decided 2026-11-16)

### B1. One currency → SPEC §6

- **Team coins are the only currency.** Kills add coins to the shared team pool, as now. Players never
  carry anything.
- **No power cells and no personal shop in v1.** Personal power comes from upgrade cards and per-wave
  class growth (B4). Per-knight stat upgrades bought with a personal currency go to v2 (§13).
- **Coin income drops sharply** (starting values set in playtesting), because the team shop is much
  smaller (B5). The difficulty coin multiplier (§2.2) still applies.

### B2. How builds charge → SPEC §8, §6.1

- Every knight has a **build meter.** A full meter lets the knight place its build once, and placing it
  empties the meter.
- **Hybrid charge, set per knight:** a slow **passive fill** over time, plus fill from the knight's
  **actions.** Both rates live per knight in the balance sheet, so each build is balanced against how
  strong it is and how much damage its knight deals (a weak build or a low-damage knight charges
  faster). A knight with an action rate of 0 is purely timed.
- **Action sources are per knight:** damage dealt by default; healing too for knights whose job is
  healing (the same pattern as the Artificer's super charging from healing today).
- **A build's own damage never charges the build meter.** It does charge the knight's **super**, which
  rewards good placement. A super's own damage still never charges the super.
- Damage from squads or pets: their charge sources are decided per knight in group C.
- **The meter starts the run full,** so wave 1 opens with a build. It **carries over between waves** and
  **does not fill during the build phase** (no building happens then).
- On the phone, the build meter is a fill ring on the action button, like the super's ring (group F).
- A build-charge card (like Focus for the super) fits the existing modifier system (group E).

### B3. Crate logistics removed → SPEC §3.4, §5, §6, §10.1

Removed entirely: supply crates and power cells as items, the Armory (supply depot pad), the repair zone
at the gate, carrying, the carry cap and carry slowdown, giving, throwing, dropping crates on death,
repairing the base by delivery, the Quartermaster's supply perks (discount, carry cap, throwing) and its
exclusive shop items. Base armor becomes a team shop item (group E). The emergency repair kit is
removed unless a group C knight's kit brings it back. Action-button priorities 1–6 are removed (the
button's new job is decided in group F).

### B4. Per-wave class growth → SPEC §6.1

- At the end of every wave each knight gets an automatic stat bump **set by its class** (for example,
  the tank's growth is mostly HP, the damage class's mostly damage, the support's split between HP,
  damage and healing). Boss waves give a bigger bump.
- Growth uses the cards' stat math: additive percentages of the base value (§6.1).
- **Growth only raises uncapped stats** (HP, damage, healing), so it never uses up the shared caps on
  range, movement speed and damage reduction.
- Shown as a header on the card pop-up, for example "Wave 4 cleared: +HP +DMG", above the three cards.

### B5. Team shop only → SPEC §6.2

- The shop is **team-only,** paid from coins. §6.2's purchasing rules stay: anyone can buy, every
  purchase is announced on the TV, hold-to-confirm on big buys, and Request with the wishlist.
- **It is thin in v1 on purpose:** base repair (price rises with each purchase), base max HP and armor,
  and sentry gun upgrades. Squad stats depend on group C. The full list is set in group E. More items
  are a v2 addition.
- Removed items: supply crates, tower fire rate and blast radius, tower HP, wall HP, snare charges,
  spiked (charged) walls, Quartermaster-only items.
- **Build-phase length:** shortened to a 20 s cap (F2).

### For §13 (v2)

- **Personal stat upgrades:** each knight earns a personal currency (power cells) to spend as upgrade
  points in stat categories. It overlaps with the upgrade cards, so v2 decides whether it replaces or
  complements them. v1 prep: stats already go through the modifier system.
- **More team shop items** (B5).

## C. Classes and knights (decided 2026-11-17)

### C1. Classes → SPEC §2, §8

- **v1 classes: tank, marksman, support, control.** More classes come later (for example a squad
  leader, if the Commander's squad becomes its own playstyle).
- Each class defines a **focus,** an **HP tier,** a **damage band** (inside the ±20–25% rule, A1) and its
  **per-wave growth** (B4). Everything else belongs to the knight.
- Starting values, relative to a baseline knight:

| Class | Focus | HP | Damage band | Growth |
|---|---|---|---|---|
| Tank | Hold the line, draw and absorb attacks | 1.6× | Mid (about −10%) | Mostly HP |
| Marksman | Remove threats fast, at range | 0.8× | High (about +15%) | Mostly damage |
| Support | Keep the team alive and strong | 0.9× | Low (about −20%), plus healing | HP, damage and healing |
| Control | Decide where enemies fight and what they can do: hold territory (including a side the knight isn't on), slow, stun, pull, knock back | 1.0× | Mid (about −5%) | HP and damage |

- **What makes control distinct:** every knight's build controls the arena a little, so
  the control class carries control in its **main attack and super too,** and its builds are the
  strongest control effects. Other classes' builds lean toward their own focus (a marksman decoy, a
  support beacon, a tank's mines).
- Which v1 knight fills which class is decided with the kits (the obvious fit is Warden = tank, Ranger
  = marksman, Artificer = support, Commander = control).

### C2. Build input → SPEC §8, §10.1

- **Set per build:** some builds are placed at the knight's feet, others are aimed or thrown.
- **Builds use the same input grammar as attacks** (§10.1), so the action button behaves
  like the main and super buttons:
  - **At-feet builds** are tap-type: tap to place.
  - **Aimed or thrown builds** are aimed sticks: drag to aim, release to place; a quick tap auto-targets
    (the nearest enemy group in range for offensive builds, the knight's own feet for the rest); slide
    back into the dead zone to cancel. The TV's aim preview shows the landing spot as a 0.6 ground
    ellipse at the build's real size, within the build's maximum throw range.
  - The input type per build is listed in the knight table, like the main and super today.

### C3. Builds as targets → SPEC §7, §9

- **Enemies target a build exactly as they target a knight,** with the same aggro radius and leash.
- **Build HP is a fixed value per build,** tuned in playtesting. **A newly placed build always starts at
  full HP.** A build that survives a wave keeps its current HP into the next wave (A5).
- **Only builds with HP are targetable.** Charge-based builds (mines, nets, traps) and
  instant effects can't be attacked; they're used up instead.
- When a knight and a build are both in range, the enemy picks the **nearest** one, the
  same tie-break used between knights.
- Enemies whose AI never targets knights (Runners) never target builds either. Each
  enemy's rule is set in group D.
- A build meant to draw fire would need more than the default rule (a taunt or a larger aggro radius),
  since every HP build already draws fire. None in v1: the decoy idea became the pulse turret (pool).

### C4. No walls in v1 → SPEC §3.1, §7, §13

- **No knight places temporary walls in v1,** and the v1 map is an open field.
- **Permanent walls built into the map come with v2 maps** (§13). The v1 code already supports this:
  the map format has a `blocked` tile type and flow fields price terrain, so v2 terrain is map data,
  not new systems.
- **Consequences for v1:**
  - Nothing a player places changes pathing, so the ground flow field is built once per run and never
    rebuilt. Placement-triggered rebuilds and the `breaker` field (Brutes and the Colossus preferring to
    smash walls) are removed. Hunter fields that follow a player stay.
  - The tactical layer is the control builds (nets, magnets, stuns, oil) rather than geometry.
  - Balance watch: an empty field can feel flat. If playtests say so, a few small blocked props on the
    v1 map are a data-only fix.

### C5. v1 kits (decided 2026-11-17)

| | Warden | Ranger | Artificer | Commander |
|---|---|---|---|---|
| Class | Tank | Marksman | Support | Control |
| Main | Hammer smash: damage in an arc spreading out in front of him | Long-range bow shot | Nanite blast: about 5 nanites fired at random spots in a narrow cone over about 0.8 s (one burst per release; cooldown ≥ 0.8 s; spread from the seeded RNG) | **Shield bash:** short-range hit with knockback (new art: the Commander holds a shield) |
| Super | Jump and slam: short airborne wind-up, then damage and stun in an arc as wide as the main's but longer; less damage than the main. The airborne pause is a tell for players (enemy AI doesn't dodge) | Shockwave from the Ranger: knockback and light damage | Wide nanite cone that heals himself and allied knights it reaches (not builds) | **Reinforcements:** spawns one squad soldier, thrown a short distance (as the old super). Charged by his own damage plus squad damage at a reduced rate. At the squad cap the button stays dimmed and the charge is held |
| Build | **Shield generator** (thrown): knights and squad soldiers in range take less damage (builds aren't affected); range shown on the TV | **Mines** (at feet): one per full meter, **up to 3 active** (a 4th removes the oldest; an exception to the one-build rule); translucent to players; trigger after a short delay when a ground enemy comes close (Flyers pass over) | **Healing beacon** (thrown): heals allied knights in a small area around it | **Rally flag** (thrown): the squad goes to the flag and fights there. With the meter full, the build throws a new flag (the old one is removed); with the meter not full, the build recalls the flag and the squad follows him again. The flag can't be attacked and stays until recalled or replaced, including between waves (a declared exception to the HP-or-charges rule) |
| Passive | None (cards can add one) | None | None | None |

- **Passives become cards:** the old passives that still apply (Steady Aim, Field Medic, Lead from
  the Front) become card options. Mason is removed (no walls).
- **Commander's squad:**
  - **Starts the run with 2 soldiers.** After that the super is the only source; soldiers don't respawn.
  - **Squad cap:** about 4–5 (tune in playtesting). Low HP; they fight at the flag, or follow him when
    no flag is out. Survivors carry over between waves.
  - Squad damage charges his super at a reduced rate, never his build meter (B2). His damage for the
    balance rule (A1) counts his own plus the squad's.
  - **Morale is a card** (E): a morale aura around the rally flag and around him. An ally inside both
    gets one effect; they don't stack. Lead from the Front stays a card too.
- **Ranger range:** on the open map a long-range bow may cover two sides from the middle. Range is the
  knob to tune.
- **Ranged enemies (balance note for D):** ranged knights may take too few hits; more ranged enemies
  could fix that. Decide with the enemy roster.

### Enemy power over the run (balance watch, Foster 2026-11-16)

Knights get stronger every wave (class growth, cards, shop), while each enemy type's stats stay fixed;
only the wave budget (enemy count) and new types rise. Add an optional **per-wave enemy
HP and damage multiplier** to the wave data (default 1.0) so the curve can be tuned in playtesting
without code changes.

### Build idea pool

Every build idea so far, with Foster's mechanics notes (2026-11-16) and a best-fit class. This table is
the menu for future knights; it moves to the §13 v2 notes when the spec is rewritten.

| Build | Input | Mechanics | Best fit | Status |
|---|---|---|---|---|
| Shield generator | Thrown | Knights and squad in range take less damage; range shown | Tank | v1 Warden |
| Mines | At feet | Up to 3 active; translucent; short trigger delay; ground enemies only | Marksman | v1 Ranger |
| Healing beacon | Thrown | Heals allied knights in a small area | Support | v1 Artificer |
| Rally flag + squad | Thrown | The squad fights at the flag; soldiers come from his super | Control | v1 Commander |
| Pulse turret | Thrown | Like the old pulse turret but weaker; enemies treat it as a knight. Deals damage; not a decoy | Marksman | Pool |
| Shock net | Thrown | Like the old shock net (slows ground enemies crossing it), with a stronger slow | Control | Pool |
| Nanite bomb | At feet | Mine-like; on trigger, infects nearby enemies for 3–4 s with damage over time | Control (area denial); also marksman | Pool |
| Stun trap | At feet | Stuns the enemy that triggers it | Control | Pool |
| Magnet box | Thrown | Pulls enemies in range toward it for about 2–3 s; pulled enemies can still attack and be hit; the boss is immune | Control; also tank (pull enemies into himself) | Pool |
| Oil slick | Thrown (oil drips along the flight path) or at feet (a trail for 3–4 s while the knight moves). Undecided | Oil on the ground that can be lit on fire | Control | Pool |
| Damage station | Thrown | Boosts allies' damage in an area; has HP and is attacked | Support | Pool |
| Buff station variants | Thrown | Same as the damage station, buffing another stat (for example movement speed) | Support | Pool |
| Robot pet | Thrown | Chases enemies and fights back; limited HP and attack, but can defeat a few enemies before dying | Marksman (peels enemies off a ranged knight); also tank | Pool |
| Temporary wall | In front of the knight, facing direction | Reroutes enemies using the existing wall pathing (including Brute and Colossus wall targeting) | Tank | Waits for maps with structure (C4) |

## D. Enemies and boss (decided 2026-11-17)

Stats and art (§9.6) are unchanged unless noted.

### D1. Roster changes → SPEC §9.2, §9.5

| Enemy | New behavior |
|---|---|
| **Grunt** (Drone) | Unchanged |
| **Runner** (Skitter) | Unchanged: ignores knights and builds, bursts on the base. Caught in transit (mines, stuns, knockback) |
| **Brute** | **Build hunter:** goes straight for the nearest targetable build (HP builds, C3), **at any distance.** When none exist (or once it destroys them all) it walks toward the base and attacks knights like a Grunt. In v1 the targetable builds are the shield generator and the healing beacon, so a team without the Warden or Artificer only sees the fallback. Builds become Brute bait, which is a real tactic |
| **Siege** (Bombard) | Paths toward the base and **stops only when something is in range.** Target priority: **base > players > builds** (RC0, 2026-11-20; was players > builds > base), nearest within each; it retargets the moment a higher-priority target enters range. The team's main ranged threat to knights. Keeps the red landing marker before each shell |
| **Flyer** (Wasp) | **Range slightly increased.** Ignores ground builds (mines, nets, traps); melee can't hit it |
| **Swarm** (Scrap mites) | Unchanged |
| **Hunter** (Stalker) | **Senses hidden builds** (sees and avoids mines' trigger radii) and **stays out of range of damage-dealing builds**, reusing the field pricing that used to route it around tower range. **Speeds up once it targets a player.** Two phases so the speed-up means something: it stalks at normal speed until its quarry is within about 5 tiles, then locks on (the existing color flash at the quarry's feet) and sprints |
| **Colossus** | Boulders target players (decided). Wall Breaker needs a replacement (D2) |

- **Ranged enemies:** Siege's new targeting and the Flyer's range increase cover Foster's ranged-enemy
  note (C5). Revisit after playtesting.
- **Flyers spawn only if the team has a knight that can hit them** (a per-knight
  `hitsFlyers` flag; in v1 the Ranger and the Artificer). The current spec rule, checked the same way,
  so a melee-only team (Warden, Commander) or a solo melee knight never faces Flyers it can't answer.
- Enemy HP bars (F) and the per-wave enemy multiplier (C) apply to every type.

### D2. Colossus → SPEC §9.5, §9.6

- **Boulder throw targets players** (was towers). Slam, final-phase shockwave, calling Runners and the
  stagger meter are unchanged.
- **Wall Breaker is replaced by Charge,** added at **Mk II (wave 10)**: the Colossus locks on to a knight,
  a red lane marker shows its path, then it plows down the lane, knocking knights back and destroying
  any builds it crosses. Dodged, not tanked; punishes stacking builds in one spot.
- Each visit teaches one new move: **Mk I** (wave 5) slam and boulder; **Mk II** (wave 10) adds Charge;
  **Mk III** (wave 15) adds calling Runners and, in the final phase, the shockwave.
- **Art (§9.6):** the Wall Breaker tell is replaced by the Charge tell (head snaps to the target, it
  lowers the spiked yoke and paws the ground, red lane marker, then the run). Mk II's yoke and knuckle
  spikes already suit the pose.

### D3. Answered-by table (v1 kits) → SPEC §9.2

Every enemy must be answerable by at least two classes or by a baseline every team has.

| Enemy | Answered by |
|---|---|
| Grunt | Everyone |
| Runner | Ranger (bow, mines in its path), Warden (super stun), Commander (shield bash, squad at a flag on its route), Artificer (cone) |
| Brute | Warden (HP, stun), Ranger (kiting at range), Commander (squad); any targetable build pulls it off course |
| Siege | Ranger (outranges it), Commander (flag thrown beside it, squad dives in), Warden (HP to walk in) |
| Flyer | Ranger, Artificer, Citadel sentries (spawns only for teams that can hit it) |
| Swarm | Warden (arc), Artificer (spread), Ranger (mines) |
| Hunter | Warden (HP, stun), Commander (squad blocks it), Artificer (healing) |
| Colossus | Everyone (stagger meter) |

## E. Progression (decided 2026-11-17)

Card numbers are set in
playtesting.

### E1. Card rules → SPEC §6.1

- **Cards upgrade your knight; the shop upgrades the base.** Cards can now upgrade the knight's
  attacks, super, build, squad and passive (the old rule kept structures and squad stats out of cards).
  The team shop holds only base items.
- **Passive cards:** each knight has one **rare, unique passive card** (its old built-in passive, or a
  new one). Cards that improve a passive appear only once the player owns it, using the combo rule's
  prerequisite check.
- **Build cards:** each knight has two cards that upgrade its build.
- Unchanged: 3 cards per offer, no duplicates in an offer, common and rare, about 15% of offers include
  one rare, a guaranteed rare after boss waves, additive stacking, caps on range, speed and damage
  reduction, the picker's exclusion rules, status effects and card marks.
- Per-wave class growth (B4) shows as the header above the cards.

### E2. Shared commons (9)

Vitality, Might, Haste, Reach, Swiftness, Focus, Toughness, Quick Recovery (−2 s respawn; minimum 5 s,
4 s in solo) and **Tinkerer (new): +build charge rate.**

### E3. Knight cards

Code IDs: Engineer = Ranger, Quartermaster = Artificer.

**Ranger**

| Card | Tier | Effect | Change |
|---|---|---|---|
| Quick Draw | Common | Faster arrows | Kept |
| Blast Radius | Common | Larger shockwave | Kept; now applies to the shockwave super |
| Fire Arrows | Rare | Arrows apply burn | Kept |
| Piercing Shot | Rare | Arrows pass through the first enemy | Kept |
| Skyhunter | Rare | +50% damage vs Flyers | Kept |
| Volley | Rare | Every 4th shot fires 3 arrows in a spread | Kept |
| **Steady Aim** | Rare, unique | Passive card (the old built-in passive) | New |
| Deadeye | Rare | Steady Aim activates faster | Kept; requires Steady Aim |
| **Shrapnel Charge** | Common | Mines trigger faster and hit a wider area | New build card |
| **Minefield** | Rare, unique | +1 active mine | New build card |
| Wildfire (Fire Arrows + Piercing Shot) | Combo | Burning enemies burst into flames on death | Kept |

**Warden**

| Card | Tier | Effect | Change |
|---|---|---|---|
| Heavy Slam | Common | Wider slam arc | Kept |
| Earthshaker | Common | Longer super stun (no extra boss stagger) | Kept |
| Aftershock | Rare | Slam leaves a brief slowing zone | Kept |
| Giant Slayer | Rare | +50% damage vs Brutes and the Colossus | Kept |
| Unshakable | Rare | Immune to slows and knockback | Kept |
| **Challenger** | Rare, unique | Passive card: nearby enemies target the Warden first | New |
| **Wide Field** | Common | Larger shield generator radius | Replaces Bodyguard |
| **Reinforced Generator** | Rare | More generator HP and a stronger damage reduction | New build card |
| **Fault Line** (Aftershock + Earthshaker) | Combo | The super leaves a long slowing fissure along its arc | Reworked (walls are gone) |
| ~~Master Mason~~ | | | Removed (no walls) |

**Artificer**

| Card | Tier | Effect | Change |
|---|---|---|---|
| Venom Bolts | Rare | Nanites apply poison | Kept |
| Overflow | Rare | Healing beyond full HP becomes a temporary shield | Kept |
| Triage | Rare | Double healing on knights below 30% HP | Kept |
| **Field Medic** | Rare, unique | Passive card (the old built-in passive) | New |
| Wide Aura | Rare | Larger Field Medic radius | Kept; requires Field Medic |
| Strong Arm | Common | Longer, faster build throws | Same name, new effect |
| **Booster Beacon** | Common | The healing beacon heals faster and has more HP | New build card |
| **Plague** (Venom Bolts + Field Medic) | Combo | Poisoned enemies spread poison when they die | Prerequisites changed (was Venom Bolts + Wide Aura) |
| ~~Light Load, Bulk Buyer~~ | | | Removed (no crates) |

**Commander**

| Card | Tier | Effect | Change |
|---|---|---|---|
| **Heavy Bash** | Common | Wider shield bash, stronger knockback | Replaces Bladework |
| Forced March | Common | The squad moves faster | Kept |
| Siege Breakers | Rare | Squad deals +50% damage vs Siege | Kept |
| Veterans | Rare | Soldiers who survive a wave permanently gain stats | Kept |
| Last Stand | Rare | The squad deals more damage the fewer soldiers are left | Kept |
| Vanguard | Rare | The Commander takes less damage while his squad is near | Kept |
| **Rally Cry** | Rare | The super has a **50% chance** to spawn 2 soldiers instead of 1 (rolled from the seeded RNG). Stacks: +25% per extra copy, up to 100%. The TV shows "×2" on a double spawn | New effect |
| Warcry (Rally Cry + Vanguard) | Combo | The super also briefly boosts nearby knights | Kept |
| **Morale** | Rare, unique | Passive card: see below | New |
| **Drillmaster** | Common | Soldiers get more HP and damage (stacks) | New; replaces the shop's squad stats |
| **Reinforced Ranks** | Rare, unique | +1 squad cap | New |

- **Morale and Lead from the Front are merged into one card, "Morale."** Lead from the Front (squad
  deals more damage near him) was a smaller version of Morale (allies near the flag or near him gain
  damage, attack rate and movement speed; the two areas don't stack). One passive per knight, like the
  others. Morale needs no TV visual of its own; the Lead from the Front motes are removed.

### E4. Team shop → SPEC §6.2

| Item | Tiers | Notes |
|---|---|---|
| Base repair | Repeatable | Price rises with each purchase |
| Sentry damage | 1 | Kept |
| Sentry range | 1 | Kept |
| Third sentry | 1 | Kept |
| **Base max HP** | 3 | New |
| **Base armor** | 3 | Was Quartermaster-only; now a team item |

- Removed: supply crates, tower and wall tiers, snare charges, spiked walls, the emergency repair kit,
  Commander squad stats (now cards).
- **Pricing (Foster, 2026-11-17):** about 10 purchases per run, priced so the team **can't afford much
  in the first couple of waves.** Starting target: the cheapest item (repair) becomes
  affordable after wave 2; a sentry upgrade or tier I after about wave 3–4; the third sentry and tier
  III items need saving across several waves. Tune coin income and prices together in the balance
  sheet.

## F. Controls and UI (decided 2026-11-17)

### F1. Action button = build button → SPEC §10.1

- **Removed:** the context-sensitive priority table (rows 1–7), the build arc, Give/drop and every
  crate action.
- **Gesture follows the build's input type (C2):** at-feet builds are tap-type (tap to place); thrown
  builds are aimed sticks (drag to aim, release to throw, quick tap auto-targets, slide back into the
  dead zone to cancel). The TV aim preview shows the landing spot as a 0.6 ground ellipse at the
  build's real effect radius, plus its throw range.
- **Build meter ring:** fills clockwise around the button, like the super ring. The button is dimmed
  until full. **Full = a steady amber ring, no pulse** (the super pulses, so the two read differently).
  **No build-ready indicator on the TV.**
- **Commander:** with a flag out and the meter not full, the icon switches to recall and a tap recalls the
  flag; with the meter full, the button throws a new flag.
- **Size: 60 px** (was 56 px; RC1 trimmed the first 68 px), keeping the 24 px minimum gaps and edge
  margins; the cluster is re-laid at (−134, +24) so no label meets a button.

**Input type per knight**

| Knight | Main | Super | Build |
|---|---|---|---|
| Ranger | Aimed | Tap (shockwave from himself) | Tap (mine at feet) |
| Warden | Aimed | Aimed | Aimed (thrown) |
| Artificer | Aimed | Aimed | Aimed (thrown) |
| Commander | Aimed | Aimed (soldier thrown a short distance; a quick tap aims toward the flag) | Aimed (thrown); tap recalls when the meter isn't full |

### F2. Build-phase screens → SPEC §10.2, §10.3

1. **Card pop-up** (full screen, no stick): class growth header ("Wave 4 cleared: +HP +DMG"), the three
   cards with rarity frames, **tap a card to select, then tap Confirm**, and the phase timer.
2. **Shop** (right 2/3; movement stick on the left third): team coins, item rows with price,
   hold-to-confirm and Request, and **Ready** at the top right. No tabs.
3. **Build-phase cap: 20 s** (A5 said 30 s; shortened because the shop is thin), ending early when
   every player is Ready. A card not confirmed by the deadline is picked at random.

### F3. Combat status strip → SPEC §10.1

HP and base HP. The crate count is removed; the build meter lives on its button.

### F4. TV → SPEC §2.6, §9.4

- **HUD** unchanged except: the **next-wave preview** shows enemy types and counts but **never the hot
  side**; lane warning bands become the **portal flare** (about 1 s).
- **Enemy HP bars:** shown only once damaged (hidden at full HP); a thin bar above the sprite with a
  violet fill (violet = enemy; red stays for danger markers); width scales with enemy size. **Scrap mites
  have none.** The Colossus keeps its bottom-edge bar.
- **Build HP bars:** same rule, amber fill. The shield generator and healing beacon show their effect
  radius as a faint dotted amber 0.6 ground ellipse.
- **Mines** are drawn translucent.
- **Brute target cue:** a brief violet flash at the build a Brute locks on to.
- **Rally Cry:** "×2" pops over the soldiers on a double spawn.
- **Colossus Charge:** red lane marker before the run (D2).

### F5. Art → SPEC §2.4, §3.6, §7.1, §9.6

| Reused | Kept on file, unused in v1 (build pool) | New |
|---|---|---|
| All four knights, every enemy, the Citadel and sentries, the flag and footmen, the Ranger's pulse ring (now the shockwave super), the Artificer's heal cone, most icons, the UI kit | Pulse turret, mortar tower, walls and charged walls, shock nets, the Fortify dome, the build ghost, sealed-lane gates | **6 portals** (violet ring on the map edge plus the flare), **shield generator**, **healing beacon**, **mines**, the **Commander's shield** and bash animation, the **Warden's jump** before the slam, the **Colossus Charge** tell, enemy and build HP bars, the build-meter ring, build icons (`act-*` per build plus recall), new card icons |

- **Removed outright:** the Armory kiosk and pad, the repair zone pad, power-cell crates, crate
  carry/throw animations and crate icons.
- **Artificer backpack gauge → build meter:** its three cells fill as the build meter charges; all three
  lit means the beacon is ready. Keeps "class mechanics show on the body" (§2.4).

## G. Name, themes, difficulty, tuning (decided 2026-11-17)

- **G1. Name:** stays **Fort Frenzy** (`fort-frenzy.fostercurtis.dev`, app folder and game ID
  unchanged).
- **G2. Theme layer removed.** Pillow Fort will never ship, so there is one look. The display names
  become the code IDs (`ranger`, `warden`, `artificer`, `commander`; `engineer` and `quartermaster`
  disappear), the theme table in §2.1 and the Pillow Fort row in §13 are removed, and §2.2's
  per-theme default difficulty goes away (Normal is the default). Whether the `art/neon-knights/` folder
  is flattened is a build decision.
- **G3. Difficulty** (§2.2): Easy, Normal and Hard still multiply the wave budget, enemy HP and damage,
  base HP and coin income, and now also **respawn time** (for example, shorter on Easy). Order of
  application: difficulty × player-count table (A3) × per-wave enemy multiplier (C).
- **G4. Tuning:** every remaining number (class HP and damage, build charge rates, prices, hot-side
  share, squad cap, regen, ranges) lives in `src/content/balance.ts` and is set in playtesting. The spec
  states starting values and stops there.

## Migration impact (so far: group A)

For the agent to turn into §15 updates and redesign milestones. Paths are indicative.

| Change | Spec | Code areas |
|---|---|---|
| Lanes → 6 portals; remove lane unlocks and sealed gates | §3.1, §9.4 | `src/content/map.ts`, wave data in `src/content/balance.ts`, `src/host/systems/waves`, map art (sealed gates) |
| Lane glow → about 1 s portal flare | §9.4 | waves system, TV render |
| Hot-side schedule and per-group hot sides; `players + 1` active portal cap | §9.3, §9.4 | waves generator, wave data |
| Scaling formula → lookup table (budget, boss HP, respawn) | §9.4, §5 | `src/content/balance.ts` (`scaling`, `respawnMs`), boss HP |
| 1–6 players, lobby minimum 1 | §11.1, §12 | lobby / party logic, controller lobby screen |
| Card pop-up → shop (2/3 width) with movement stick; Build tab removed | §10.2, §10.3 | `src/controller/screens/build.ts`, shop UI |
| Build phase 45 s → 20 s; random card pick at timeout | §4, §10.2 | lifecycle, balance |
| Delayed regen (4 s, 8%/s ticks), runs in the build phase | §5 | stats / effects, players |
| Repair only from the shop (crate repair removed) | §3.4 | shop, crates (more in group B) |
| Tower-targeting attacks retarget players | §3.3, §9.2 | `src/host/sim/ai`, `src/host/sim/boss` |
| Builds: one active per knight, HP/charge-based, persist between waves | §7 | replaces `building.ts`, `structures/`, snapshot contents (details in group C) |
| Build meter: hybrid passive + action charge, per knight; build damage charges the super only | §8, §6.1 | `src/host/sim/state.ts` (`afterDamage`, next to the super charge), player state, `balance.ts` per-knight rates, modifiers (`buildCharge` stat) |
| Remove crates, Armory, repair zone, carry/give/throw, Quartermaster supply perks and items | §3.4, §5, §6, §10.1 | `src/host/sim/crates.ts`, shop, action-button intents, controller screens, snapshot fields, Armory and power-cell art |
| Team shop trimmed to base, sentries (and squad, per group C) | §6.2 | `src/host/sim/shop`, `balance.ts` shop entries |
| Coin income lowered | §9.1 | `balance.ts` coins per kill |
| Per-wave class growth | §6.1 | cards / modifiers, card pop-up header |
| Enemy HP bars (requested) | §2.6, §9.6 | TV render, world UI |
| Classes (tank, marksman, support, control) modeled separately from knights; class sets HP tier, damage band, growth | §2, §8 | `src/host/sim/classes`, `balance.ts`, catalog |
| Build input per build, using the attack input grammar | §8, §10.1 | controller combat screen, `players.ts` input handling, aim preview |
| Builds targetable like knights (HP builds only), fixed HP, start full | §7, §9 | `src/host/sim/ai` targeting, aggro/leash |
| No player walls in v1: static ground field; remove placement rebuilds and the `breaker` field | §7, §15.5 | `src/host/systems/flowfield`, `building.ts`, Brute and Colossus AI |
| Enemy roster changes (Brute build-hunter, Siege targeting, Flyer range, Hunter senses mines and sprints, `hitsFlyers` spawn rule) | §9.2 | `src/host/sim/ai`, Hunter field pricing, wave generator |
| Colossus Charge replaces Wall Breaker | §9.5, §9.6 | `src/host/sim/boss`, boss art |
| Card list rework, passive and build cards, prerequisite on passives, Tinkerer | §6.1 | `src/content/cards`, card picker, modifiers |
| Team shop: base max HP and armor tiers; pricing curve | §6.2 | shop, `balance.ts` |
| Action button = build button (60 px, meter ring, per-build input type) | §10.1 | `controller-kit` usage in the combat screen, input handling, aim preview |
| Card pop-up + shop screen (no tabs, stick on left third) | §10.2, §10.3 | `src/controller/screens` |
| Portals, shield generator, healing beacon, mines, Commander shield, Warden jump, Charge tell, HP bars, backpack gauge as build meter | §2.4, §2.6, §9.6 | art and renderer |

Replay goldens and the seeded-run fixtures will break; expect to regenerate them.
