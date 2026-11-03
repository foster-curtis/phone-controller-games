// The Ranger's code-drawn bowstring (SPEC §2.4; C2 note 1): the `ready` art bakes the drawn string,
// the nocked bolt and the rails into one glow piece, so while the attack clip darkens that piece
// (the draw, the release and the next nock) the slack and snapping string is drawn here, riding on
// the bow. Drawn into the rig's overlay, so it moves, mirrors and sorts with the rig.
import { theme } from '../../shared/theme';
import { bowString } from './clips/ranger';
import type { RigSprite } from './rig';

/** Same weight as the art's string line, in rig units. */
const STRING_W = 1.6;

/** Redraws the string for this frame (clears it when the art string shows). Call after rig updates. */
export function drawBowString(rig: RigSprite) {
  const on = rig.rigId === 'ranger' && rig.clip === 'attack' && rig.pose === 'ready';
  const s = on ? bowString(rig.view, rig.clipT) : null;
  if (!s && !rig.hasOverlay) return;
  const g = rig.overlay();
  g.clear();
  if (!s) return;
  const top = rig.partPoint('bow', s.top);
  const nock = rig.partPoint('bow', s.nock);
  const bottom = rig.partPoint('bow', s.bottom);
  if (!top || !nock || !bottom) return;
  g.lineStyle(STRING_W, theme.color.amber.num, s.alpha);
  g.beginPath();
  g.moveTo(top[0], top[1]);
  g.lineTo(nock[0], nock[1]);
  g.lineTo(bottom[0], bottom[1]);
  g.strokePath();
}
