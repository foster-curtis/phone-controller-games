// `/play?dev=1` offline controller (SPEC §12.7; AGENTS.md): the controller-kit dev harness with a fake
// client playing canned host messages for every screen. Stub entry: TF5 builds it; until then it runs
// the scaffold app against a fake client that answers the join.
// Frozen at TF0 (BUILD_PLAN §3): the `mount(root)` signature. Never imports Phaser or host code.
import { createLocalClient } from '@pcg/controller-kit';
import { isPhoneMsg } from '../shared/messages';
import { createApp } from './app';

export function mount(root: HTMLElement): void {
  const client = createLocalClient();
  const send = client.send.bind(client);
  client.send = (d: unknown) => {
    send(d);
    if (isPhoneMsg(d) && d.t === 'join')
      queueMicrotask(() => client.emit({ t: 'joined', name: d.name }));
  };
  createApp({ root, client, code: 'DEVV' });
}
