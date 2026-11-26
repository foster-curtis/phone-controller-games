// The crowd spike runtime (game.ts; SPEC §6.2, §6.3, §12.3, §12.5; BUILD_PLAN TF7): lobby → leader
// Start → opening → play, phone screens, stick input moves the phone's character, timeScale.
import { describe, expect, it } from 'vitest';
import { createRuntime } from '../../game';
import { fakeHostClient } from './fakeClient';

function setup() {
  let t = 0;
  const fake = fakeHostClient();
  const rt = createRuntime({ client: fake.client, origin: 'http://tv', seed: 3, now: () => t });
  const run = (ms: number) => {
    for (let i = 0; i < ms / 16; i++) {
      t += 16;
      rt.tick(16);
    }
  };
  return { fake, rt, run, advance: (ms: number) => (t += ms) };
}

const screensTo = (fake: ReturnType<typeof fakeHostClient>, to: string) =>
  fake.sent
    .filter((s) => s.to === to && (s.data as { t: string }).t === 'screen')
    .map((s) => (s.data as { screen: { s: string } }).screen.s);

describe('spike runtime', () => {
  it('lists joined phones in the lobby and lets only the leader start', () => {
    const { fake, rt } = setup();
    fake.join('p1', 'Livia');
    expect(rt.tvView()).toMatchObject({ phase: 'lobby', canStart: false });
    fake.join('p2', 'Marcus');
    const lobby = rt.tvView();
    expect(lobby).toMatchObject({ phase: 'lobby', canStart: true, code: 'ABCD' });
    expect(lobby.phase === 'lobby' && lobby.players.map((p) => p.leader)).toEqual([true, false]);
    fake.msg('p2', { t: 'leader', action: 'start' });
    expect(rt.phase()).toBe('lobby');
    fake.msg('p1', { t: 'leader', action: 'start' });
    expect(rt.phase()).toBe('opening');
    expect(screensTo(fake, 'p1')).toEqual(['roundStart']);
  });

  it('runs the opening into play and the stick moves the phone character', () => {
    const { fake, rt, run } = setup();
    fake.join('p1', 'Livia');
    fake.join('p2', 'Marcus');
    expect(rt.start()).toBe(true);
    run(4200);
    expect(rt.phase()).toBe('play');
    expect(rt.tvView().phase).toBe('play');
    expect(screensTo(fake, 'p2')).toEqual(['roundStart', 'play']);
    const id = rt.characterOf('p1')!;
    const at = () => rt.world()!.characters.find((c) => c.id === id)!;
    const x0 = at().x;
    for (let i = 0; i < 30; i++) {
      fake.msg('p1', { t: 'input', x: 70, y: 0, bits: 0 });
      run(32);
    }
    expect(at().x).toBeGreaterThan(x0 + 0.5);
  });

  it('timeScale runs more steps per wall ms', () => {
    const a = setup();
    const b = setup();
    for (const s of [a, b]) {
      s.fake.join('p1', 'A');
      s.fake.join('p2', 'B');
      s.rt.start();
    }
    b.rt.setTimeScale(2);
    a.run(1000);
    b.run(1000);
    const ta = a.rt.world()!.tick;
    expect(b.rt.world()!.tick).toBeGreaterThanOrEqual(ta * 2 - 2);
  });

  it('rejects an outdated phone', () => {
    const { fake } = setup();
    fake.msg('p1', { t: 'join', name: 'Old', proto: 99 });
    expect(fake.sent.at(-1)).toEqual({ to: 'p1', data: { t: 'outdated', proto: 1 } });
  });
});
