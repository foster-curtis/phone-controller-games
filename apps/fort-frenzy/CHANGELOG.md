# @pcg/fort-frenzy

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
