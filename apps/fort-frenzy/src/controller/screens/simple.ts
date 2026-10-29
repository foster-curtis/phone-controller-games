// The small screens: join (phone-local: room code entry), status (waiting, full, restoring, removed,
// connecting), name (SPEC §2.6 join mockup: code, name, one button) and claim (resume into a new room).
import { el } from '@pcg/controller-kit';
import { NAME_MAX } from '../../shared/messages';
import { CLASS_INFO } from '../copy';
import { icon } from '../components';
import { codeBoxes, fitAboveKeyboard, type ScreenCtx, type Snapshot, type View } from './common';

const NAME_KEY = 'fort-frenzy:name';

const hero = () =>
  el(
    'div',
    { class: 'hero' },
    el('img', { class: 'hero-mark', src: '/apple-icon.png', alt: '', width: '96', height: '96' }),
    el('h1', { class: 'title hero-title', text: 'Fort Frenzy' }),
  );

/** Phone-local join: a room code field (no `?code=`) or a "connecting" note with the error, if any. */
export function createJoin(opts: {
  code: string | null;
  error: string | null;
  onCode(code: string): void;
}): {
  el: HTMLElement;
  set(o: { code: string | null; error: string | null }): void;
  destroy(): void;
} {
  const root = el('section', { class: 'screen join' });
  const form = el('div', { class: 'form' });
  const set = (o: { code: string | null; error: string | null }) => {
    const err = o.error
      ? el('p', { class: 'form-error body', role: 'alert', text: o.error })
      : null;
    if (o.code && !o.error) {
      form.replaceChildren(
        el('span', { class: 'field-label', text: 'ROOM CODE' }),
        codeBoxes(o.code),
        el('p', { class: 'hint body', text: 'Connecting…' }),
      );
      return;
    }
    const input = el('input', {
      class: 'text-input code',
      type: 'text',
      inputmode: 'text',
      autocapitalize: 'characters',
      autocomplete: 'off',
      maxlength: '8',
      placeholder: 'ABCD',
      'aria-label': 'Room code',
      value: o.code ?? '',
    });
    const go = el('button', { type: 'button', class: 'btn btn-primary', text: 'JOIN' });
    const submit = () => {
      const v = input.value.trim().toUpperCase();
      if (v) opts.onCode(v);
    };
    go.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
    form.replaceChildren(
      el('span', { class: 'field-label', text: 'ROOM CODE' }),
      input,
      go,
      ...(err ? [err] : []),
      el('p', { class: 'hint body', text: 'The code is on the TV.' }),
    );
  };
  root.append(hero(), form);
  set({ code: opts.code, error: opts.error });
  const stopKb = fitAboveKeyboard(root);
  return { el: root, set, destroy: stopKb };
}

const STATUS_COPY: Record<string, { title: string; body: string }> = {
  waiting: {
    title: 'Joining at the next build phase',
    body: 'Hang tight. You will drop in between waves.',
  },
  full: { title: 'Game full', body: 'Fort Frenzy holds six players. Wait for a spot to open.' },
  restoring: { title: 'TV is restoring…', body: 'The run comes back in a moment.' },
};

/** waiting / full / restoring share one view and swap copy. */
export function createStatus(initial: string): View {
  const root = el('section', { class: 'screen status' });
  const title = el('h1', { class: 'h2 status-title' });
  const body = el('p', { class: 'body status-body' });
  root.append(
    el('div', { class: 'status-card chamfer' }, icon('reconnecting', 'status-glyph'), title, body),
  );
  const paint = (kind: string) => {
    const c = STATUS_COPY[kind] ?? { title: kind, body: '' };
    root.dataset.status = kind;
    title.textContent = c.title;
    body.textContent = c.body;
  };
  paint(initial);
  return { el: root, update: (s) => paint(s.me.screen), destroy() {} };
}

/** Phone-local note (removed, host unreachable) with one button. */
export function createNote(
  title: string,
  body: string,
  action?: { label: string; run(): void },
): View {
  const root = el('section', { class: 'screen status', 'data-status': 'note' });
  const card = el(
    'div',
    { class: 'status-card chamfer' },
    el('h1', { class: 'h2 status-title', text: title }),
    el('p', { class: 'body status-body', text: body }),
  );
  if (action) {
    const b = el('button', { type: 'button', class: 'btn btn-primary', text: action.label });
    b.addEventListener('click', action.run);
    card.append(b);
  }
  root.append(card);
  return { el: root, update() {}, destroy() {} };
}

/** name: room code, name field, one JOIN button. The color comes from the host. */
export function createName(ctx: ScreenCtx, first: Snapshot): View {
  const root = el('section', { class: 'screen name' });
  const input = el('input', {
    class: 'text-input',
    type: 'text',
    autocomplete: 'off',
    autocapitalize: 'words',
    enterkeyhint: 'go',
    maxlength: String(NAME_MAX),
    placeholder: 'Your name',
    'aria-label': 'Your name',
  });
  const stored = (() => {
    try {
      return ctx.storage?.getItem(NAME_KEY) ?? '';
    } catch {
      return '';
    }
  })();
  input.value = first.me.name || stored;
  const join = el('button', { type: 'button', class: 'btn btn-primary', text: 'JOIN' });
  const clean = () => [...input.value.trim()].slice(0, NAME_MAX).join('');
  const sync = () => (join.disabled = clean().length === 0);
  const submit = () => {
    const name = clean();
    if (!name) return;
    try {
      ctx.storage?.setItem(NAME_KEY, name);
    } catch {
      /* private mode */
    }
    ctx.intent({ k: 'name', name });
  };
  input.addEventListener('input', sync);
  input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
  join.addEventListener('click', submit);
  sync();
  const form = el(
    'div',
    { class: 'form' },
    ctx.code ? el('span', { class: 'field-label', text: 'ROOM CODE' }) : null,
    ctx.code ? codeBoxes(ctx.code) : null,
    el('span', { class: 'field-label', text: 'YOUR NAME' }),
    input,
    join,
    el('p', {
      class: 'hint body',
      text: 'You get a color when you join. Hold your phone sideways.',
    }),
  );
  root.append(hero(), form);
  const stopKb = fitAboveKeyboard(root);
  return { el: root, update() {}, destroy: stopKb };
}

/** claim: the host restored a run in a new room; pick your slot. */
export function createClaim(ctx: ScreenCtx): View {
  const root = el('section', { class: 'screen claim' });
  const list = el('div', { class: 'claim-list' });
  root.append(
    el('h1', { class: 'h2 claim-title', text: 'Which knight are you?' }),
    el('p', { class: 'body hint', text: 'The run was restored. Pick your slot to jump back in.' }),
    list,
  );
  return {
    el: root,
    update(s) {
      const slots = s.me.claim ?? [];
      list.replaceChildren(
        ...slots.map((c) => {
          const b = el(
            'button',
            { type: 'button', class: 'btn claim-slot', 'data-slot': String(c.slot) },
            icon(`class-${CLASS_INFO[c.classId].rig}`, 'claim-helm'),
            el('span', { class: 'claim-name', text: c.name }),
            el('span', { class: 'claim-class', text: CLASS_INFO[c.classId].name.toUpperCase() }),
          );
          b.addEventListener('click', () => ctx.intent({ k: 'claim', slot: c.slot }));
          return b;
        }),
        ...(slots.length
          ? []
          : [el('p', { class: 'body hint', text: 'No free slots. Ask the TV.' })]),
      );
    },
    destroy() {},
  };
}
