// Combat and build HUD (SPEC §2.6 TV HUD, §3.3 feedback, §9.2 boss bar, §15.2 bands). Each piece is
// its own section so a coin tick doesn't restart another piece's animation.
import type { Section, RenderCtx } from '../render';
import { enemyArt, esc, icon, panel } from '../html';
import { laneBand, type LaneKey } from '../layout';
import { COLOR_VAR, ENEMY_NAME, SHOP_ICON, SHOP_NAME, fmtInt, roman } from '../labels';
import type { LaneId } from '../../../shared/ids';
import type { TvView } from '../types';

export const TOTAL_WAVES = 15;
/** Base HP fraction under which the alarm shows (SPEC §3.3). */
export const LOW_HP = 0.25;
const MAX_ANNOUNCEMENTS = 3;

const LANE_KEY: Record<LaneId, LaneKey> = { bottom: 'bottom', left: 'left', right: 'right' };

export function hudSections(view: TvView, ctx: RenderCtx): Section[] {
  const team = view.team;
  const build = view.screen === 'build';
  const out: Section[] = [];

  // ---- top band: wave and phase (left), base bar (center), coins (right) ----
  const wave = team?.wave ?? 0;
  const phase = build
    ? `Build${team?.buildEndsInMs != null ? ` · ${Math.ceil(team.buildEndsInMs / 1000)} s` : ''}`
    : 'Combat';
  out.push({
    name: 'wave',
    html: `<div class="hud-wave"><span class="pad">Wave ${wave} / ${TOTAL_WAVES}</span><span class="tag phase ${build ? 'build' : ''}">${phase}</span></div>`,
  });

  const frac =
    team && team.baseMaxHp > 0 ? Math.min(Math.max(team.baseHp / team.baseMaxHp, 0), 1) : 0;
  out.push({
    name: 'base',
    html:
      `<div class="hud-base ${ctx.hit ? 'hit' : ''} ${view.lowHpAlarm ? 'low' : ''}">` +
      `<span class="tag muted">Citadel</span>` +
      `<span class="bar"><i style="width:${(frac * 100).toFixed(1)}%"></i></span>` +
      `<span class="label pct">${Math.round(frac * 100)}%</span></div>`,
  });

  out.push({
    name: 'coins',
    html: `<div class="hud-coins"><span class="tag muted">Team coins</span>${icon('coins', 'coin')}<span class="pad amt">${fmtInt(team?.coins ?? 0)}</span></div>`,
  });

  // ---- low-HP alarm (§3.3): red vignette around the edges, text under the base bar ----
  if (view.lowHpAlarm) {
    out.push({
      name: 'alarm',
      html: `<div class="vignette" data-edge></div><div class="alarm-text tag">Citadel under attack</div>`,
    });
  }

  // ---- lane warnings (§2.6): violet bands on the edge where a lane enters ----
  if (view.laneWarnings.length) {
    out.push({
      name: 'lanes',
      html: view.laneWarnings
        .map((l) => {
          const b = laneBand(LANE_KEY[l]);
          return `<div class="lane ${b.edge}" data-edge style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px"></div>`;
        })
        .join(''),
    });
  }

  // ---- bottom band: boss bar (combat) or next-wave preview (build) ----
  if (view.bossBar && !build) {
    const b = view.bossBar;
    const f = b.maxHp > 0 ? Math.min(Math.max(b.hp / b.maxHp, 0), 1) : 0;
    out.push({
      name: 'boss',
      html:
        `<div class="hud-boss ${b.staggered ? 'stagger' : ''}">` +
        `<span class="tag nm">${esc(ENEMY_NAME[b.enemy])} Mk ${roman(b.mk)}${b.staggered ? ' · Staggered' : ''}</span>` +
        `<span class="bar"><i style="width:${(f * 100).toFixed(1)}%"></i></span></div>`,
    });
  }
  if (build && team?.nextWave) {
    const nw = team.nextWave;
    const total = nw.enemies.reduce((a, e) => a + e.count, 0);
    const head = nw.boss ? 'Boss wave' : `${total} enemies`;
    const tiles = nw.enemies
      .map((e) => {
        const isNew = view.nextWaveNew.includes(e.id);
        return (
          `<div class="eny ${isNew ? 'new' : ''}" title="${esc(ENEMY_NAME[e.id])}">` +
          `<span class="tile">${enemyArt(e.id)}${isNew ? '<span class="newtag tag">New</span>' : ''}</span>` +
          `<span class="cnt label">×${e.count}</span></div>`
        );
      })
      .join('');
    out.push({
      name: 'preview',
      html: panel(
        `<div class="pv-head"><span class="tag muted">Next wave</span><span class="pad">${head}</span></div><div class="pv-tiles">${tiles}</div>`,
        'hud-preview',
      ),
    });
  }

  // ---- purchase announcements stack bottom-left in the buyer's color ----
  const anns = view.announcements.slice(-MAX_ANNOUNCEMENTS);
  if (anns.length) {
    const newest = anns[anns.length - 1]!.id;
    out.push({
      name: 'announce',
      html:
        `<div class="hud-ann">` +
        anns
          .map(
            (a) =>
              `<div class="ann ${a.id === newest ? 'new' : ''}" style="--pc:${COLOR_VAR(a.color)}">${icon(SHOP_ICON[a.item])}` +
              `<span class="tag txt">${esc(a.name)} bought ${esc(SHOP_NAME[a.item])}${a.tier > 1 ? ` ${roman(a.tier)}` : ''}</span></div>`,
          )
          .join('') +
        `</div>`,
    });
  }

  // ---- build phase, right side: ready status and wishlist ----
  if (build && team) {
    const rs = view.readyStatus;
    const ready = rs.filter((p) => p.ready).length;
    const rows = rs
      .map((p) => {
        const state = !p.connected
          ? `<span class="tag off">${icon('reconnecting')}Offline</span>`
          : p.ready
            ? `<span class="rdy">${icon('ready')}</span>`
            : `<span class="tag muted">Building</span>`;
        return `<div class="rrow" style="--pc:${COLOR_VAR(p.color)}"><span class="pip"></span><span class="label nm">${esc(p.name)}</span>${state}</div>`;
      })
      .join('');
    const readyPanel = panel(
      `<div class="tag muted ph">Ready · ${ready} of ${rs.length}</div>${rows}`,
      'side',
    );
    let wishPanel = '';
    if (view.wishlist.length) {
      const wl = view.wishlist
        .slice(0, 6)
        .map((w) => {
          const pips = w.by
            .slice(0, 3)
            .map((p) => `<span class="pip" style="--pc:${COLOR_VAR(p.color)}"></span>`)
            .join('');
          return (
            `<div class="wrow"><span class="pips">${pips}</span>${icon(SHOP_ICON[w.item])}` +
            `<span class="label nm">${esc(SHOP_NAME[w.item])}${w.tier > 1 ? ` ${roman(w.tier)}` : ''}</span>` +
            (w.price !== null ? `<span class="label price">${fmtInt(w.price)}</span>` : '') +
            `</div>`
          );
        })
        .join('');
      wishPanel = panel(`<div class="tag muted ph">Wishlist</div>${wl}`, 'side');
    }
    out.push({ name: 'side', html: `<div class="side-col">${readyPanel}${wishPanel}</div>` });
  }
  return out;
}
