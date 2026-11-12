// Player-feedback survey links (PLATFORM §4, decision #11). The only place the Google Form's URLs and
// pre-fill entry IDs live: the games' end screens call `feedbackUrl`, the gallery links
// `FEEDBACK_FORM_URL`. Never write a form URL anywhere else.

/** The form itself, nothing pre-filled. */
export const FEEDBACK_FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSdPubA2byBsxMQwW150t_6hfZ8tZno02ZdCDnrVDpBAqcwtCg/viewform';

/** Google's short link to the same form (not pre-filled), for print or speech. */
export const FEEDBACK_SHORT_URL = 'https://forms.gle/fmhUQ4hVVYupALmP6';

/**
 * Catalog game id → the form's entry id for its "Did you play <game>?" question. Answering it "Yes"
 * takes the player straight to that game's questions.
 *
 * These ids belong to Google, not to us: they CHANGE if the form is rebuilt or a question is
 * deleted and re-added. Get the new ones from the form's "Get pre-filled link" and update them here.
 * A game with no entry gets the plain form.
 */
export const FEEDBACK_ENTRY_IDS: Readonly<Record<string, string>> = {
  'sunny-side': 'entry.1611048359',
  'fort-frenzy': 'entry.1921122279',
  'say-cheese': 'entry.222963833',
};

/**
 * The form with "Did you play <game>?" answered "Yes" for each game given. Unknown ids are skipped;
 * with no known id left this is the plain `FEEDBACK_FORM_URL`.
 */
export function feedbackUrl(gameIds: string | readonly string[]): string {
  const ids = typeof gameIds === 'string' ? [gameIds] : gameIds;
  const params = new URLSearchParams({ usp: 'pp_url' });
  let known = false;
  for (const id of ids) {
    if (!Object.hasOwn(FEEDBACK_ENTRY_IDS, id)) continue;
    params.set(FEEDBACK_ENTRY_IDS[id]!, 'Yes');
    known = true;
  }
  return known ? `${FEEDBACK_FORM_URL}?${params}` : FEEDBACK_FORM_URL;
}
