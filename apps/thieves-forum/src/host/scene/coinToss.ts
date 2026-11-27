// Coin toss on the TV (SPEC §6.9, §6.16 "coin toss arc and glint"): TF13 fills this module from the
// `coinToss` / `coinLanded` / `coinPicked` TV events. Empty at TF12, wired into the market scene.
import type { SceneModule } from './modules';

const coinToss: SceneModule = {};

export default coinToss;
