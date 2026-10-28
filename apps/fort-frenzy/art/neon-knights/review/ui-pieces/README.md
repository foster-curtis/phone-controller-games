# Fort Frenzy UI pieces

Drawn pieces for shapes that are awkward to build in CSS or Phaser. Colors are the brand.css tokens.

| File | Use |
|---|---|
| `card-common.svg` | Upgrade card frame, common rarity: gunmetal edge (220 x 320, chamfer 14). |
| `card-rare.svg` | Upgrade card frame, rare: amber edge plus an inner amber line. |
| `card-selected-glow.svg` | Glow halo for the selected card. Layer it under the frame (it has a 14 px pad on every side). |
| `button-primary.svg`, `button-primary-glow.svg` | Amber button (Join, Ready, Take, Place); the glow version for the focused or main action. |
| `button-secondary.svg` | Gunmetal button (Cancel, Change classes). |
| `button-outline.svg` | Gunmetal button with an amber edge (Ready while building, Start, Buy). |
| `panel.svg` | Chamfered panel (lineup, wishlist, ready status, wave preview). |
| `badge-tile-active-glow.svg` | The lit-badge tile in its active state with the glow baked in (8 px pad). |

## How to use them

- **Phone (DOM):** prefer CSS, which sizes freely:
  - `clip-path: var(--clip-chamfer)` (or `--clip-chamfer-sm`) on a filled element;
  - plus `filter: drop-shadow(...)` for glow.
  Use these SVGs where an outline has to follow the chamfer, which CSS borders can't do.
- **TV (Phaser):** load the SVGs as nine-slice textures. Margins are 10 for buttons, 14 for panels, 16 for cards, so the corners keep their size at any width. Drop the glow versions there: the bloom pass makes the glow.
- **Super charge ring:** draw it in code. It's a progress arc around the round super button (SPEC §10.1).
- **HP bars and other bars:** draw them in code too.
