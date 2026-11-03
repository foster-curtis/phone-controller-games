// Host leader controls (SPEC §6.5, §6.6): buttons + keyboard, no hover. Pure mapping from the TV view
// to the available controls, so buttons and keys can't disagree. Emits `HostControl` (match/types).
import type { HostControl, TvView } from './match/types';

export interface ControlSpec {
  label: string;
  control: HostControl;
  primary?: boolean;
  disabled?: boolean;
  /** Key hint shown on the button. */
  key?: string;
}

/** The controls the host can use in this view; the first `primary` one is bound to Enter / →. */
export function controlsFor(view: TvView): ControlSpec[] {
  switch (view.phase) {
    case 'lobby':
      return [
        {
          label: view.canStart ? 'Start' : 'Start (3+ players, all ready)',
          control: { action: 'start' },
          primary: true,
          disabled: !view.canStart,
          key: 'Enter',
        },
        { label: 'How to play', control: { action: 'howToPlay' } },
      ];
    case 'rules':
      return [
        {
          label: view.card >= view.cards - 1 ? "Let's play!" : 'Next',
          control: { action: 'next' },
          primary: true,
          key: 'Enter',
        },
        { label: 'Skip', control: { action: 'skip' }, key: 'Esc' },
      ];
    case 'review':
      return view.canSkipReview
        ? [{ label: 'Skip review', control: { action: 'skipReview' }, primary: true, key: 'Enter' }]
        : [];
    case 'results':
      return [
        {
          label: view.last ? 'Final results' : 'Next photographer',
          control: { action: 'next' },
          primary: true,
          key: 'Enter',
        },
      ];
    case 'matchEnd':
      return [
        { label: 'Rematch', control: { action: 'rematch' }, primary: true, key: 'R' },
        { label: 'Back to lobby', control: { action: 'lobby' }, key: 'L' },
      ];
    default:
      return [];
  }
}

/** Keyboard binding for a key press in this view, or null (SPEC §6.5: Enter/→ primary, Esc Skip, R, L). */
export function controlForKey(view: TvView, key: string): HostControl | null {
  const specs = controlsFor(view).filter((s) => !s.disabled);
  const k = key.length === 1 ? key.toLowerCase() : key;
  if (k === 'Enter' || k === 'ArrowRight') return specs.find((s) => s.primary)?.control ?? null;
  if (k === 'Escape') return specs.find((s) => s.control.action === 'skip')?.control ?? null;
  if (k === 'r') return specs.find((s) => s.control.action === 'rematch')?.control ?? null;
  if (k === 'l') return specs.find((s) => s.control.action === 'lobby')?.control ?? null;
  return null;
}

/** Listens for host keys on `target`; returns the remover. `getView` is read at press time. */
export function installHostKeys(
  target: Pick<Document, 'addEventListener' | 'removeEventListener'>,
  getView: () => TvView | null,
  emit: (c: HostControl) => void,
): () => void {
  const onKey = (e: Event) => {
    const ev = e as KeyboardEvent;
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    const view = getView();
    const control = view ? controlForKey(view, ev.key) : null;
    if (!control) return;
    ev.preventDefault();
    emit(control);
  };
  target.addEventListener('keydown', onKey);
  return () => target.removeEventListener('keydown', onKey);
}
