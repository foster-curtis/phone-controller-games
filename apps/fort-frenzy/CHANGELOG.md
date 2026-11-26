# @pcg/fort-frenzy

## 2.0.0

### Major Changes

- 8fc4681: Players-only redesign begins: relay protocol 2 (knights are ranger and artificer on the wire), old saved runs are dropped, the theme layer and theme row are gone

### Minor Changes

- 7e5a5ea: Fort Frenzy: Brutes hunt builds, Siege and Hunter retarget smarter, and the Colossus learns its Charge
- 2dd8515: Resume, soak and bench for the redesign: a real run of every knight survives a TV reload (builds, mines, flags, meters, squads, growth), late joiners get a full meter and a Commander his soldiers, the soak plays every knight solo and resumed runs, and the stress mode and bench hold 24 real builds
- 6bb8133: Artificer kit: nanite blast, heal cone, healing beacon, backpack gauge as build meter, and his cards
- 8ccc76d: Slice wiring: the card pop-up's class growth header; debug panel fills one knight's build meter, forces the hot side and shows portal activity; new __pcg build, meter, preview and portal hooks
- 1210f27: Sound for the redesign: mine, shield, beacon, portal flare, Brute lock-on, Charge wind-up, jump-slam landing and Rally Cry double cues
- dc4d2ef: Redesign art: shield generator, healing beacon and mine builds, violet portals, the Commander's shield and sheathed sword, Warden slam cracks and jump-landing dust, Colossus Charge dust, the Ranger's shockwave, and new build, role, card and shop icons.
- a035d19: Art pass: the gallery shows every build state, portal and new effect; the retired Armory, power cell and crate art is deleted
- be57093: The TV draws builds through their whole life (flight, landed, active, damaged, wreck and scrap), the shield generator with its footprint and shimmering dome, portals flare before a spawn, damaged enemies and builds show HP bars, thrown builds preview their landing, and the Warden's slam and jump slam use the new hammer-down art with cracks and landing dust.
- 7188e26: Ranger kit: mines, shockwave art, Steady Aim as a card, Shrapnel Charge and Minefield
- 5e472cf: Phone: 68 px build button with meter ring and aimed or tap gesture, card pop-up with Confirm, shop with the movement stick, knight cards show role and build, solo Start
- 225c2f2: Players-only redesign: crates, structures, the build arc and lanes are gone; enemies pour in from six always-live portals, and the action button becomes the (not yet active) build button.
- 9a942a7: Economy: Tinkerer and the Warden's cards (Challenger, Wide Field, Reinforced Generator, Fault Line), per-wave class growth, a lower coin income and the team shop's new price curve
- 73c774e: Commander kit: shield bash, aimed Reinforcements, thrown rally flag with recall, a squad that no longer respawns, and his cards (Morale, Rally Cry doubles, Drillmaster, Reinforced Ranks, Heavy Bash).
- bf74c7e: Sim slice: builds and the build meter, the Warden's shield generator and jump slam, delayed regen, class damage bands, the player-count table and Quick Recovery floors, hot sides with spawn pulses and the active-portal cap, the 20 s build phase with a random card pick, solo play, and the balance harness.

### Patch Changes

