// Tower threat for the Hunter's fields (C3 note, FF10-fix-1; SPEC §9, §15.5): the Hunter is smarter
// than other units and takes routes that keep out of tower range where it can. Each tile counts the
// attackers (towers that shoot, the Citadel's sentries) whose range covers it; the per-hunted-player
// field adds content's `hunt.threatCost` per covering attacker to the ground cost, so a detour wins
// whenever it's cheaper than the time spent under fire, and the Hunter still reaches a target
// standing in range.
// Rebuilt with the flow fields (a structure placed or destroyed, and each combat start, so range
// cards and sentry upgrades bought in the build phase count).

export interface Attacker {
  x: number;
  y: number;
  range: number;
}

/**
 * Fills `into` (cols × rows) with how many attackers cover each tile: its center within range +
 * `pad` (content `hunt.threatPad`: half a tile diagonal + a body).
 */
export function threatMap(
  cols: number,
  rows: number,
  attackers: readonly Attacker[],
  into: Float32Array,
  pad: number,
): Float32Array {
  into.fill(0);
  for (const a of attackers) {
    const r = a.range + pad;
    const r2 = r * r;
    const c0 = Math.max(0, Math.floor(a.x - r));
    const c1 = Math.min(cols - 1, Math.floor(a.x + r));
    const r0 = Math.max(0, Math.floor(a.y - r));
    const r1 = Math.min(rows - 1, Math.floor(a.y + r));
    for (let row = r0; row <= r1; row++) {
      const dy = row + 0.5 - a.y;
      for (let col = c0; col <= c1; col++) {
        const dx = col + 0.5 - a.x;
        const t = row * cols + col;
        if (dx * dx + dy * dy <= r2) into[t] = into[t]! + 1;
      }
    }
  }
  return into;
}
