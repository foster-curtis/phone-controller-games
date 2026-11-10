// The §2.5 projection's one ratio, shared by the renderer (camera) and the sim (body hitboxes, C4):
// a tile is W wide and 0.6 W deep, so a part drawn h tiles above the feet sits over the ground
// h / 0.6 tiles up the screen (SPEC §2.5, §15.3).

/** Ground depth ratio: a tile is W wide and 0.6 W deep. */
export const GROUND_SQUASH = 0.6;
