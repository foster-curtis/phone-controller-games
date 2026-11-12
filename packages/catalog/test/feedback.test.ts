import { describe, expect, it } from 'vitest';
import { FEEDBACK_ENTRY_IDS, FEEDBACK_FORM_URL, GAMES, feedbackUrl } from '../src/index.ts';

const BASE =
  'https://docs.google.com/forms/d/e/1FAIpQLSdPubA2byBsxMQwW150t_6hfZ8tZno02ZdCDnrVDpBAqcwtCg/viewform';

describe('feedbackUrl', () => {
  it('pre-fills one game', () => {
    expect(feedbackUrl('sunny-side')).toBe(`${BASE}?usp=pp_url&entry.1611048359=Yes`);
    expect(feedbackUrl('fort-frenzy')).toBe(`${BASE}?usp=pp_url&entry.1921122279=Yes`);
    expect(feedbackUrl('say-cheese')).toBe(`${BASE}?usp=pp_url&entry.222963833=Yes`);
  });

  it('pre-fills several games, once each, in the order given', () => {
    expect(feedbackUrl(['say-cheese', 'sunny-side', 'say-cheese'])).toBe(
      `${BASE}?usp=pp_url&entry.222963833=Yes&entry.1611048359=Yes`,
    );
  });

  it('returns the plain form for an unknown id', () => {
    expect(feedbackUrl('egg-toss')).toBe(BASE);
    expect(feedbackUrl([])).toBe(BASE);
    // Not fooled by Object.prototype keys.
    expect(feedbackUrl('constructor')).toBe(BASE);
    expect(FEEDBACK_FORM_URL).toBe(BASE);
  });

  it('skips unknown ids among known ones', () => {
    expect(feedbackUrl(['egg-toss', 'fort-frenzy'])).toBe(
      `${BASE}?usp=pp_url&entry.1921122279=Yes`,
    );
  });

  it('keys every entry by a real catalog id', () => {
    const ids = GAMES.map((g) => g.id);
    for (const key of Object.keys(FEEDBACK_ENTRY_IDS)) expect(ids).toContain(key);
    for (const entry of Object.values(FEEDBACK_ENTRY_IDS)) expect(entry).toMatch(/^entry\.\d+$/);
  });
});
