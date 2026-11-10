// The TV's aim preview geometry (SPEC §10.1, §15.2; C3): a player's attack hit shape from the same
// effective stats the sim fires with (`attackStat` with the registry's effects and the run's stat
// caps), so content tuning and cards move the preview with the hit area. Pure on the player.
import type { CharacterDef, RulesDef } from '../../content/types';
import { hitShape, type HitShape } from './classes/hitShape';
import { effects } from './registry';
import { attackStat, type Caps } from './stats';
import type { PlayerEnt } from './types';

export function aimPreview(
  p: PlayerEnt,
  def: CharacterDef,
  slot: 'main' | 'super',
  rules: Pick<RulesDef, 'statCaps'> | null,
): HitShape {
  const caps = (rules?.statCaps ?? {}) as Caps;
  return hitShape(def[slot], (b, st) => attackStat(p, b, st, slot, effects, caps));
}
