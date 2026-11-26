// DEV-ONLY fallback How to play cards (SPEC §6.19 outline, short text) so `?ui=rules` and the host
// shell render before TF15 delivers `src/content/rules.ts`. Not release copy (BUILD_PLAN §8, TF6).
import type { RulesCard } from '@pcg/game-kit';
import markUrl from '../../../../brand/mark.svg?url';

const coin = (n: number): RulesCard['illustration'] => ({
  mount(slot) {
    const img = document.createElement('img');
    img.className = 'tv-rules-art';
    img.src = markUrl;
    img.alt = '';
    img.dataset.n = String(n);
    slot.append(img);
    return { destroy: () => img.remove() };
  },
});

const CARD_TEXT: readonly (readonly [string, string])[] = [
  ['Blend in.', 'You are one of the shoppers. Your phone shows your outfit.'],
  ['Most denarii wins.', 'Buy cheap, sell to shoppers, or help yourself.'],
  ['Swipe from the counter.', 'Browse a stall, hold GRAB on an item.'],
  ['Pickpocket.', 'Get behind someone and hold.'],
  ['Distract.', 'Toss a coin and the merchant walks over to get it.'],
  ['Guards.', "Don't get seen in the act."],
  ['Catch other thieves.', 'Grab them mid-steal, or tip the guard.'],
];

export const PLACEHOLDER_CARDS: readonly RulesCard[] = CARD_TEXT.map(([title, body], i) => ({
  title,
  body,
  illustration: coin(i + 1),
}));
