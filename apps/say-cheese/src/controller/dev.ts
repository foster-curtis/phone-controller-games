// Offline dev mode (`play.html?dev=1`, SPEC §6.7, PLATFORM §3): no relay. A local fake client drives the
// real app; a switcher walks through every screen with sample data, with a fake camera.
import { createDevHarness, createLocalClient } from '@pcg/controller-kit';
import type {
  PlayerColorId,
  PlayerSummary,
  Screen,
  ScreenBase,
  Standing,
  TagView,
} from '../shared/messages';
import { createApp } from './app';
import { createFakeCamera } from './fakeCamera';

const P = (n: number, name: string, color: PlayerColorId): PlayerSummary => ({
  playerId: `k${n}#0`,
  name,
  color,
});
const me = P(1, 'Ana', 'crimson');
const others = [P(2, 'Bo', 'cobalt'), P(3, 'Cy', 'jade'), P(4, 'Di', 'berry')];

const base = (isLeader = true): ScreenBase => ({
  leaderName: 'Ana',
  isLeader,
  seats: [{ seat: 0, name: me.name, color: me.color }],
  canEmoji: true,
});
const round = (role: 'photographer' | 'dodger') => ({
  r: 1,
  round: 2,
  rounds: 4,
  role,
  photographer: role === 'photographer' ? me : others[0]!,
});
const standings: Standing[] = [me, ...others].map((p, i) => ({
  ...p,
  score: 3 - i,
  connected: true,
  left: false,
}));
const tags: TagView[] = [
  { tagId: 't1', photo: 0, x: 0.3, y: 0.4, playerId: others[0]!.playerId },
  { tagId: 't2', photo: 0, x: 0.7, y: 0.55, playerId: null },
];
const photos = [0, 1, 2].map((index) => ({ index, aspect: 4 / 3 }));

export function sampleScreens(): Record<string, Screen> {
  const lobbyPlayers = [me, ...others].map((p, i) => ({
    ...p,
    phoneId: `ph${i}`,
    ready: i > 0,
    camera: 'ok' as const,
    connected: true,
  }));
  return {
    joining: { ...base(), kind: 'joining', seats: [] },
    lobby: {
      ...base(),
      kind: 'lobby',
      players: lobbyPlayers,
      ready: false,
      camera: 'unknown',
      canStart: true,
      canAddSeat: true,
    },
    rules: { ...base(), kind: 'rules', card: 0, cards: 5 },
    pass: { ...base(), kind: 'pass', seat: 1, name: 'Bo' },
    'announce (photographer)': { ...base(), ...round('photographer'), kind: 'announce' },
    'announce (dodger)': { ...base(), ...round('dodger'), kind: 'announce' },
    'scatter (photographer)': {
      ...base(),
      ...round('photographer'),
      kind: 'scatter',
      endsInMs: 10_000,
    },
    'scatter (dodger)': { ...base(), ...round('dodger'), kind: 'scatter', endsInMs: 10_000 },
    'shoot (photographer)': {
      ...base(),
      ...round('photographer'),
      kind: 'shoot',
      endsInMs: 20_000,
      shots: 0,
      maxShots: 15,
    },
    'shoot (dodger)': {
      ...base(),
      ...round('dodger'),
      kind: 'shoot',
      endsInMs: 20_000,
      shots: 0,
      maxShots: 15,
    },
    upload: { ...base(), ...round('dodger'), kind: 'upload', received: 4, expected: 9 },
    'review (photographer)': {
      ...base(),
      ...round('photographer'),
      kind: 'review',
      photos,
      photo: 0,
      tags,
      candidates: others,
      canSkipReview: false,
    },
    'review (dodger)': {
      ...base(false),
      ...round('dodger'),
      kind: 'review',
      photos,
      photo: 1,
      tags,
      candidates: others,
      canSkipReview: false,
    },
    results: {
      ...base(),
      ...round('dodger'),
      kind: 'results',
      caught: [{ ...me, count: 2 }],
      photographerDelta: -2,
      standings,
      last: false,
    },
    matchEnd: { ...base(), kind: 'matchEnd', standings, winners: [me.playerId] },
    spectating: { ...base(false), kind: 'spectating' },
    left: { ...base(false), kind: 'left' },
  };
}

export function startDev(root: HTMLElement): void {
  const harness = createDevHarness(root);
  const client = createLocalClient();
  const camera = createFakeCamera();
  const app = createApp({
    root: harness.stage,
    client,
    camera,
    photoUrl: (_r, photo) => {
      const c = document.createElement('canvas');
      c.width = 400;
      c.height = 300;
      const g = c.getContext('2d');
      if (!g) return null;
      g.fillStyle = `hsl(${photo * 80} 50% 40%)`;
      g.fillRect(0, 0, 400, 300);
      return c.toDataURL('image/jpeg', 0.5);
    },
    platform: { fullscreen: false, wakeLock: false },
  });
  const samples = sampleScreens();
  harness.addRow(
    'screen',
    Object.entries(samples).map(([id, screen]) => ({
      id,
      onClick: () => client.emit({ t: 'screen', screen }),
    })),
  );
  harness.addRow('overlay', [
    { id: 'reconnecting', onClick: () => client.setStatus('reconnecting') },
    { id: 'open', onClick: () => client.setStatus('open') },
    { id: 'hostAway', onClick: () => client.setHostStatus('away') },
    { id: 'hostBack', onClick: () => client.setHostStatus('present') },
    { id: 'kicked', onClick: () => client.kick() },
  ]);
  void camera.enable();
  void app;
  const sent = () => harness.setReadout(`sent: ${JSON.stringify(client.sent.at(-1) ?? null)}`);
  const orig = client.send.bind(client);
  client.send = (d) => {
    orig(d);
    sent();
  };
  client.emit({ t: 'screen', screen: samples.lobby });
}
