import { describe, expect, it } from 'vitest';
import { EMOJI_COOLDOWN_MS } from '../config';
import { EmojiLimiter, isEmojiIndex } from '../emoji';
import { setup } from './fakeSim';

function emojiEvents(h: ReturnType<typeof setup>) {
  return h.events.filter((e) => e.type === 'emoji');
}

describe('spectator emoji', () => {
  it('rate-limited to one per 0.5 s per spectator (C3 note)', () => {
    expect(EMOJI_COOLDOWN_MS).toBe(500);
    const h = setup();
    h.startGame(['a', 'b']);
    h.join('s');
    h.join('t');
    h.msg('s', { t: 'emoji', i: 0 });
    h.msg('s', { t: 'emoji', i: 1 }); // too soon
    h.msg('t', { t: 'emoji', i: 4 }); // separate cooldown
    h.runMs(250);
    h.msg('s', { t: 'emoji', i: 2 }); // still too soon
    h.runMs(250);
    h.msg('s', { t: 'emoji', i: 3 }); // 0.5 s later: ok
    expect(emojiEvents(h)).toEqual([
      { type: 'emoji', playerId: 's', i: 0 },
      { type: 'emoji', playerId: 't', i: 4 },
      { type: 'emoji', playerId: 's', i: 3 },
    ]);
  });

  it('ignored from non-spectators and for bad indexes', () => {
    const h = setup();
    h.join('a');
    h.join('b');
    h.msg('a', { t: 'emoji', i: 0 }); // lobby
    h.match.hostAction('start');
    h.runMs(3000);
    h.msg('a', { t: 'emoji', i: 0 }); // playing
    h.eliminate('b', 'a');
    h.msg('b', { t: 'emoji', i: 0 }); // results, not spectating
    h.join('s');
    h.msg('s', { t: 'emoji', i: 5 });
    h.msg('s', { t: 'emoji', i: 1.5 });
    h.msg('s', { t: 'emoji', i: '0' });
    expect(emojiEvents(h)).toEqual([]);
    h.msg('s', { t: 'emoji', i: 2 });
    expect(emojiEvents(h)).toEqual([{ type: 'emoji', playerId: 's', i: 2 }]);
  });

  it('limiter unit', () => {
    const l = new EmojiLimiter(1000);
    expect(l.allow('x', 0)).toBe(true);
    expect(l.allow('x', 999)).toBe(false);
    expect(l.allow('x', 1000)).toBe(true);
    expect(isEmojiIndex(4)).toBe(true);
    expect(isEmojiIndex(-1)).toBe(false);
  });
});
