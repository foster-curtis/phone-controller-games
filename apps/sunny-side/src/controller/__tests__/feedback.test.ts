// Give feedback on the match-end screen (PLATFORM decision #11): every phone, a new tab, nowhere else.
import { describe, expect, it } from 'vitest';
import { SCREEN_KINDS } from '../screens';
import { mount, sampleScreen } from './helpers';

const FORM =
  'https://docs.google.com/forms/d/e/1FAIpQLSdPubA2byBsxMQwW150t_6hfZ8tZno02ZdCDnrVDpBAqcwtCg/viewform?usp=pp_url&entry.1611048359=Yes';

describe('Give feedback', () => {
  it.each([true, false])('match end shows it (isLeader %s) as a new-tab link', (isLeader) => {
    const h = mount();
    h.show({ ...sampleScreen('matchEnd'), isLeader });
    const a = h.root.querySelector<HTMLAnchorElement>('[data-feedback]')!;
    expect(a.tagName).toBe('A');
    expect(a.href).toBe(FORM);
    expect(a.target).toBe('_blank');
    expect(a.rel.split(' ')).toContain('noopener');
    expect(a.textContent).toBe('Give feedback');
  });

  it('keeps the same link across updates', () => {
    const h = mount();
    h.show({ ...sampleScreen('matchEnd'), isLeader: false });
    const a = h.root.querySelector('[data-feedback]');
    h.show({ ...sampleScreen('matchEnd'), isLeader: true });
    expect(h.root.querySelector('[data-feedback]')).toBe(a);
  });

  it('appears on no other screen', () => {
    const h = mount();
    for (const kind of SCREEN_KINDS.filter((k) => k !== 'matchEnd')) {
      h.show(sampleScreen(kind));
      expect(h.root.querySelector('[data-feedback]'), kind).toBeNull();
    }
  });
});
