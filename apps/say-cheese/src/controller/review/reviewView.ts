// Review screen (SPEC §6.4, §6.7). Photographer: their local photo, tag circles, bottom sheet,
// Prev / Next / Finish review (with "Are you sure?"). Dodger: "Photo 4 / 15. Watch the TV!"
// (emoji bar is SC10). Tags come from the host (`screen.tags`), which is authoritative.
import { el } from '@pcg/controller-kit';
import type { Screen, TagView } from '../../shared/messages';
import type { Ctx } from '../ctx';
import { button, colorVars, heading, para, type View } from '../screens/view';
import { tagSheetModel } from './tagSheet';

type Review = Extract<Screen, { kind: 'review' }>;

const newTagId = () =>
  `${Date.now().toString(36)}${Math.floor(Math.random() * 1679616).toString(36)}`;

export function reviewView(first: Screen, ctx: Ctx): View {
  const root = el('main', { class: 'screen review', 'data-screen': 'review' });
  let s = first as Review;
  let current = s.photo;
  /** A circle placed but not yet named: discarded unless a name is picked. */
  let pending: { tagId: string; x: number; y: number } | null = null;
  let editing: TagView | null = null;
  let sheetOpen = false;
  let confirming = false;

  const photoInfo = () => s.photos.find((p) => p.index === current) ?? s.photos[0];
  const closeSheet = () => {
    sheetOpen = false;
    pending = null;
    editing = null;
    paint();
  };

  function stage(): HTMLElement {
    const aspect = photoInfo()?.aspect ?? 4 / 3;
    const url = ctx.photoUrl(s.r, current);
    const st = el('div', { class: 'stage', style: `aspect-ratio: ${aspect}` });
    if (url) st.append(el('img', { src: url, alt: `Photo ${current + 1}`, draggable: 'false' }));
    else st.append(el('p', { class: 'caption lost', text: 'Look at the TV' }));
    // Tag size: 12% of the photo's short side (brand --tag-size, SPEC §6.4).
    const size = `calc(var(--tag-size) * ${Math.min(1, 1 / aspect)})`;
    const ring = (tagId: string, x: number, y: number, color: TagView['playerId'], cls = '') => {
      const p = s.candidates.find((c) => c.playerId === color);
      const r = el('button', {
        type: 'button',
        class: `tag-ring ${cls}`.trim(),
        'data-tag': tagId,
        style: `left:${x * 100}%;top:${y * 100}%;width:${size};border-width:var(--tag-stroke-phone);${colorVars(p?.color ?? null)}`,
        'aria-label': p ? `Tag ${p.name}` : 'Tag Unknown',
      });
      return r;
    };
    for (const t of s.tags.filter((t) => t.photo === current)) {
      const r = ring(t.tagId, t.x, t.y, t.playerId);
      r.addEventListener('click', (e) => {
        e.stopPropagation();
        pending = null;
        editing = t;
        sheetOpen = true;
        paint();
      });
      st.append(r);
    }
    if (pending) st.append(ring(pending.tagId, pending.x, pending.y, null, 'tag-ring--pending'));
    st.addEventListener('click', (e) => {
      if (sheetOpen) return;
      const rect = st.getBoundingClientRect();
      const x = rect.width ? (e.clientX - rect.left) / rect.width : 0.5;
      const y = rect.height ? (e.clientY - rect.top) / rect.height : 0.5;
      pending = {
        tagId: newTagId(),
        x: Math.min(1, Math.max(0, x)),
        y: Math.min(1, Math.max(0, y)),
      };
      editing = null;
      sheetOpen = true;
      paint();
    });
    return st;
  }

  function sheet(): HTMLElement {
    const onPhoto = s.tags.filter((t) => t.photo === current);
    const model = tagSheetModel(s.candidates, onPhoto, editing);
    const pick = (playerId: string | null) => {
      const tagId = editing?.tagId ?? pending?.tagId;
      const pos = editing ?? pending;
      if (!tagId || !pos) return;
      ctx.send({
        t: 'tag',
        photo: current,
        tagId,
        x: pos.x,
        y: pos.y,
        playerId: playerId as TagView['playerId'],
      });
      closeSheet();
    };
    const list = el(
      'ul',
      { class: 'sheet-list' },
      ...model.options.map((o) => {
        const b = el('button', {
          type: 'button',
          class: 'sheet-option',
          'data-player': o.playerId ?? 'unknown',
          style: colorVars(o.color),
          text: o.disabled ? `${o.name} ✓` : o.name,
        });
        b.disabled = o.disabled;
        if (o.selected) b.setAttribute('aria-pressed', 'true');
        b.addEventListener('click', () => pick(o.playerId));
        return el('li', {}, b);
      }),
    );
    const remove = model.canRemove && editing;
    const sh = el(
      'div',
      { class: 'sheet', role: 'dialog', 'aria-label': 'Who is this?' },
      el('p', { class: 'label', text: 'Who is this?' }),
      list,
      remove &&
        button(
          'Remove',
          () => {
            ctx.send({ t: 'untag', photo: current, tagId: (editing as TagView).tagId });
            closeSheet();
          },
          { cls: 'btn--quiet', id: 'remove' },
        ),
    );
    // Tapping outside the sheet before picking a name discards the new circle.
    return el('div', { class: 'sheet-backdrop', 'data-sheet': '' }, sh);
  }

  function paint() {
    if (s.role === 'dodger') {
      root.replaceChildren(
        heading(`Photo ${current + 1} / ${s.photos.length}`),
        para('Watch the TV!'),
      );
      return;
    }
    const last = current >= s.photos.length - 1;
    const nav = el(
      'div',
      { class: 'nav-row' },
      button('‹ Prev', () => go(current - 1), {
        id: 'prev',
        cls: 'btn--quiet',
        disabled: current <= 0,
      }),
      last
        ? button('Finish review', () => ((confirming = true), paint()), { id: 'finish' })
        : button('Next ›', () => go(current + 1), { id: 'next' }),
    );
    const parts: Array<Node | false> = [
      el('p', { class: 'label', text: `Photo ${current + 1} / ${s.photos.length}` }),
      stage(),
      nav,
      s.isLeader &&
        s.canSkipReview &&
        button('Skip review', () => ctx.send({ t: 'leader', action: 'skipReview' }), {
          cls: 'btn--quiet',
          id: 'skipReview',
        }),
    ];
    if (sheetOpen) {
      const backdrop = sheet();
      backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeSheet();
      });
      parts.push(backdrop);
    }
    if (confirming) parts.push(confirmBox());
    root.replaceChildren(...parts.filter((n): n is Node => !!n));
  }

  function confirmBox(): HTMLElement {
    return el(
      'div',
      { class: 'sheet-backdrop', 'data-confirm': '' },
      el(
        'div',
        { class: 'sheet', role: 'dialog' },
        el('p', { class: 'label', text: 'Are you sure?' }),
        para('Scores are counted from your tags.', 'caption'),
        button(
          'Yes, finish',
          () => {
            confirming = false;
            ctx.send({ t: 'finishReview' });
            paint();
          },
          { id: 'confirmFinish' },
        ),
        button('Keep tagging', () => ((confirming = false), paint()), {
          cls: 'btn--quiet',
          id: 'cancelFinish',
        }),
      ),
    );
  }

  function go(i: number) {
    const n = Math.max(0, Math.min(s.photos.length - 1, i));
    if (n === current) return;
    current = n;
    pending = null;
    editing = null;
    sheetOpen = false;
    ctx.send({ t: 'view', photo: n });
    paint();
  }

  paint();
  return {
    el: root,
    update(next) {
      const prevR = s.r;
      s = next as Review;
      if (s.role === 'dodger') current = s.photo;
      if (s.r !== prevR) {
        current = s.photo;
        pending = null;
        editing = null;
        sheetOpen = false;
        confirming = false;
      }
      if (editing) editing = s.tags.find((t) => t.tagId === editing?.tagId) ?? null;
      if (!editing && !pending) sheetOpen = false;
      paint();
    },
    destroy() {},
  };
}
