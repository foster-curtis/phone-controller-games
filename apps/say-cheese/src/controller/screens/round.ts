// In-round phone screens (SPEC §6.2, §6.7): announce, scatter, shoot. The photographer's scatter and
// shoot screens are dark (eyes closed); the shoot screen is one big shutter. Dodgers see "Scatter!".
// Deadlines are set locally on receipt from `endsInMs` (BUILD_PLAN §8 timers).
import { el } from '@pcg/controller-kit';
import type { Screen } from '../../shared/messages';
import type { Ctx } from '../ctx';
import {
  initialShutter,
  shootOver,
  takeShot,
  type ShutterRules,
  type ShutterState,
} from '../review/shutter';
import { dodgerLine } from './dodger';
import { button, heading, para, renderedView, type View } from './view';

type Announce = Extract<Screen, { kind: 'announce' }>;
type Scatter = Extract<Screen, { kind: 'scatter' }>;
type Shoot = Extract<Screen, { kind: 'shoot' }>;

export function announceView(first: Screen, ctx: Ctx): View {
  let video: HTMLVideoElement | null = null;
  let readyClicked = false;
  return renderedView('announce', first, (s: Announce) => {
    if (s.role === 'dodger') {
      return [
        heading(dodgerLine(s.seats, 'Get ready to dodge!')),
        para(`${s.photographer.name} is the photographer.`, 'caption'),
        para('Round ' + s.round + ' / ' + s.rounds, 'caption'),
      ];
    }
    if (!video) {
      video = el('video', { class: 'preview', playsinline: '', muted: '', autoplay: '' });
      video.muted = true;
      // iOS re-prompts per page load: re-acquire if the track ended (BUILD_PLAN §8).
      const attach = () => video && ctx.camera.attach(video);
      if (ctx.camera.state === 'ended' || ctx.camera.state === 'idle') {
        void ctx.camera.enable().then(attach);
      } else attach();
    }
    const ready = button(
      readyClicked ? 'Waiting…' : "I'm ready",
      () => {
        readyClicked = true;
        void ctx.sfx.unlock();
        // Keeps the shutter click audible with the iOS silent switch on, where supported (SPEC §3).
        const nav = navigator as Navigator & { audioSession?: { type: string } };
        if (nav.audioSession) nav.audioSession.type = 'playback';
        ctx.send({ t: 'shootReady' });
        ready.disabled = true;
        ready.textContent = 'Waiting…';
      },
      { id: 'ready', disabled: readyClicked },
    );
    return [
      heading('You are the photographer'),
      el('div', { class: 'preview-wrap' }, video),
      ready,
    ];
  });
}

/** "7" style whole-second countdown text. */
const secs = (ms: number) => String(Math.max(0, Math.ceil(ms / 1000)));

export function scatterView(first: Screen, ctx: Ctx): View {
  const root = el('main', { class: 'screen', 'data-screen': 'scatter' });
  const count = el('span', { class: 'count', 'aria-live': 'off' });
  let deadline = 0;
  let r = -1;
  const tick = () => (count.textContent = secs(deadline - ctx.now()));
  const paint = (screen: Screen) => {
    const s = screen as Scatter;
    if (s.r !== r) {
      r = s.r;
      deadline = ctx.now() + s.endsInMs;
    }
    root.classList.toggle('dark', s.role === 'photographer');
    if (s.role === 'photographer') {
      root.replaceChildren(
        heading('Eyes closed!'),
        el('p', { class: 'body' }, 'Starting in ', count),
      );
    } else {
      root.replaceChildren(
        heading(dodgerLine(s.seats, 'Scatter!')),
        para('Pocket your phone and keep moving.'),
        el('p', { class: 'caption' }, 'Shooting starts in ', count),
      );
    }
    tick();
  };
  paint(first);
  const timer = setInterval(tick, 200);
  return {
    el: root,
    update: paint,
    destroy() {
      clearInterval(timer);
    },
  };
}

export function shootView(first: Screen, ctx: Ctx): View {
  const root = el('main', { class: 'screen dark', 'data-screen': 'shoot' });
  let r = -1;
  let rules: ShutterRules = { cooldownMs: ctx.cooldownMs, maxShots: 15, deadlineAt: 0 };
  let state: ShutterState = initialShutter();
  let pending = 0;
  let done = false;
  let endTimer: ReturnType<typeof setTimeout> | undefined;
  const counter = el('div', { class: 'shot-counter', 'aria-live': 'off' });
  const clock = el('div', { class: 'shoot-clock caption' });
  const flash = el('div', { class: 'flash' });
  const render = () => {
    counter.textContent = `${state.shots} / ${rules.maxShots}`;
    clock.textContent = secs(rules.deadlineAt - ctx.now());
  };

  const finish = () => {
    if (done || r < 0) return;
    if (!shootOver(state, rules, ctx.now()) || pending > 0) return;
    done = true;
    clearTimeout(endTimer);
    ctx.send({ t: 'shootDone', r, count: state.shots });
    root.classList.add('over');
  };

  const onTap = () => {
    if (done || r < 0) return;
    const next = takeShot(state, rules, ctx.now());
    if (!next) return;
    const idx = state.shots;
    state = next;
    const at = ctx.now();
    pending++;
    ctx.sfx.play('shutter');
    flash.classList.remove('flash-go');
    void flash.offsetWidth;
    flash.classList.add('flash-go');
    const round = r;
    ctx.camera
      .capture()
      .then((c) => {
        ctx.onCapture?.(round, idx, c);
        ctx.send({ t: 'shot', r: round, photo: idx, at, aspect: c.width / c.height });
      })
      .catch(() => {
        // A failed grab gives the shot back, if it was the latest one.
        if (round === r && idx === state.shots - 1) state = { ...state, shots: idx };
      })
      .finally(() => {
        pending--;
        render();
        finish();
      });
    render();
    finish();
  };

  const paint = (screen: Screen) => {
    const s = screen as Shoot;
    if (s.role === 'dodger') {
      root.classList.remove('dark');
      root.replaceChildren(
        heading(dodgerLine(s.seats, 'Scatter!')),
        para('Pocket your phone and keep moving.'),
      );
      return;
    }
    if (s.r !== r) {
      r = s.r;
      done = false;
      state = initialShutter();
      pending = 0;
      rules = {
        cooldownMs: ctx.cooldownMs,
        maxShots: s.maxShots,
        deadlineAt: ctx.now() + s.endsInMs,
      };
      clearTimeout(endTimer);
      endTimer = setTimeout(finish, s.endsInMs + 1);
    }
    root.classList.add('dark');
    root.replaceChildren(el('div', { class: 'viewfinder' }), counter, clock, flash);
    render();
  };
  paint(first);
  const tickTimer = setInterval(render, 250);

  // The whole screen is the shutter. preventDefault on touchstart stops iOS double-tap zoom and
  // scroll (BUILD_PLAN §3 SC3 risks); the shot itself runs on pointerdown.
  root.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  root.addEventListener('pointerdown', onTap);

  return {
    el: root,
    update: paint,
    destroy() {
      clearTimeout(endTimer);
      clearInterval(tickTimer);
    },
  };
}
