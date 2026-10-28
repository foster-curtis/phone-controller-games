# Fort Frenzy icons (neon knights)

- 24-unit glyphs. Layers: `.glyph` (bone fill), ink cut-ins, `.glow` (amber parts that glow).
- **Lit badge:** place the glyph at 1.6x inside `badge-tile.svg` (52 x 52, inset 6.8). Active, selected and
  ready states use `badge-tile-active.svg` plus a glow on the tile edge.
- **Glyph only:** where space is tight (TV announcements, wishlist rows, inline text), use the glyph without the tile.
- **Dimmed:** the action button with nothing to do shows the glyph at 35% opacity on the plain tile.
- **Glow:** on the phone, `filter: drop-shadow(0 0 2px var(--glow))` on `.glow`. On the TV the bloom pass picks up the amber.
- Theme packs replace these files under the same names.

## Icons

- **Classes (helms):** `class-warden` (Warden), `class-ranger` (Ranger), `class-commander` (Commander), `class-artificer` (Artificer)
- **Main attacks:** `main-warden` (Ground slam), `main-ranger` (Rail-bow shot), `main-commander` (Sword slash), `main-artificer` (Nanite bolts)
- **Supers:** `super-warden` (Stomp), `super-ranger` (Pulse shot), `super-commander` (Rally (morale)), `super-artificer` (Nanite cone)
- **Structures:** `cell` (Power cell), `turret` (Pulse turret), `mortar` (Mortar tower), `wall` (Wall), `net` (Shock net), `fortify` (Fortify)
- **Action button (SPEC §10.1):** `act-pickup` (Pick up), `act-deliver` (Deliver to the gate), `act-buy` (Buy a cell), `act-place` (Place structure), `act-throw` (Throw a cell), `act-flag` (Plant rally flag), `act-recall` (Recall squad), `act-give` (Give a cell), `act-drop` (Drop a cell)
- **Shop, HUD and lobby:** `coins` (Team coins), `repair` (Base repair), `emergency-kit` (Emergency repair kit), `base-armor` (Base armor), `sentry-damage` (Sentry damage), `sentry-range` (Sentry range), `sentry-third` (Third sentry), `squad` (Squad stats), `turret-rate` (Pulse turret fire rate), `mortar-radius` (Mortar blast radius), `tower-hp` (Tower armor), `wall-hp` (Wall and net armor), `charged-walls` (Charged walls), `ready` (Ready), `request` (Request (wishlist)), `net-charges` (Snare charges), `leader` (Party leader), `overflow-shield` (Overflow shield)
- **Upgrade card marks (SPEC §6.1):** `card-vitality` (Vitality (+max HP)), `card-might` (Might (+damage)), `card-haste` (Haste (+attack speed)), `card-reach` (Reach (+range)), `card-swiftness` (Swiftness (+move speed)), `card-focus` (Focus (+super charge)), `card-toughness` (Toughness (less damage)), `card-recovery` (Quick Recovery (faster respawn)), `card-attack` (Main attack card), `card-super` (Super card), `card-passive` (Passive card), `card-effect` (Status effect card (burn, poison, slow)), `card-hunter` (Bonus vs an enemy type), `card-ally` (Ally support card), `card-supply` (Supply card), `card-squad` (Squad card), `card-combo` (Combo card)
- **Also:** `reconnecting` (Reconnecting, on a disconnected player's TV nametag, §11.3)
