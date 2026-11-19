# Art the redesign leaves behind (REDESIGN.md §F5)

Nothing here has been deleted or edited. The atlas script still packs all of it, because `sprites.json` and the rigs still name it. Removing the files, their `sprites.json` entries and the icons from the build is a build decision: the renderer, gallery and tests still reference several of them. Paths are relative to `art/neon-knights/`.

## Kept on file, unused in v1 (the build pool)

| Piece | Files |
|---|---|
| Pulse turret | `structures/pulse-turret/**` (30 SVGs: heads `base`/`ii`/`iii` × 8 aims, pedestals, bands, `dmg`) |
| Mortar tower | `rigs/mortar.json`, `structures/mortar/**` (13 rig parts), `effects/mortar-shell.svg` |
| Walls and charged walls | `structures/wall/**` (64 SVGs: `m0-15`, `rail/`, `charged/`, `dmg/`), `effects/wall-strike.svg` |
| Shock nets | `structures/shock-net/**` (16 SVGs), `effects/shock-crawl.svg` (the netted-enemy slow) |
| Fortify dome | `structures/fortify/back.svg`, `structures/fortify/front.svg` |
| Build ghost | `structures/build-ghost/valid.svg`, `structures/build-ghost/blocked.svg` |
| Tower base plate and defense bonus | `structures/plate/tile.svg`, `effects/defense-bonus.svg` (only towers stood on them) |
| Sealed-lane gates | `map/lane/bottom-sealed.svg`, `map/lane/left-sealed.svg`, `map/lane/right-sealed.svg` |
| Build-pool icons | `icons/turret.svg`, `mortar.svg`, `wall.svg`, `net.svg`, `fortify.svg`, `turret-rate.svg`, `mortar-radius.svg`, `tower-hp.svg`, `wall-hp.svg`, `charged-walls.svg`, `net-charges.svg`, `act-place.svg` |
| Review sheets for the above | `review/pulse-turret/`, `review/mortar/`, `review/tower-looks.svg`, `review/wall-autotiles.svg`, `review/net-autotiles.svg` |

## Removed outright

| Piece | Files |
|---|---|
| Armory kiosk and pad | `structures/armory/kiosk.svg`, `structures/armory/pad.svg`, `review/armory.svg` |
| Repair zone pad | `structures/citadel/repair-zone.svg` |
| Power-cell crates | `structures/power-cell.svg` (also the thrown-cell frame) |
| Crate carry/throw (no rig parts; these are the art pieces they used) | `effects/carry-pip.svg`, `effects/carry-pip-empty.svg`, `review/carry-pips.svg`, and the `carry` attach point on each knight rig (left in place; nothing uses it once crates go) |
| Crate icons | `icons/cell.svg`, `act-pickup.svg`, `act-deliver.svg`, `act-buy.svg`, `act-throw.svg`, `act-give.svg`, `act-drop.svg` |

## Replaced by new art (my reading of §A2 and §F5; §F5 doesn't list these)

| Old | New |
|---|---|
| `map/lane/bottom-open.svg`, `left-open.svg`, `right-open.svg` | `map/portal/<bottom\|left\|right>-<idle\|flare>.svg` (same anchors) |
| The Commander's drawn sword (`commander/*/sword`, `sword-glow`, `swordtip`, `swordtip-glow`) | Kept in the rig as the optional group `sword` (off); the default look is the shield + sheathed sword |

## Open for the build agent

- `icons/repair.svg` (Base repair) and `icons/emergency-kit.svg` belong to the shop. They stay unless the shop drops base repair; §F5 doesn't say.
