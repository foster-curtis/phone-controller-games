// Per-rig sizes the gallery and stress mode use until content (FF6) supplies hitboxes: hitbox radius
// in tiles, body and leg height in sprite units (status looks), shadow radii in sprite units (§2.5:
// knight about 22 × 13, Colossus about 60 × 36), flying height in tiles.

export interface RigInfo {
  hitbox: number;
  bodyH: number;
  legH: number;
  shadow: [number, number];
  fly?: number;
  /** Player ring radius in tiles (knights). */
  ring?: number;
}

export const RIG_INFO: Record<string, RigInfo> = {
  warden: { hitbox: 0.42, bodyH: 110, legH: 30, shadow: [22, 13], ring: 0.68 },
  ranger: { hitbox: 0.36, bodyH: 115, legH: 32, shadow: [20, 12], ring: 0.68 },
  commander: { hitbox: 0.38, bodyH: 112, legH: 30, shadow: [21, 12.6], ring: 0.68 },
  artificer: { hitbox: 0.38, bodyH: 100, legH: 28, shadow: [22, 13], ring: 0.68 },
  footman: { hitbox: 0.24, bodyH: 56, legH: 16, shadow: [12, 7.2] },
  drone: { hitbox: 0.36, bodyH: 80, legH: 24, shadow: [20, 12] },
  skitter: { hitbox: 0.3, bodyH: 50, legH: 20, shadow: [22, 13] },
  brute: { hitbox: 0.55, bodyH: 125, legH: 36, shadow: [32, 19] },
  bombard: { hitbox: 0.55, bodyH: 120, legH: 40, shadow: [36, 21.6] },
  wasp: { hitbox: 0.32, bodyH: 50, legH: 20, shadow: [18, 10.8], fly: 1.6 },
  mite: { hitbox: 0.12, bodyH: 22, legH: 8, shadow: [8, 4.8] },
  stalker: { hitbox: 0.38, bodyH: 70, legH: 30, shadow: [26, 15.6] },
  colossus: { hitbox: 1.2, bodyH: 280, legH: 90, shadow: [60, 36] },
  mortar: { hitbox: 0.5, bodyH: 90, legH: 20, shadow: [0, 0] },
};
