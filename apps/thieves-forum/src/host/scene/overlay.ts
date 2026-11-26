// Dev overlay (SPEC §12.3 `DebugView`, §6.11; BUILD_PLAN TF7, C1 checkpoint): labels every character
// over its head, players by name in gold and NPCs by mind state, plus the live / planned NPC count.
// Debug only: main.ts imports this module dynamically, and only when `?debug=1` (or dev) is on; the
// scene never imports it (scene/__tests__/disguise.test.ts). `D` toggles it; `?overlay=1` starts it on.
import type * as Phaser from 'phaser';
import type { Vec2 } from '../../content/types';
import { theme } from '../../shared/theme';
import type { DebugView } from '../sim/snapshot';
import type { SceneEntityId, SceneOverlay } from './types';

export interface OverlayData {
  debug: DebugView;
  /** Player names by their character id (debug only). */
  names: ReadonlyMap<SceneEntityId, string>;
}

/** Head height above the foot point, screen px (characters stand about 108 px). */
const HEAD_PX = 116;

export function createDevOverlay(
  scene: Phaser.Scene,
  data: () => OverlayData | null,
  startOn = new URLSearchParams(location.search).get('overlay') === '1',
): SceneOverlay {
  let on = startOn;
  const labels = new Map<SceneEntityId, Phaser.GameObjects.Text>();
  const style = (player: boolean): Phaser.Types.GameObjects.Text.TextStyle => ({
    fontFamily: theme.font.mono,
    fontSize: player ? '20px' : '14px',
    color: player ? theme.color.gold.hex : theme.color.travertine.hex,
    backgroundColor: theme.color.background.hex,
    padding: { x: 4, y: 1 },
  });
  const count = scene.add
    .text(16, 16, '', style(false))
    .setDepth(1e6)
    .setScrollFactor(0)
    .setVisible(on);
  count.setData('role', 'overlay-count');

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'd' && e.key !== 'D') return;
    on = !on;
    count.setVisible(on);
    if (!on) for (const t of labels.values()) t.setVisible(false);
  };
  window.addEventListener('keydown', onKey);
  document.documentElement.dataset.devOverlay = on ? 'on' : 'off';

  return {
    update(feet: ReadonlyMap<SceneEntityId, Vec2>) {
      document.documentElement.dataset.devOverlay = on ? 'on' : 'off';
      if (!on) return;
      const d = data();
      if (!d) {
        for (const t of labels.values()) t.setVisible(false);
        count.setText('');
        return;
      }
      const seen = new Set<SceneEntityId>();
      for (const c of d.debug.characters) {
        const at = feet.get(c.id);
        if (!at) continue;
        seen.add(c.id);
        const player = c.control === 'player';
        const text = player
          ? (d.names.get(c.id) ?? 'player')
          : c.control === 'npc'
            ? c.npcState
            : `${c.control} ${c.npcState}`;
        let t = labels.get(c.id);
        if (!t) {
          t = scene.add.text(0, 0, '', style(player)).setOrigin(0.5, 1).setDepth(1e6);
          labels.set(c.id, t);
        }
        t.setStyle(style(player));
        t.setText(c.hot ? `${text} (hot)` : text);
        t.setPosition(at.x, at.y - HEAD_PX).setVisible(true);
      }
      for (const [id, t] of labels) {
        if (seen.has(id)) continue;
        t.destroy();
        labels.delete(id);
      }
      count.setText(`NPCs ${d.debug.liveNpcs} / ${d.debug.plannedNpcs}`);
    },
    destroy() {
      window.removeEventListener('keydown', onKey);
      for (const t of labels.values()) t.destroy();
      count.destroy();
    },
  };
}
