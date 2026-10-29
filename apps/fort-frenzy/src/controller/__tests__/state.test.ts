import { describe, expect, it } from 'vitest';
import { ACK_REASONS } from '../../shared/messages';
import {
  ACK_FALLBACK,
  ACK_TEXT,
  INITIAL_STATE,
  ackToast,
  applyHostMsg,
  createIntentTracker,
  resetRevs,
} from '../state';
import { sampleMe, sampleTeam } from '../samples';
import { ME_ACTIONS } from '../../shared/messages';
import { BUILD_PHASE_ACTIONS, actionIcon, giveIcon } from '../copy';

describe('rev ordering (SPEC §15.6)', () => {
  it('applies newer snapshots and drops stale or equal ones, per kind', () => {
    let s = INITIAL_STATE;
    const apply = (m: Parameters<typeof applyHostMsg>[1]) => {
      const r = applyHostMsg(s, m);
      s = r.state;
      return r.changed;
    };
    expect(apply({ t: 'me', rev: 5, me: sampleMe({ hp: 50 }) })).toBe('me');
    expect(apply({ t: 'me', rev: 4, me: sampleMe({ hp: 10 }) })).toBeNull();
    expect(apply({ t: 'me', rev: 5, me: sampleMe({ hp: 20 }) })).toBeNull();
    expect(s.me?.hp).toBe(50);
    // team has its own counter
    expect(apply({ t: 'team', rev: 1, team: sampleTeam({ coins: 9 }) })).toBe('team');
    expect(apply({ t: 'team', rev: 0, team: sampleTeam({ coins: 1 }) })).toBeNull();
    expect(s.team?.coins).toBe(9);
    expect(apply({ t: 'me', rev: 6, me: sampleMe({ hp: 70 }) })).toBe('me');
    expect(s.me?.hp).toBe(70);
  });

  it('forgets revs on reconnect so a restarted host is heard', () => {
    let s = applyHostMsg(INITIAL_STATE, { t: 'me', rev: 90, me: sampleMe({ hp: 1 }) }).state;
    expect(applyHostMsg(s, { t: 'me', rev: 1, me: sampleMe({ hp: 2 }) }).changed).toBeNull();
    s = resetRevs(s);
    expect(applyHostMsg(s, { t: 'me', rev: 1, me: sampleMe({ hp: 2 }) }).changed).toBe('me');
  });
});

describe('intents and acks', () => {
  it('sends intents with increasing seq', () => {
    const out: unknown[] = [];
    const t = createIntentTracker((m) => out.push(m));
    t.send({ k: 'ready', ready: true });
    t.send({ k: 'give' });
    expect(out).toEqual([
      { t: 'intent', seq: 1, intent: { k: 'ready', ready: true } },
      { t: 'intent', seq: 2, intent: { k: 'give' } },
    ]);
  });

  it('every refusal reason has its own toast; success has none', () => {
    for (const reason of ACK_REASONS)
      expect(ackToast({ ok: false, reason })).toBe(ACK_TEXT[reason]);
    expect(new Set(ACK_REASONS.map((r) => ACK_TEXT[r])).size).toBe(ACK_REASONS.length);
    expect(ackToast({ ok: false })).toBe(ACK_FALLBACK);
    expect(ackToast({ ok: true })).toBeNull();
  });

  it('toasts only a refusal of a pending intent, once', () => {
    const t = createIntentTracker(() => {});
    const seq = t.send({ k: 'buy', item: 'repair' });
    expect(t.ack({ seq: 99, ok: false, reason: 'coins' })).toBeNull();
    expect(t.ack({ seq, ok: false, reason: 'coins' })).toBe('Not enough coins');
    expect(t.ack({ seq, ok: false, reason: 'coins' })).toBeNull();
    const ok = t.send({ k: 'give' });
    expect(t.ack({ seq: ok, ok: true })).toBeNull();
    expect(t.pending()).toBe(0);
  });
});

describe('action icon mapping (SPEC §10.1)', () => {
  it('maps every action to its act-* icon, kit to emergency-kit, none to dimmed', () => {
    const expected: Record<string, string> = {
      pickup: 'act-pickup',
      deliver: 'act-deliver',
      buy: 'act-buy',
      place: 'act-place',
      throw: 'act-throw',
      flag: 'act-flag',
      recall: 'act-recall',
      kit: 'emergency-kit',
    };
    for (const a of ME_ACTIONS) {
      if (a === 'none') expect(actionIcon(a).dimmed).toBe(true);
      else expect(actionIcon(a)).toEqual({ id: expected[a], dimmed: false });
    }
  });

  it('Give shows act-give or act-drop, dimmed when there is nothing to give', () => {
    expect(giveIcon('give')).toEqual({ id: 'act-give', dimmed: false });
    expect(giveIcon('drop')).toEqual({ id: 'act-drop', dimmed: false });
    expect(giveIcon(null).dimmed).toBe(true);
  });

  it('outside combat only pick up, deliver, kit and buy apply (rows 1-4)', () => {
    expect([...BUILD_PHASE_ACTIONS].sort()).toEqual(['buy', 'deliver', 'kit', 'pickup']);
  });
});
