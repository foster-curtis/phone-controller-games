// Arc and cone hit tests (SPEC §8: sword slash, nanite cone): a circle of radius `r` at (x, y) is hit
// when it reaches within `range` of the apex and its edge lies inside the sector's angle. Leaf
// module: plain math, shared with the TV's glints (render reads the same geometry).

export interface Sector {
  x: number;
  y: number;
  /** Direction, radians (world-ground angle). */
  angle: number;
  /** Half the opening, radians. */
  half: number;
  range: number;
}

/** Signed smallest difference a − b, in −π..π. */
export function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

export function inSector(s: Sector, x: number, y: number, r: number): boolean {
  const dx = x - s.x;
  const dy = y - s.y;
  const d = Math.sqrt(dx * dx + dy * dy);
  if (d - r > s.range) return false;
  if (d <= r) return true;
  // The circle's angular half-width widens the sector a little, so edges count.
  const slack = Math.asin(Math.min(1, r / d));
  return Math.abs(angleDiff(Math.atan2(dy, dx), s.angle)) <= s.half + slack;
}
