// TV pass view (SPEC §6.2 step 0, §6.3.1): "Pass the phone to {name}" while a shared phone's seat is
// about to be the photographer.
import { icon } from '../../shared/icons';
import type { TvView } from '../match/types';
import { chip, h } from './dom';

export function renderPass(v: Extract<TvView, { phase: 'pass' }>): HTMLElement {
  const el = h('section', 'view pass');
  const mark = h('p', 'icon');
  mark.append(icon('phone'));
  el.append(mark, h('p', 'h2', 'Pass the phone to'), chip(v.photographer, 'chip huge'));
  return el;
}