- f94aa3e: Card pop-up growth header shows the amounts each stat grew (+3% HP +1% DMG)
- 58a7644: Portal flares now flicker like unstable energy instead of glowing steadily.
- 55beeb5: TV home screen rows (Create room, difficulty, resume, new run) now work with a mouse click, and hover moves the focus highlight
- 7bcd5d1: Commander: his squad walks a little slower than him, and the shield bash is a longer, wide rectangle with less knockback.
- 800451b: The Wasp drone is drawn larger and flies a little lower; the Colossus staggers a little less often.
- 6b7e1eb: Warden's hammer smash hits a narrower cone (102° to 68°) at the same reach; the aim preview matches.
- a83b6f8: Knights keep facing their attack until its animation ends; the next-wave banner fits every enemy.
- d284e75: Enemies can no longer be knocked or pushed off the map: an invisible wall on the map's edges holds them in, while portal spawns still walk in.
- 0c6a961: Enemies that lose their target head on for the base from where they stand, fight the Commander's soldiers like knights, and burning enemies show a flame sized to their body.
- 705949f: Footmen slash their swords in an arc when they attack, instead of a short stab.
- 5ee274e: The TV draws the game world larger: the map now fills the screen width (about 9% bigger)
- 06c12a2: Warden's hammer smash reaches farther with no knockback, his jump slam is quicker, and every throw flies at one shared speed.
- 23c07f4: Warden jump slam narrowed to 85°; when every enemy is down mid-wave, the next group flares at once and arrives a second later
- f2e5680: Phone: the shop uses the full right two-thirds as one column, and the build button is smaller with no overlapping labels
- eb606fc: Pause menu: Leave game for every player and End game for the party leader, each behind a confirm step.
- 31ea8ab: Debug panel: list the knights in play with their cards and give any knight a card (__pcg.giveCard)
- ebd9acf: Commander: soldiers walk slower (about 80% of his speed) and regroup faster; shield bash 25% narrower with 10% less knockback
- ba328d6: Coin income scales with player count: smaller teams earn more per kill, so every team size can afford about 10 shop items a run.
- d4915a2: Burn and corrosion flames on enemies are sized halfway between the old full-height look and the smaller RD10-fix-1 look.
- d0d9e13: Warden RC1 fixes: a 2 s jump slam, Aftershock slows on the super, no knockback on stunned targets, a longer shield throw, and regen waits 5 s after damage or attacking
- f55544b: Knight select: a short horizontal swipe anywhere on the screen changes the knight; taps on the card buttons keep working

## 1.2.0

### Minor Changes

- 4c40cde: Manual full-screen buttons on the phone and the TV (no automatic full screen), a controller web manifest, the diagnostics overlay and a TV reconnecting indicator

### Patch Changes

- Updated dependencies [aca5b70]
- Updated dependencies [3ea2b59]
- Updated dependencies [0c3fb63]
- Updated dependencies [8e06bff]
- Updated dependencies [fab8bc6]
- Updated dependencies [ed800a8]
- Updated dependencies [8e06bff]
- Updated dependencies [9d65c97]
  - @pcg/controller-kit@0.2.0
  - @pcg/game-kit@0.2.0
  - @pcg/net-client@0.2.0

## 1.1.0

### Minor Changes

- d6d1029: The final screen shows a QR to the feedback survey, and every phone gets a Give feedback button that opens it in a new tab

### Patch Changes

- ea99e0e: The Game full note reads "holds 6 players"; title and player range now come from game.meta.ts

## 1.0.0

### Major Changes

- Launch: Fort Frenzy 1.0.0 is live

## 0.3.0

### Minor Changes

- 6ed4064: Run lifecycle: end-of-run options, late joins at the build phase, and resume after a TV reload or crash (same room or a new one, phones matched by device ID or a claim)
- 6883452: Team pause: any player can pause the whole run from the phone's top bar, and anyone can resume; the TV shows who paused

### Patch Changes

- 9cf605e: Wasp flies at half height; shots, swings and blasts hit an enemy's whole drawn body (not just its feet), the Colossus kept low
- 83893ff: Fix the stress mode overlay crashing on rigs with code-drawn extras (?debug=1&stress=1)
- cf95d88: Bolts render at their balance speed
- 0fc01fb: Ranger aim preview is a transparent amber bar the width of the bolt's hitbox (C4)
- 23c7515: Faster sim at peak load (separation, stats, hooks), a full-run soak, a real-peak bench and an in-game stress mode (?debug=1&stress=1)
- 685550b: Colossus ignores stuns for 4 s after a stagger (no Warden stun-lock); the Warden's super charges a little slower
- 0efa920: Aimed attacks cancel only on a release in a wider center grace zone; dragging back out re-arms the attack and the TV aim line shows again
- a79b3a7: The TV aim line hides as soon as a held aimed attack or super is cancelled

## 0.2.0

### Minor Changes

- c8c0757: Show the game version in a corner of the TV, and on the phone's join and lobby screens

## 0.1.0

Starting version: Fort Frenzy in build, before launch. Changesets tracks every change from here.
