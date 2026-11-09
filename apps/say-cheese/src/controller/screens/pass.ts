// Pass screen (SPEC §6.3.1, §6.7): a shared phone's seat is the photographer, so the phone shows
// "Pass the phone to {name}" and a big "I'm {name}" that leads to Announce (`seatConfirm`).
import { el } from '@pcg/controller-kit';
import type { Ctx } from '../ctx';
import type { Screen } from '../../shared/messages';
import { button, chip, heading, para, renderedView, type View } from './view';

export function passView(first: Screen, ctx: Ctx): View {
  let confirmed = -1;
  return renderedView('pass', first, (s) => {
    const color = s.seats.find((x) => x.seat === s.seat)?.color;
    return [
      heading('Pass the phone'),
      para(`Pass the phone to ${s.name}`),
      color ? el('div', { class: 'me' }, chip(s.name, color, 'chip--big')) : null,
      button(
        `I'm ${s.name}`,
        () => {
          confirmed = s.seat;
          ctx.send({ t: 'seatConfirm', seat: s.seat });
        },
        { id: 'imSeat', disabled: confirmed === s.seat },
      ),
    ];
  });
}
